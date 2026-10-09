import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, rmdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AdapterHandle, ObservationSink } from '@agent-pet/adapter-core';
import type { PiBridgeAdapter } from '@agent-pet/adapter-pi';
import type { PiBridgeConfig } from './pi-config.js';
import type { PreflightState } from '../shared/pi-preflight.js';
import type { PiConnectionState } from '../shared/pi-connection.js';
import { PiTemporaryDeployment, type TemporaryDeploymentPreview, type TemporaryDeploymentReceipt } from './pi-temp-deployment.js';

import { PiConnectionStore, sameIdentity, type SavedConnection } from './pi-connection-store.js';
import { saveStat, type SavedStat } from './pi-temp-deployment.js';

type Plan = { id: string; revision: number; deployment: PiTemporaryDeployment; preview: TemporaryDeploymentPreview;
  config: PiBridgeConfig; root: string };

/** One explicit desktop deployment, with optional host-only durable ownership. Never adopts/replaces an env bridge or old artifact. */
export class PiConnection {
  private state: PiConnectionState;
  private plan: Plan | undefined;
  private generation = 0;
  private pending: Promise<PiConnectionState> | undefined;
  private closed = false;
  private handle: AdapterHandle | undefined;
  private runtime: { path: string; stat: SavedStat } | undefined;
  private owned: { deployment: PiTemporaryDeployment; receipt: TemporaryDeploymentReceipt } | undefined;
  private saved: SavedConnection | undefined;
  private callbackEpoch = 0;
  private listeners = new Set<(state: PiConnectionState) => void>();
  constructor(private readonly options: {
    target(): PreflightState;
    adapter: Pick<PiBridgeAdapter, 'start'>;
    publish: ObservationSink['publish'];
    developmentEnvironment: boolean;
    store?: PiConnectionStore;
  }) {
    this.state = { revision: 0, status: 'not-configured', mode: options.developmentEnvironment ? 'development-env' : 'desktop',
      busy: false, canConfigure: !options.developmentEnvironment, preview: null, deployedPath: null, canRemove: false, canResume: false, receiving: 'stopped', saved: 'none', notice: 'none' };
    if (!options.developmentEnvironment && options.store) {
      if (options.store.error) {
        this.state.status = 'failed'; this.state.notice = 'saved-invalid'; this.state.saved = 'invalid'; this.state.canConfigure = false;
      } else {
        const saved = options.store.snapshot();
        if (saved) {
          this.saved = saved;
          const deployment = new PiTemporaryDeployment(saved.target, saved.config);
          this.owned = { deployment, receipt: deployment.restoreOwnership(saved.ownership) };
          this.runtime = { path: dirname(saved.config.endpoint), stat: saved.runtime };
          this.state.deployedPath = this.owned.receipt.path; this.state.canRemove = true; this.state.canResume = true;
          this.state.canConfigure = false; this.state.status = 'disconnected';
          this.state.saved = saved.disabled ? 'disabled' : 'ready'; this.state.notice = 'resume-required';
        }
      }
    }
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
    if (this.closed || (!this.options.developmentEnvironment && this.state.receiving !== 'active')) return;
    this.state.status = state === 'degraded' ? 'failed' : state;
    this.emit();
  }
  developmentStarted(ok: boolean): void {
    this.state.receiving = ok ? 'active' : 'stopped';
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
        const stat = await lstat(plan.root);
        if (!stat.isDirectory() || (stat.mode & 0o7777) !== 0o700 || stat.uid !== process.getuid?.()) throw new Error();
        this.runtime = { path: plan.root, stat: saveStat(stat) };
      } catch {
        plan.deployment.cancel(plan.preview);
        this.state.status = 'failed'; this.state.notice = 'runtime-failed'; this.state.canConfigure = false;
        return;
      }
      if (generation !== this.generation || this.closed || !this.targetMatches(plan.revision, plan.preview.target.path)) {
        plan.deployment.cancel(plan.preview); await this.releaseRuntime(); return;
      }
      // Deployment must finish before its exact ownership can be saved; failure retains the receipt.
      this.state.canConfigure = false;
      const applied = await plan.deployment.apply(plan.preview);
      if (applied.status !== 'deployed') {
        this.state.status = 'failed';
        this.state.notice = applied.status === 'stale-plan' ? 'stale-plan' : 'deploy-failed-preserved';
        await this.releaseRuntime(); return;
      }
      this.owned = { deployment: plan.deployment, receipt: applied.receipt };
      this.state.deployedPath = applied.receipt.path; this.state.canRemove = true;
      if (this.options.store) {
        this.saved = { target: plan.preview.target.path, config: plan.config, runtime: this.runtime!.stat,
          ownership: plan.deployment.exportOwnership(applied.receipt), disabled: false };
        if (!this.persist(false)) return;
      }
      if (this.closed) { this.state.status = 'disconnected'; return; }
      await this.startAdapter(plan.config);
    });
  }
  private persist(disabled: boolean): boolean {
    if (!this.options.store || !this.saved) return true;
    const next = { ...this.saved, disabled };
    if (!this.options.store.save(next)) {
      this.state.saved = 'uncertain'; this.state.notice = 'save-failed'; this.state.status = 'failed'; this.state.canResume = false;
      return false;
    }
    this.saved = next; this.state.saved = disabled ? 'disabled' : 'ready'; return true;
  }
  private async startAdapter(config: PiBridgeConfig): Promise<void> {
    const epoch = ++this.callbackEpoch;
    this.state.canResume = false; this.state.receiving = 'active'; this.state.status = 'configured-waiting';
    try {
      this.handle = await this.options.adapter.start(config, {
        publish: value => { if (!this.closed && epoch === this.callbackEpoch) this.options.publish(value); },
        connectionChanged: state => { if (epoch === this.callbackEpoch) this.connectionChanged(state); },
      });
    } catch {
      // The legacy adapter rejects before returning a listening handle; it never adopts an existing endpoint.
      this.callbackEpoch++; this.state.receiving = 'stopped';
      this.state.status = 'failed'; this.state.notice = 'start-failed';
    }
  }
  resume(): Promise<PiConnectionState> {
    return this.run(async () => {
      if (!this.state.canResume || !this.saved || !this.runtime || !this.owned) return;
      try {
        const now = await lstat(this.runtime.path);
        if (!now.isDirectory() || !sameIdentity(now, this.runtime.stat) || (now.mode & 0o7777) !== 0o700 || now.uid !== process.getuid?.()) throw new Error();
        try { await lstat(this.saved.config.endpoint); throw new Error('Existing socket'); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        if (!await this.owned.deployment.matches(this.owned.receipt)) throw new Error();
      } catch { this.state.status = 'failed'; this.state.notice = 'resume-refused'; return; }
      if (!this.persist(false) || this.closed) return;
      await this.startAdapter(this.saved.config);
    });
  }
  private async disableReceiving(): Promise<boolean> {
    let stopped = true;
    try { await this.stopHandle(); }
    catch { stopped = false; this.state.receiving = 'unknown'; }
    const persisted = this.persist(true);
    if (!stopped) { this.state.status = 'failed'; this.state.notice = persisted ? 'stop-failed' : 'stop-save-failed'; return false; }
    this.state.status = 'disconnected';
    if (!persisted) return false;
    this.state.notice = 'disabled'; this.state.canResume = !!this.saved;
    return true;
  }
  disable(): Promise<PiConnectionState> {
    this.invalidate();
    return this.run(async () => { if (this.owned) await this.disableReceiving(); });
  }
  remove(): Promise<PiConnectionState> {
    this.invalidate();
    return this.run(async () => {
      if (!this.owned) { this.state.notice = 'retained-unknown'; return; }
      if (!await this.disableReceiving()) return;
      const result = await this.owned.deployment.withdraw(this.owned.receipt);
      this.state.notice = result.file;
      this.state.status = result.file === 'removed' ? 'not-configured' : 'disconnected';
      // A failed unlink remains retryable; edited artifacts also keep their durable evidence.
      if (result.file === 'removed') {
        this.owned = undefined; this.state.canRemove = false; this.state.canResume = false; this.state.deployedPath = null;
        if (this.options.store && !this.options.store.save(null)) {
          this.state.saved = 'uncertain'; this.state.notice = 'removed-save-failed'; this.state.canConfigure = false;
        } else {
          this.saved = undefined; this.state.saved = 'none'; this.state.canConfigure = !!this.options.store;
        }
        await this.releaseRuntime();
      } else if (!this.options.store && result.file !== 'failed-preserved') {
        this.owned = undefined; this.state.canRemove = false; await this.releaseRuntime();
      }
    });
  }
  private async stopHandle(): Promise<void> {
    this.callbackEpoch++; // Invalidate callbacks BEFORE awaiting stop, including late socket close/hello.
    if (this.handle) { await this.handle.stop(); this.handle = undefined; }
    this.state.receiving = 'stopped';
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
    try { await this.stopHandle(); }
    catch {
      this.state.receiving = 'unknown'; this.state.status = 'failed'; this.state.notice = 'stop-failed'; this.emit();
      throw new Error('Pi receiver shutdown not confirmed');
    }
    if (!this.saved) await this.releaseRuntime();
    this.state.status = this.state.deployedPath ? 'disconnected' : 'not-configured';
    this.state.notice = 'stopped'; this.emit();
  }
}
