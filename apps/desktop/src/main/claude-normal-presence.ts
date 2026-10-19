import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { ClaudeConnectionState } from '../shared/claude-connection.js';
import { startClaudeNativePresenceServer } from '../../../../integrations/claude-hooks/native-presence.js';
import type { ClaudeHookFact } from '../../../../integrations/claude-hooks/normalize.js';
import { inspectClaudeExecutable } from './claude-executable.js';
import { ClaudePresenceStore } from './claude-presence-store.js';
import { prepareClaudeUserHook, applyClaudeUserHook, inspectClaudeUserHook, withdrawClaudeUserHook,
  prepareClaudeUserHookUpgrade, CLAUDE_USER_HOOK_EVENTS, isClaudeUserHookOwnership, type HookPlan, type HookOwnership } from './claude-user-hook.js';

export interface ClaudeNormalPresenceOptions {
  directory: string; configurationId: string; targetDirectory: string;
  nodeExecutable: string; observerExecutable: string; probePath: string; runAsNode: boolean;
  runtimeAssets(): Promise<{ nativeHook?: string }>;
  chooseExecutable(): Promise<string | null>;
  inspectExecutable?(path: string): string | null;
  onFact?(delivery: { runId: string; fact: ClaudeHookFact }): void;
  onRetire?(runId: string): void;
}
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Persistent native hook registration. Only the OS-bound observer is started in Main;
 * normal Claude invocation and its existing settings remain owned by the user.
 */
