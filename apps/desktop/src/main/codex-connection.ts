import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { SessionObservation } from '@agent-pet/domain';
import type { CodexConnectionState } from '../shared/codex-connection.js';
import { CodexNormalObserver } from './codex-normal-observer.js';
import { CodexRegistrationStore } from './codex-registration-store.js';
import { inspectCodexExecutable, resolveCodexHostExecutable } from './codex-executable.js';
import { createCodexNormalHookDocument, codexHookEvents } from '../../../../integrations/codex-hooks/hook-source.js';
import { prepareCodexUserHook, applyCodexUserHook, inspectCodexUserHook, withdrawCodexUserHook, type CodexHookPlan } from './codex-user-hook.js';
export interface CodexConnectionOptions {
  directory: string; configurationId: string; targetDirectory: string;
  nodeExecutable: string; observerExecutable: string; probePath: string; runAsNode: boolean;
  chooseExecutable(): Promise<string | null>; inspectExecutable?(path: string): string | null;
  runtimeAssets(): Promise<{ nativeHook: string }>;
  name(): string; publish(observation: SessionObservation): void;
  /** Explicit self-owned fixture seam; never selected by Renderer. */
  startBridge?: NonNullable<ConstructorParameters<typeof CodexNormalObserver>[0]['startBridge']>;
}
/** Own registration, passive observation and selective withdrawal. Never starts or controls Codex. */
export class CodexConnection {
  private readonly store: CodexRegistrationStore;
  private observer: CodexNormalObserver | undefined;
  private readonly runtimeDirectory: string;
  private readonly listeners = new Set<() => void>();
  private plan: { id: string; executable: string; source: string; hook: CodexHookPlan } | undefined;
  private status: CodexConnectionState['status'] = 'not-configured';
  private notice: CodexConnectionState['notice'] = 'none';
  private busy = false; private closed = false; private configured = false; private generation = 0; private revision = 0;
  constructor(private readonly options: CodexConnectionOptions) {
    this.runtimeDirectory = join(options.directory, `codex-normal-${options.configurationId}`);
    this.store = new CodexRegistrationStore(join(options.directory, `codex-registration-${options.configurationId}`), options.configurationId, options.targetDirectory);
    const saved = this.store.read(); this.configured = !!saved;
    if (this.store.error) { this.status = 'failed'; this.notice = 'saved-invalid'; }
    else if (saved) this.status = saved.disabled || saved.removed ? 'disabled' : 'waiting';
  }
  snapshot(): CodexConnectionState {
    const current = this.observer?.snapshot();
    return { revision: this.revision, status: this.status === 'waiting' || this.status === 'observing' ?
      current?.status === 'observing' ? 'observing' : this.status === 'observing' ? 'waiting' : this.status : this.status,
      configured: this.configured, busy: this.busy, observedSessions: current?.observedSessions ?? 0,
      notice: this.notice, canConfigure: !this.closed && !this.busy && !this.configured && !this.store.error,
      canResume: !this.closed && !this.busy && this.configured && !this.observer && !this.store.error,
      preview: this.plan ? { id: this.plan.id, executable: this.plan.executable, path: this.plan.hook.path,
        exists: this.plan.hook.exists, canApply: this.plan.hook.canApply, events: [...codexHookEvents] } : null };
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit() { this.revision++; for (const listener of this.listeners) listener(); return this.snapshot(); }
  invalidate() { ++this.generation; this.plan = undefined; return this.emit(); }
  private document() { return createCodexNormalHookDocument(this.options.nodeExecutable, join(this.runtimeDirectory, 'observer.cjs'),
    join(this.runtimeDirectory, 'activation.json'), this.options.runAsNode); }
  private validOwnership(command: string): boolean {
    const expected = JSON.parse(this.document()) as { hooks: { SessionStart: { hooks: { command: string }[] }[] } };
    return command === expected.hooks.SessionStart[0]!.hooks[0]!.command;
  }
  private createObserver(executable: string) {
    return new CodexNormalObserver({ ...this.options, directory: this.runtimeDirectory, executable,
      onChange: () => { if (!this.closed) this.emit(); } });
  }
  async preview(discoveredExecutable?: string): Promise<CodexConnectionState> {
    if (!this.snapshot().canConfigure) return this.snapshot();
    const generation = ++this.generation; this.plan = undefined; this.busy = true; this.notice = 'none'; this.emit();
    try {
      const chosen = discoveredExecutable ?? await this.options.chooseExecutable(); if (this.closed || generation !== this.generation || !chosen) return this.snapshot();
      const inspect = this.options.inspectExecutable ?? inspectCodexExecutable;
      const cli = inspect(chosen);
      const executable = cli && resolveCodexHostExecutable(cli, this.options.targetDirectory, inspect);
      if (!executable) { this.notice = 'unsupported-installation'; return this.snapshot(); }
      const { nativeHook: source } = await this.options.runtimeAssets();
      if (this.closed || generation !== this.generation) return this.snapshot();
      if (!source || Buffer.byteLength(source) > 512 * 1024) throw new Error();
      const hook = prepareCodexUserHook(this.options.targetDirectory, this.document());
      this.plan = { id: randomUUID(), executable, source, hook };
    } catch { if (generation === this.generation) this.notice = 'preview-failed'; }
    finally { this.busy = false; this.emit(); }
    return this.snapshot();
  }
  async confirm(id: string): Promise<CodexConnectionState> {
    const plan = this.plan;
    if (this.closed || this.busy || !plan || plan.id !== id || !plan.hook.canApply || !plan.hook.ownership) {
      this.notice = 'stale-preview'; return this.emit();
    }
    this.plan = undefined; this.busy = true; const generation = ++this.generation; this.emit();
    try {
      if ((this.options.inspectExecutable ?? inspectCodexExecutable)(plan.executable) !== plan.executable) throw new Error();
      if (!this.store.initialize({ schemaVersion: 1, configurationId: this.options.configurationId, target: this.options.targetDirectory,
        executable: plan.executable, disabled: true, removed: false, ownership: plan.hook.ownership, original: plan.hook.original })) throw new Error();
      this.configured = true; this.observer = this.createObserver(plan.executable);
      if (!await this.observer.initialize(plan.source)) throw new Error();
      if (this.closed || generation !== this.generation) throw new Error();
      if (!applyCodexUserHook(plan.hook) || !this.store.update(false)) throw new Error();
      this.status = 'waiting'; this.notice = 'none';
    } catch { await this.closeObserver(); this.status = 'failed'; this.notice = 'save-failed'; }
    finally { this.busy = false; this.emit(); }
    return this.snapshot();
  }
  private async closeObserver() { const observer = this.observer; this.observer = undefined; await observer?.stop(); }
  async resume(): Promise<CodexConnectionState> {
    if (!this.snapshot().canResume) return this.snapshot();
    this.busy = true; ++this.generation; this.emit();
    try {
      const saved = this.store.read();
      if (!saved || saved.removed || !this.validOwnership(saved.ownership.command) || !inspectCodexUserHook(saved.ownership) ||
          (this.options.inspectExecutable ?? inspectCodexExecutable)(saved.executable) !== saved.executable) throw new Error();
      this.observer = this.createObserver(saved.executable);
      if (!await this.observer.restore() || this.closed || !this.store.update(false)) throw new Error();
      this.status = 'waiting'; this.notice = 'none';
    } catch { await this.closeObserver(); this.status = 'failed'; this.notice = 'saved-invalid'; }
    finally { this.busy = false; this.emit(); }
    return this.snapshot();
  }
  async restore() { const saved = this.store.read(); if (saved && !saved.disabled && !saved.removed) await this.resume(); }
  async disable(): Promise<CodexConnectionState> {
    if (this.closed || this.busy) return this.snapshot();
    this.busy = true; this.invalidate();
    try { await this.closeObserver();
      if (this.configured && !this.store.update(true)) throw new Error();
      this.status = this.configured ? 'disabled' : 'not-configured'; this.notice = 'none';
    } catch { this.status = 'failed'; this.notice = 'save-failed'; }
    finally { this.busy = false; this.emit(); }
    return this.snapshot();
  }
  async remove(): Promise<boolean> {
    if (this.closed || this.busy || this.store.error) return false;
    await this.disable();
    if (this.store.error) return false;
    if (!this.configured) return true;
    const saved = this.store.read();
    if (!saved || !this.validOwnership(saved.ownership.command) || !withdrawCodexUserHook(saved.ownership) || !this.store.update(true, true)) {
      this.notice = 'retained'; this.status = 'failed'; this.emit(); return false;
    }
    return true; // Private runtime survives hooks already loaded by a running daemon.
  }
  async stop() { this.closed = true; ++this.generation; this.plan = undefined; await this.closeObserver(); this.listeners.clear(); }
}
