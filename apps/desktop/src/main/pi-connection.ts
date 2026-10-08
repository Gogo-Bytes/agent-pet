import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, rmdir } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import type { AdapterHandle, ObservationSink } from '@agent-pet/adapter-core';
import type { PiBridgeAdapter } from '@agent-pet/adapter-pi';
import type { PiBridgeConfig } from './pi-config.js';
import type { PreflightState } from '../shared/pi-preflight.js';
import type { PiConnectionState } from '../shared/pi-connection.js';
import { PiTemporaryDeployment, type TemporaryDeploymentPreview, type TemporaryDeploymentReceipt } from './pi-temp-deployment.js';

type Plan = { id: string; revision: number; deployment: PiTemporaryDeployment; preview: TemporaryDeploymentPreview;
  config: PiBridgeConfig; root: string };

/** One explicit, process-local desktop deployment. Never adopts/replaces an env bridge or old artifact. */
export class PiConnection {
  private state: PiConnectionState;
  private plan: Plan | undefined;
  private generation = 0;
  private pending: Promise<PiConnectionState> | undefined;
  private closed = false;
  private handle: AdapterHandle | undefined;
  private runtime: { path: string; stat: Stats } | undefined;
  private owned: { deployment: PiTemporaryDeployment; receipt: TemporaryDeploymentReceipt } | undefined;
  private listeners = new Set<(state: PiConnectionState) => void>();
  constructor(private readonly options: {
    target(): PreflightState;
    adapter: Pick<PiBridgeAdapter, 'start'>;
    publish: ObservationSink['publish'];
    developmentEnvironment: boolean;
  }) {
    this.state = { revision: 0, status: 'not-configured', mode: options.developmentEnvironment ? 'development-env' : 'desktop',
      busy: false, canConfigure: !options.developmentEnvironment, preview: null, deployedPath: null, canRemove: false, notice: 'none' };
  }
  snapshot(): PiConnectionState { return structuredClone(this.state); }
  subscribe(listener: (state: PiConnectionState) => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  private emit(): PiConnectionState {
    this.state.revision++;
    const state = this.snapshot();
    for (const listener of this.listeners) listener(state);
    return state;
  }
  // Legacy reports the latest validated hello/close, not managed auth/ack or aggregate peer health.
  connectionChanged(state: 'connected' | 'degraded' | 'disconnected'): void {
    this.state.status = state === 'degraded' ? 'failed' : state;
    this.emit();
  }
  developmentStarted(ok: boolean): void {
    this.state.status = ok ? 'configured-waiting' : 'failed';
    this.state.notice = ok ? 'none' : 'start-failed'; this.emit();
  }
  invalidate(): PiConnectionState {
    this.generation++;
    if (this.plan) this.plan.deployment.cancel(this.plan.preview);
    this.plan = undefined; this.state.preview = null;
    return this.emit();
  }
  private run(work: () => Promise<void>): Promise<PiConnectionState> {
    if (this.closed) return Promise.resolve(this.snapshot());
    if (this.pending) return Promise.resolve({ ...this.snapshot(), notice: 'busy' });
    this.state.busy = true; this.state.notice = 'none'; this.emit();
    const operation = Promise.resolve().then(work).finally(() => {
      this.pending = undefined; this.state.busy = false; this.emit();
    }).then(() => this.snapshot());
    this.pending = operation;
    return operation;
  }
  private targetMatches(revision: number, path: string): boolean {
    const current = this.options.target();
    return current.revision === revision && current.target.source === 'chosen' && current.target.path === path;
  }
  preview(): Promise<PiConnectionState> {
    // Even a repeated preview invalidates the previous confirmation; work remains single-flight.
    this.invalidate();
    if (!this.state.canConfigure || this.closed) return Promise.resolve(this.snapshot());
    const target = this.options.target();
    if (target.target.source !== 'chosen') {
      this.state.notice = 'choose-target'; return Promise.resolve(this.emit());
    }
    const generation = this.generation;
    return this.run(async () => {
      try {
        // Short fixed system-temp parent, not HOME/userData/TMPDIR (macOS UDS length limit).
        // Merely reserve unpredictable names in memory here: preview/cancel has zero writes/listeners.
        const root = `/tmp/ap-${randomBytes(12).toString('hex')}`;
        const config = { endpoint: `${root}/p.sock`, token: randomBytes(32).toString('hex') };
        const deployment = new PiTemporaryDeployment(target.target.path, config);
        const preview = await deployment.preview();
        if (generation !== this.generation || !this.targetMatches(target.revision, target.target.path) || this.closed) {
          deployment.cancel(preview); return;
        }
        const id = randomUUID();
        this.plan = { id, revision: target.revision, deployment, preview, config, root };
        this.state.preview = { id, target: preview.target, path: preview.path, action: preview.action,
          findings: preview.findings, createDirectories: preview.createDirectories };
      } catch { if (generation === this.generation) this.state.notice = 'preview-failed'; }
    });
  }
  confirm(id: unknown): Promise<PiConnectionState> {
    const plan = this.plan;
    if (this.pending) return Promise.resolve({ ...this.snapshot(), notice: 'busy' });
    if (this.closed || !this.state.canConfigure || typeof id !== 'string' || id.length > 80 || !plan ||
        id !== plan.id || !this.targetMatches(plan.revision, plan.preview.target.path) || plan.preview.action !== 'create') {
      this.invalidate(); this.state.notice = 'invalid-plan'; return Promise.resolve(this.emit());
    }
    // Keep the WeakMap identity entirely in Main; consume the sole opaque id before awaiting.
    this.plan = undefined; this.state.preview = null;
    const generation = this.generation;
    return this.run(async () => {
      try {
        await mkdir(plan.root, { mode: 0o700 }); // exclusive; EEXIST is never permission to unlink/adopt
        this.runtime = { path: plan.root, stat: await lstat(plan.root) };
        if (!this.runtime.stat.isDirectory() || (this.runtime.stat.mode & 0o777) !== 0o700) throw new Error();
      } catch {
        plan.deployment.cancel(plan.preview);
        this.state.status = 'failed'; this.state.notice = 'runtime-failed'; this.state.canConfigure = false;
        return;
      }
      if (generation !== this.generation || this.closed || !this.targetMatches(plan.revision, plan.preview.target.path)) {
        plan.deployment.cancel(plan.preview); await this.releaseRuntime(); return;
      }
      // No automatic retry/reconfiguration or credential persistence in this slice.
      this.state.canConfigure = false;
      const applied = await plan.deployment.apply(plan.preview);
      if (applied.status !== 'deployed') {
        this.state.status = 'failed';
        this.state.notice = applied.status === 'stale-plan' ? 'stale-plan' : 'deploy-failed-preserved';
        await this.releaseRuntime(); return;
      }
      this.owned = { deployment: plan.deployment, receipt: applied.receipt };
      this.state.deployedPath = applied.receipt.path; this.state.canRemove = true;
      if (this.closed) { this.state.status = 'disconnected'; return; }
      try {
        this.state.status = 'configured-waiting';
        this.handle = await this.options.adapter.start(plan.config, {
          publish: this.options.publish, connectionChanged: state => this.connectionChanged(state),
        });
      } catch {
        // Deployed file/receipt and uncertain runtime are retained, never reported as connected.
        this.state.status = 'failed'; this.state.notice = 'start-failed';
      }
    });
  }
  remove(): Promise<PiConnectionState> {
    this.invalidate();
    return this.run(async () => {
      if (!this.owned) { this.state.notice = 'retained-unknown'; return; }
      try { await this.stopHandle(); }
      catch { this.state.status = 'failed'; this.state.notice = 'failed-preserved'; return; }
      const result = await this.owned.deployment.withdraw(this.owned.receipt);
      this.state.notice = result.file;
      this.state.status = result.file === 'removed' ? 'not-configured' : 'disconnected';
      if (result.file !== 'failed-preserved') { this.owned = undefined; this.state.canRemove = false; }
      if (result.file === 'removed') this.state.deployedPath = null;
      await this.releaseRuntime();
    });
  }
  private async stopHandle(): Promise<void> {
    if (!this.handle) return;
    await this.handle.stop(); this.handle = undefined;
  }
  private async releaseRuntime(): Promise<void> {
    const runtime = this.runtime;
    if (!runtime) return;
    try {
      const now = await lstat(runtime.path);
      if (now.dev !== runtime.stat.dev || now.ino !== runtime.stat.ino || now.birthtimeMs !== runtime.stat.birthtimeMs ||
          now.uid !== runtime.stat.uid || now.mode !== runtime.stat.mode) return;
      await rmdir(runtime.path); // empty-only; never unlink any socket or unknown content
      this.runtime = undefined;
    } catch { /* Preserve uncertain/nonempty runtime directory. */ }
  }
  async stop(): Promise<void> {
    this.closed = true; this.invalidate();
    await this.pending;
    await this.stopHandle();
    await this.releaseRuntime();
    this.state.status = this.state.deployedPath ? 'disconnected' : 'not-configured';
    this.state.notice = 'stopped'; this.emit();
  }
}
