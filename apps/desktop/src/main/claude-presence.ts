import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { ClaudeConnectionState } from '../shared/claude-connection.js';
import { startClaudePresenceServer } from '../../../../integrations/claude-hooks/presence-channel.js';
import { createClaudePluginDocuments } from '../../../../integrations/claude-hooks/plugin-source.js';
import { inspectClaudeExecutable } from './claude-executable.js';
import { ClaudePresenceStore } from './claude-presence-store.js';

export interface ClaudePresenceOptions {
  directory: string;
  configurationId: string;
  nodeExecutable: string;
  runAsNode: boolean;
  runtimeAssets(): Promise<{ hook: string; launcher: string }>;
  chooseExecutable(): Promise<string | null>;
  inspectExecutable?(path: string): string | null;
}
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Connection capability only. No Agent process creation or task observations in Main. */
export class ClaudePresence {
  private readonly directory: string;
  private readonly store: ClaudePresenceStore;
  private readonly listeners = new Set<(state: ClaudeConnectionState) => void>();
  private plan: { id: string; executable: string; files: Record<string, string> } | undefined;
  private server: Awaited<ReturnType<typeof startClaudePresenceServer>> | undefined;
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
  constructor(private readonly options: ClaudePresenceOptions) {
    this.directory = join(options.directory, `claude-${options.configurationId}`);
    this.store = new ClaudePresenceStore(this.directory, options.configurationId);
    const saved = this.store.read();
    this.configured = !!saved;
    if (this.store.error) { this.status = 'failed'; this.notice = 'saved-invalid'; }
    else if (saved) { this.status = saved.disabled ? 'disabled' : 'disconnected'; this.notice = saved.disabled ? 'disabled' : 'resume-required'; }
  }
  snapshot(): ClaudeConnectionState {
    return { revision: this.revision, scope: 'presence-only', status: this.status, busy: this.busy, configured: this.configured,
      observedRuns: this.observedRuns, launchers: this.launchers,
      preview: this.plan ? { id: this.plan.id, executable: this.plan.executable, directory: this.directory,
        files: [...Object.keys(this.plan.files).map(file => join(this.directory, file)), join(this.directory, 'receipt.json')] } : null,
      launchCommand: this.configured && !this.store.error ? `${this.options.runAsNode ? 'ELECTRON_RUN_AS_NODE=1 ' : ''}${quote(this.options.nodeExecutable)} ${quote(join(this.directory, 'launcher.cjs'))} ${quote(join(this.directory, 'activation.json'))}` : null,
      canConfigure: !this.closed && !this.busy && !this.configured && !this.store.error,
      canResume: !this.closed && !this.busy && this.configured && !this.server && !this.store.error,
      notice: this.notice };
  }
  subscribe(listener: (state: ClaudeConnectionState) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(): ClaudeConnectionState {
    this.revision++; const state = this.snapshot();
    for (const listener of this.listeners) listener(state);
    return state;
  }
  invalidate(): ClaudeConnectionState { this.generation++; this.plan = undefined; return this.emit(); }
  async preview(): Promise<ClaudeConnectionState> {
    if (!this.snapshot().canConfigure) return this.snapshot();
    const generation = ++this.generation; this.plan = undefined; this.busy = true; this.notice = 'choose-executable'; this.emit();
    try {
      const selected = await this.options.chooseExecutable();
      if (this.closed || generation !== this.generation) return this.snapshot();
      if (!selected) { this.notice = 'none'; return this.snapshot(); }
      const executable = (this.options.inspectExecutable ?? inspectClaudeExecutable)(selected);
      if (!executable) { this.notice = 'unsupported-installation'; return this.snapshot(); }
      const assets = await this.options.runtimeAssets();
      if (this.closed || generation !== this.generation) return this.snapshot();
      if (!assets.hook || !assets.launcher || Buffer.byteLength(assets.hook) > 512 * 1024 || Buffer.byteLength(assets.launcher) > 512 * 1024) throw new Error();
      const documents = createClaudePluginDocuments(this.options.nodeExecutable, { runAsNode: this.options.runAsNode });
      this.plan = { id: randomUUID(), executable, files: {
        'plugin/.claude-plugin/plugin.json': documents.manifest,
        'plugin/hooks/hooks.json': documents.hooks,
        'plugin/runtime/hook.cjs': assets.hook,
        'launcher.cjs': assets.launcher,
        'activation.json': '', // Receiver capability is created only after confirmation.
      } };
      this.notice = 'none';
    } catch { if (generation === this.generation) this.notice = 'preview-failed'; }
    finally { this.busy = false; this.emit(); }
    return this.snapshot();
  }
  private async open(executable: string): Promise<string> {
    const token = randomBytes(32).toString('hex'), epoch = ++this.observationEpoch;
    this.server = await startClaudePresenceServer({ token, onChange: counts => {
      if (this.closed || epoch !== this.observationEpoch) return;
      this.launchers = counts.launchers; this.observedRuns = counts.observedRuns;
      this.status = counts.observedRuns ? 'observing' : 'waiting'; this.notice = 'none'; this.emit();
    } });
    const activation = JSON.stringify({ schemaVersion: 1, configurationId: this.options.configurationId, executable,
      pluginDirectory: join(this.directory, 'plugin'), url: this.server.url, token }) + '\n';
    if (Buffer.byteLength(activation) > 8192) throw new Error('Claude activation unavailable');
    return activation;
  }
  private async closeServer(): Promise<void> {
    this.observationEpoch++; const server = this.server; this.server = undefined;
    await server?.stop(); this.launchers = 0; this.observedRuns = 0;
  }
  async confirm(id: string): Promise<ClaudeConnectionState> {
    if (this.closed || this.busy || !this.plan || id !== this.plan.id) { this.notice = 'stale-preview'; return this.emit(); }
    const plan = this.plan; this.plan = undefined; this.busy = true; const generation = ++this.generation; this.emit();
    try {
      if ((this.options.inspectExecutable ?? inspectClaudeExecutable)(plan.executable) !== plan.executable) { this.notice = 'unsupported-installation'; return this.snapshot(); }
      const activation = await this.open(plan.executable);
      if (this.closed || generation !== this.generation) { await this.closeServer(); this.status = this.configured ? 'disconnected' : 'not-configured'; return this.snapshot(); }
      if (!this.store.initialize({ executable: plan.executable, files: { ...plan.files, 'activation.json': activation } })) {
        await this.closeServer(); this.status = 'failed'; this.notice = 'save-failed'; return this.snapshot();
      }
      this.configured = true; this.status = 'waiting'; this.notice = 'none';
    } catch { await this.closeServer(); this.status = 'failed'; this.notice = 'start-failed'; }
    finally { this.busy = false; this.emit(); }
    return this.snapshot();
  }
  async resume(): Promise<ClaudeConnectionState> {
    if (!this.snapshot().canResume) return this.snapshot();
    this.busy = true; const generation = ++this.generation; this.emit();
    try {
      const saved = this.store.read();
      if (!saved || !this.store.verify()) { this.status = 'failed'; this.notice = 'saved-invalid'; return this.snapshot(); }
      if ((this.options.inspectExecutable ?? inspectClaudeExecutable)(saved.executable) !== saved.executable) { this.notice = 'unsupported-installation'; return this.snapshot(); }
      const activation = await this.open(saved.executable);
      if (this.closed || generation !== this.generation) { await this.closeServer(); this.status = this.configured ? 'disconnected' : 'not-configured'; return this.snapshot(); }
      if (!this.store.replaceActivation(activation, false)) { await this.closeServer(); this.status = 'failed'; this.notice = 'save-failed'; return this.snapshot(); }
      this.status = 'waiting'; this.notice = 'none';
    } catch { await this.closeServer(); this.status = 'failed'; this.notice = 'start-failed'; }
    finally { this.busy = false; this.emit(); }
    return this.snapshot();
  }
  async disable(): Promise<ClaudeConnectionState> {
    if (this.closed || this.busy) return this.snapshot();
    this.busy = true; this.generation++; this.plan = undefined; this.emit();
    try {
      await this.closeServer();
      if (this.configured && !this.store.setDisabled(true)) { this.status = 'failed'; this.notice = 'save-failed'; }
      else { this.status = this.configured ? 'disabled' : 'not-configured'; this.notice = this.configured ? 'disabled' : 'none'; }
    } finally { this.busy = false; this.emit(); }
    return this.snapshot();
  }
  async remove(): Promise<boolean> {
    if (this.busy || this.store.error) return false;
    await this.disable();
    // Keep runtime files for hooks still loaded by a running CLI. Never unlink user material.
    return !this.store.error && (!this.configured || this.status === 'disabled');
  }
  async stop(): Promise<void> { this.closed = true; this.generation++; this.plan = undefined; await this.closeServer(); this.listeners.clear(); }
}