export class ClaudeNormalPresence {
  private readonly directory: string;
  private readonly store: ClaudePresenceStore;
  private readonly listeners = new Set<(state: ClaudeConnectionState) => void>();
  private plan: { id: string; executable: string; source: string; hook: HookPlan; operation: 'configure' | 'upgrade' } | undefined;
  private server: Awaited<ReturnType<typeof startClaudeNativePresenceServer>> | undefined;
  private opening: ReturnType<typeof startClaudeNativePresenceServer> | undefined;
  private generation = 0;
  private observationEpoch = 0;
  private closed = false;
  private busy = false;
  private revision = 0;
  private configured = false;
  private status: ClaudeConnectionState['status'] = 'not-configured';
  private notice: ClaudeConnectionState['notice'] = 'none';
  private observedRuns = 0;
  private launchers = 0;
  private registrationVersion: 1 | 2 | undefined;
  private taskEvents = false;
  constructor(private readonly options: ClaudeNormalPresenceOptions) {
    this.directory = join(options.directory, `claude-normal-${options.configurationId}`);
    this.store = new ClaudePresenceStore(this.directory, options.configurationId, 'normal');
    const saved = this.store.read(); this.configured = !!saved;
    if (saved) this.registrationVersion = this.ownership()?.schemaVersion;
    if (this.store.error) { this.status = 'failed'; this.notice = 'saved-invalid'; }
    else if (saved) { this.status = saved.disabled ? 'disabled' : 'disconnected'; this.notice = saved.disabled ? 'disabled' : 'resume-required'; }
  }
  private command(): string {
    return `${this.options.runAsNode ? 'ELECTRON_RUN_AS_NODE=1 ' : ''}${quote(this.options.nodeExecutable)} ${quote(join(this.directory, 'observer.cjs'))} ${quote(join(this.directory, 'activation.json'))}`;
  }
  snapshot(): ClaudeConnectionState {
    const summary = this.plan?.hook;
    const upgrading = this.plan?.operation === 'upgrade';
    return { revision: this.revision, mode: 'normal-start', scope: this.taskEvents ? 'task-events' : 'presence-only', status: this.status, busy: this.busy,
      configured: this.configured, observedRuns: this.observedRuns, launchers: this.launchers, launchCommand: null,
      preview: this.plan && summary ? { id: this.plan.id, executable: this.plan.executable, directory: this.directory,
        operation: this.plan.operation, events: CLAUDE_USER_HOOK_EVENTS,
        files: ['observer.cjs', 'activation.json', 'hook.json', ...(upgrading ? ['upgrade-before.json'] : ['settings-before.json']), 'receipt.json'].map(path => join(this.directory, path)),
        settings: { path: summary.path, exists: summary.exists, canApply: summary.canApply, reason: summary.notice } } : null,
      canConfigure: !this.closed && !this.busy && !this.configured && !this.store.error,
      canUpgrade: !this.closed && !this.busy && this.configured && this.registrationVersion === 1 && !this.store.error,
      canResume: !this.closed && !this.busy && this.configured && !this.server && !this.store.error, notice: this.notice };
  }
  subscribe(listener: (state: ClaudeConnectionState) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(): ClaudeConnectionState { this.revision++; const state = this.snapshot(); for (const listener of this.listeners) listener(state); return state; }
  invalidate(): ClaudeConnectionState { this.generation++; this.plan = undefined; return this.emit(); }
  async preview(detectedExecutable?: string): Promise<ClaudeConnectionState> {
    const current = this.snapshot(), upgrading = current.canUpgrade === true;
    if (!current.canConfigure && !upgrading) return current;
    const generation = ++this.generation; this.plan = undefined; this.busy = true; this.notice = 'choose-executable'; this.emit();
    try {
      const selected = upgrading ? this.store.read()?.executable : detectedExecutable ?? await this.options.chooseExecutable();
      if (this.closed || generation !== this.generation) return this.snapshot();
      if (!selected) { this.notice = 'none'; return this.snapshot(); }
      const executable = (this.options.inspectExecutable ?? inspectClaudeExecutable)(selected);
      if (!executable) { this.notice = 'unsupported-installation'; return this.snapshot(); }
      const assets = await this.options.runtimeAssets();
      if (this.closed || generation !== this.generation) return this.snapshot();
      if (!assets.nativeHook || Buffer.byteLength(assets.nativeHook) > 512 * 1024) throw new Error();
      const ownership = upgrading ? this.ownership() : null;
      if (upgrading && !ownership) throw new Error();
      const hook = ownership ? prepareClaudeUserHookUpgrade(ownership) : prepareClaudeUserHook({
        directory: this.options.targetDirectory, command: this.command(), events: CLAUDE_USER_HOOK_EVENTS });
      this.plan = { id: randomUUID(), executable, source: assets.nativeHook, hook, operation: upgrading ? 'upgrade' : 'configure' }; this.notice = 'none';
    } catch { if (generation === this.generation) this.notice = 'preview-failed'; }
    finally { this.busy = false; this.emit(); }
    return this.snapshot();
  }
  private ownership(): HookOwnership | null {
    try {
      const text = this.store.readMaterial('hook.json'), value: unknown = text && JSON.parse(text);
      return isClaudeUserHookOwnership(value) && value.directory === this.options.targetDirectory && value.command === this.command() ? value : null;
    } catch { return null; }
  }
  private async open(executable: string, tasks: boolean): Promise<string> {
    const token = randomBytes(32).toString('hex'), epoch = ++this.observationEpoch;
    const forwarded = new Set<string>();
    const opening = startClaudeNativePresenceServer({ token, executable, observerExecutable: this.options.observerExecutable,
      onFact: delivery => {
        if (this.closed || epoch !== this.observationEpoch || !tasks || !this.taskEvents) return;
        forwarded.add(delivery.runId);
        return this.options.onFact?.(delivery) as undefined;
      },
      onRetire: runId => {
        // The old receiver owns this cleanup even after stop invalidates its epoch.
        if (forwarded.delete(runId)) return this.options.onRetire?.(runId) as undefined;
      },
      probePath: this.options.probePath, onChange: counts => {
        if (this.closed || epoch !== this.observationEpoch) return;
        this.observedRuns = counts.observedRuns; this.launchers = counts.launchers;
        this.status = counts.observedRuns ? 'observing' : 'waiting'; this.notice = 'none'; this.emit();
      } });
    this.opening = opening;
    let server: Awaited<typeof opening>;
    try { server = await opening; }
    finally { if (this.opening === opening) this.opening = undefined; }
    if (this.closed || epoch !== this.observationEpoch) { await server.stop(); throw new Error('Observer startup cancelled'); }
    this.server = server;
    const text = JSON.stringify({ schemaVersion: 1, configurationId: this.options.configurationId, executable,
      observerExecutable: this.options.observerExecutable, url: this.server.url, token }) + '\n';
    if (Buffer.byteLength(text) > 8192) throw new Error();
    return text;
  }
  private async closeServer(): Promise<void> { this.observationEpoch++; this.taskEvents = false; const server = this.server; this.server = undefined;
    const opening = this.opening;
    if (opening) await opening.then(pending => pending.stop(), () => {});
    await server?.stop(); this.observedRuns = 0; this.launchers = 0; }
  async confirm(id: string): Promise<ClaudeConnectionState> {
    if (this.closed || this.busy || !this.plan || id !== this.plan.id || !this.plan.hook.canApply || !this.plan.hook.ownership) {
      this.notice = 'stale-preview'; return this.emit();
    }
    const plan = this.plan; this.plan = undefined; this.busy = true; const generation = ++this.generation; this.emit();
    try {
      if ((this.options.inspectExecutable ?? inspectClaudeExecutable)(plan.executable) !== plan.executable) { this.notice = 'unsupported-installation'; return this.snapshot(); }
      if (plan.operation === 'upgrade') await this.closeServer();
      const activation = await this.open(plan.executable, true);
      if (this.closed || generation !== this.generation) { await this.closeServer(); return this.snapshot(); }
      const materials = { 'observer.cjs': plan.source, 'activation.json': activation, 'hook.json': JSON.stringify(plan.hook.ownership) + '\n' };
      const saved = plan.operation === 'upgrade' ? this.store.replaceNormalMaterials(materials) :
        this.store.initialize({ executable: plan.executable, files: { ...materials,
        // Private original evidence only. Never auto-restore over later user edits.
        'settings-before.json': plan.hook.original ?? 'null\n' } });
      if (!saved) throw new Error();
      this.configured = true;
      this.registrationVersion = plan.hook.ownership!.schemaVersion;
      if (!applyClaudeUserHook(plan.hook)) { await this.closeServer(); this.status = 'failed'; this.notice = 'save-failed'; return this.snapshot(); }
      this.taskEvents = this.registrationVersion === 2;
      this.status = 'waiting'; this.notice = 'none';
    } catch { await this.closeServer(); this.status = 'failed'; this.notice = 'save-failed'; }
    finally { this.busy = false; this.emit(); }
    return this.snapshot();
  }
  async resume(): Promise<ClaudeConnectionState> {
    if (!this.snapshot().canResume) return this.snapshot();
    this.busy = true; this.generation++; this.emit();
    try {
      const saved = this.store.read(), ownership = this.ownership();
      if (!saved || !ownership || !inspectClaudeUserHook(ownership)) { this.status = 'failed'; this.notice = 'saved-invalid'; return this.snapshot(); }
      if ((this.options.inspectExecutable ?? inspectClaudeExecutable)(saved.executable) !== saved.executable) { this.notice = 'unsupported-installation'; return this.snapshot(); }
      const activation = await this.open(saved.executable, ownership.schemaVersion === 2);
      if (this.closed) { await this.closeServer(); return this.snapshot(); }
      if (!this.store.replaceActivation(activation, false)) throw new Error();
      this.registrationVersion = ownership.schemaVersion; this.taskEvents = ownership.schemaVersion === 2;
      this.status = 'waiting'; this.notice = 'none';
    } catch { await this.closeServer(); this.status = 'failed'; this.notice = 'start-failed'; }
    finally { this.busy = false; this.emit(); }
    return this.snapshot();
  }
  /** Once configured, app startup restores observation unless explicitly paused. */
  async restore(): Promise<void> { const saved = this.store.read(); if (saved && !saved.disabled) await this.resume(); }
  async disable(): Promise<ClaudeConnectionState> {
    if (this.closed || this.busy) return this.snapshot();
    this.busy = true; this.generation++; this.plan = undefined; this.emit();
    try { await this.closeServer();
      if (this.configured && !this.store.setDisabled(true)) { this.status = 'failed'; this.notice = 'save-failed'; }
      else { this.status = this.configured ? 'disabled' : 'not-configured'; this.notice = this.configured ? 'disabled' : 'none'; }
    } finally { this.busy = false; this.emit(); }
    return this.snapshot();
  }
  async remove(): Promise<boolean> {
    if (this.busy || this.store.error) return false;
    await this.disable();
    if (this.store.error) return false;
    if (!this.configured) return true;
    const ownership = this.ownership();
    if (!ownership || !withdrawClaudeUserHook(ownership)) { this.status = 'failed'; this.notice = 'retained'; this.emit(); return false; }
    return true; // Private runtime remains for hooks already loaded in a live session.
  }
  async stop(): Promise<void> { this.closed = true; this.generation++; this.plan = undefined; await this.closeServer(); this.listeners.clear(); }
}
