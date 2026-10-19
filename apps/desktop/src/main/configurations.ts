import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ObservationSink } from '@agent-pet/adapter-core';
import type { PiBridgeAdapter } from '@agent-pet/adapter-pi';
import { configurationProviders, type AgentConfiguration, type ConfigurationMetadata, type ConfigurationNotice,
  type ConfigurationsState, type CreateConfiguration, type PetBinding } from '../shared/configurations.js';
import type { Inspection, PreflightState } from '../shared/pi-preflight.js';
import { ConfigurationsStore, configurationName, configurationPath, MAX_CONFIGURATIONS, validMetadata } from './configurations-store.js';
import { PiConnection } from './pi-connection.js';
import { PiConnectionStore } from './pi-connection-store.js';
import { inspectTarget, limits, ReadBudget } from './pi-preflight-files.js';
import { ClaudePresence, type ClaudePresenceOptions } from './claude-presence.js';
import { CodexConnection, type CodexConnectionOptions } from './codex-connection.js';
import { ClaudeNormalPresence } from './claude-normal-presence.js';
import { createClaudeObservations } from '../../../../integrations/claude-hooks/observations.js';

type Entry = { metadata: ConfigurationMetadata; inspection: Inspection | null; revision: number;
  connection: PiConnection | null; codex?: CodexConnection; claude?: ClaudePresence | ClaudeNormalPresence;
  claudeObservations?: ReturnType<typeof createClaudeObservations>; unsubscribe?: () => void; controller?: AbortController };

/** Main owns persistence, inspection and PiConnection capabilities. Renderer selection is observational.
 * IPC accepts only explicitly approved native selections or Main-resolved detected defaults.
 */
export class Configurations {
  private readonly store: ConfigurationsStore;
  private entries = new Map<string, Entry>();
  private sessionConfigurations: Record<string, string> = {};
  private revision = 0;
  private notice: ConfigurationNotice = 'none';
  private busy = false;
  private closed = false;
  private readonly listeners = new Set<(state: ConfigurationsState) => void>();
  constructor(private readonly options: {
    directory: string;
    adapter(): Pick<PiBridgeAdapter, 'start'>;
    publish: ObservationSink['publish'];
    developmentEnvironment?: boolean;
    codex?: Omit<CodexConnectionOptions, 'directory' | 'configurationId' | 'targetDirectory' | 'name' | 'publish'>;
    legacy?: { connection: PiConnection; targetPath: string };
    claude?: Omit<ClaudePresenceOptions, 'directory' | 'configurationId'> & {
      normal?: { probePath: string; observerExecutable: string };
    };
  }) {
    this.store = new ConfigurationsStore(options.directory);
    if (this.store.error) this.notice = 'saved-invalid';
    else {
      const records = this.store.snapshot();
      const legacy = records.find(record => record.id === 'legacy-pi');
      if (legacy && (!options.legacy || configurationPath(options.legacy.targetPath) !== legacy.targetPath)) {
        this.store.error = true; this.notice = 'saved-invalid'; return;
      }
      for (const metadata of records) this.attach(metadata);
      if (options.legacy) {
        const targetPath = configurationPath(options.legacy.targetPath);
        if (targetPath && !this.entries.has('legacy-pi')) this.attach({ id: 'legacy-pi', name: 'pi', provider: 'pi',
          targetPath, installation: null, pet: null });
      }
    }
  }
  private attach(metadata: ConfigurationMetadata): void {
    const entry: Entry = { metadata, inspection: null, revision: 0, connection: null };
    this.entries.set(metadata.id, entry);
    if (metadata.id === 'legacy-pi' && this.options.legacy) entry.connection = this.options.legacy.connection;
    else if (metadata.provider === 'pi') {
      const store = new PiConnectionStore(this.receiverDirectory(metadata.id));
      const saved = store.snapshot();
      // Separate metadata cannot retarget durable deployment ownership. Startup only reads our own
      // stores; preserve both records and revoke every target capability before constructing a controller.
      if (saved && saved.target !== metadata.targetPath) {
        store.error = true; this.store.error = true; this.notice = 'saved-invalid';
      }
      const target = (): PreflightState => ({ revision: entry.revision, installations: metadata.installation ? [metadata.installation] : [],
        selectedInstallation: metadata.installation?.id ?? null, target: { path: entry.metadata.targetPath, source: 'chosen' },
        inspection: entry.inspection, scan: 'not-run', notice: 'none' });
      entry.connection = new PiConnection({ target, adapter: this.options.adapter(),
        publish: observation => {
          const sessionId = `${metadata.id}:${observation.sessionId}`;
          this.sessionConfigurations[sessionId] = metadata.id;
          this.options.publish({ ...observation, sessionId }); this.emit();
        }, developmentEnvironment: this.options.developmentEnvironment ?? false,
        store });
    }
    if (metadata.provider === 'claude' && this.options.claude) {
      this.attachClaude(entry);
    }
    if (metadata.provider === 'codex' && this.options.codex) this.attachCodex(entry);
    if (entry.connection) entry.unsubscribe = entry.connection.subscribe(() => this.emit());
  }
  private attachClaude(entry: Entry): void {
    const options = this.options.claude!;
    if (options.normal) entry.claudeObservations = createClaudeObservations({ name: () => entry.metadata.name,
      publish: observation => {
        const sessionId = `${entry.metadata.id}:${observation.sessionId}`;
        this.sessionConfigurations[sessionId] = entry.metadata.id;
        this.options.publish({ ...observation, sessionId }); this.emit();
      } });
    entry.claude = options.normal ? new ClaudeNormalPresence({ ...options, ...options.normal,
      onFact: delivery => entry.claudeObservations!.accept(delivery), onRetire: runId => entry.claudeObservations!.retire(runId),
      directory: this.options.directory, configurationId: entry.metadata.id, targetDirectory: entry.metadata.targetPath }) :
      new ClaudePresence({ ...options, directory: this.options.directory, configurationId: entry.metadata.id });
    entry.unsubscribe = entry.claude.subscribe(() => this.emit());
    if (entry.claude instanceof ClaudeNormalPresence) void entry.claude.restore();
  }
  private attachCodex(entry: Entry): void {
    entry.codex = new CodexConnection({ ...this.options.codex!, directory: this.options.directory,
      configurationId: entry.metadata.id, targetDirectory: entry.metadata.targetPath, name: () => entry.metadata.name,
      publish: observation => {
        const sessionId = `${entry.metadata.id}:${observation.sessionId}`;
        this.sessionConfigurations[sessionId] = entry.metadata.id;
        this.options.publish({ ...observation, sessionId }); this.emit();
      } });
    entry.unsubscribe = entry.codex.subscribe(() => this.emit());
    void entry.codex.restore();
  }
  private receiverDirectory(id: string): string { return join(this.options.directory, `configuration-${id}`); }
  snapshot(): ConfigurationsState {
    const records: AgentConfiguration[] = [...this.entries.values()].map(entry => ({ ...structuredClone(entry.metadata),
      inspection: structuredClone(entry.inspection), connection: entry.connection?.snapshot() ?? null,
      ...(entry.claude ? { claude: entry.claude.snapshot() } : {}),
      ...(entry.codex ? { codex: entry.codex.snapshot() } : {}),
      availability: entry.codex ? entry.codex.snapshot().status === 'failed' || entry.codex.snapshot().preview?.canApply === false ? 'attention' : entry.codex.snapshot().configured || entry.codex.snapshot().preview?.canApply ? 'available' : 'unchecked' : entry.claude ? entry.claude.snapshot().status === 'failed' ? 'attention' : 'available' : entry.metadata.provider !== 'pi' ? 'unsupported' : entry.connection?.snapshot().saved === 'invalid' ? 'attention' : !entry.inspection ? 'unchecked' :
        entry.inspection.findings.length ? 'attention' : 'available' }));
    return { revision: this.revision, records, notice: this.notice, busy: this.busy,
      sessionConfigurations: { ...this.sessionConfigurations } };
  }
  subscribe(listener: (state: ConfigurationsState) => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  /** Existing env/legacy adapters keep their original publisher; Main tags their observations here. */
  registerLegacySession(sessionId: string): void {
    if (this.closed || !this.entries.has('legacy-pi') || typeof sessionId !== 'string' || sessionId.length > 8192) return;
    this.sessionConfigurations[sessionId] = 'legacy-pi'; this.emit();
  }
  /** Window/navigation teardown revokes transient deployment consent; it does not stop active agents. */
  invalidateAll(): void {
    for (const entry of this.entries.values()) { entry.controller?.abort(); entry.connection?.invalidate(); entry.claude?.invalidate(); entry.codex?.invalidate(); }
  }
  private emit(): ConfigurationsState {
    this.revision++; const state = this.snapshot();
    for (const listener of this.listeners) listener(state);
    return state;
  }
  private result(notice: ConfigurationNotice): ConfigurationsState { this.notice = notice; return this.emit(); }
  private persist(next: ConfigurationMetadata[]): boolean {
    if (this.store.save(next)) return true;
    this.notice = 'save-failed'; return false;
  }
  private metadata(): ConfigurationMetadata[] { return [...this.entries.values()].map(entry => entry.metadata); }
  private entry(id: unknown): Entry | undefined {
    return typeof id === 'string' && id.length <= 80 ? this.entries.get(id) : undefined;
  }
  private available(): boolean { return !this.closed && !this.busy && !this.store.error; }
  private blockedNotice(): ConfigurationNotice { return this.store.error ? 'saved-invalid' : 'busy'; }
  async create(input: CreateConfiguration): Promise<ConfigurationsState> {
    if (!this.available()) return this.result(this.blockedNotice());
    if (!input || typeof input !== 'object') return this.result('invalid');
    const name = configurationName(input.name), targetPath = configurationPath(input.targetPath);
    if (!name || !targetPath || !configurationProviders.includes(input.provider)) return this.result('invalid');
    if (this.entries.size >= MAX_CONFIGURATIONS) return this.result('limit');
    if (this.metadata().some(record => record.provider === input.provider && record.targetPath === targetPath)) return this.result('duplicate');
    const metadata: ConfigurationMetadata = { id: randomUUID(), name, provider: input.provider, targetPath,
      installation: input.installation ?? null, pet: null };
    if (!validMetadata(metadata)) return this.result('invalid');
    // Application-owned private receiver metadata only. No target writes, target reads or listener starts.
    if (metadata.provider === 'pi') {
      try { mkdirSync(this.receiverDirectory(metadata.id), { mode: 0o700 }); }
      catch { return this.result('save-failed'); }
    }
    if (!this.persist([...this.metadata(), metadata])) return this.emit();
    this.attach(metadata); return this.result('none');
  }
  private update(id: string, change: (record: ConfigurationMetadata) => ConfigurationMetadata | ConfigurationNotice): ConfigurationsState {
    if (!this.available()) return this.result(this.blockedNotice());
    const entry = this.entry(id); if (!entry) return this.result('not-found');
    if (entry.connection?.snapshot().busy || entry.claude?.snapshot().busy || entry.codex?.snapshot().busy) return this.result('busy');
    const next = change(entry.metadata); if (typeof next === 'string') return this.result(next);
    if (!validMetadata(next)) return this.result('invalid');
    if (!this.persist(this.metadata().map(record => record.id === id ? next : record))) return this.emit();
    entry.metadata = next; entry.revision++; return this.result('none');
  }
  async rename(id: string, value: string): Promise<ConfigurationsState> {
    return this.update(id, record => { const name = configurationName(value); return name ? { ...record, name } : 'invalid'; });
  }
  async bindPet(id: string, pet: PetBinding | null): Promise<ConfigurationsState> {
    return this.update(id, record => {
      if (pet === null) return { ...record, pet: null };
      const name = configurationName(pet?.name);
      return name && pet.assetId === 'starter' ? { ...record, pet: { assetId: 'starter', name } } : 'invalid';
    });
  }
  async changeTarget(id: string, value: string): Promise<ConfigurationsState> {
    const result = this.update(id, record => {
      const connection = this.entry(id)?.connection?.snapshot();
      const codex = this.entry(id)?.codex?.snapshot();
      if (this.entry(id)?.claude?.snapshot().configured || (codex && (codex.configured || !codex.canConfigure))) return 'withdraw-first';
      // The injected legacy controller owns its original preflight closure. Remove and add a new record after withdrawal.
      if (record.id === 'legacy-pi' || connection?.deployedPath || connection?.saved === 'uncertain' || connection?.saved === 'invalid' ||
          connection?.receiving === 'unknown' || connection?.canConfigure === false) return 'withdraw-first';
      const targetPath = configurationPath(value); if (!targetPath) return 'invalid';
      if (this.metadata().some(other => other.id !== id && other.provider === record.provider && other.targetPath === targetPath)) return 'duplicate';
      return { ...record, targetPath };
    });
    if (result.notice === 'none') {
      const entry = this.entry(id)!; entry.controller?.abort(); entry.inspection = null;
      entry.connection?.invalidate(); entry.claude?.invalidate(); entry.codex?.invalidate();
      if (entry.claude instanceof ClaudeNormalPresence) {
        entry.unsubscribe?.(); await entry.claude.stop(); entry.claudeObservations?.stop();
        if (!this.closed) this.attachClaude(entry);
      }
      if (entry.codex) {
        entry.unsubscribe?.(); await entry.codex.stop();
        if (!this.closed) this.attachCodex(entry);
      }
      return this.emit();
    }
    return result;
  }
  async inspect(id: string): Promise<ConfigurationsState> {
    if (!this.available()) return this.result(this.blockedNotice());
    const entry = this.entry(id); if (!entry) return this.result('not-found');
    if (entry.connection?.snapshot().busy) return this.result('busy');
    if (entry.metadata.provider !== 'pi') return this.result('unsupported');
    this.busy = true; this.notice = 'none'; this.emit();
    const controller = new AbortController(); entry.controller = controller;
    const revision = entry.revision, target = { path: entry.metadata.targetPath, source: 'chosen' as const };
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A hung OS read remains single-flight even after the bounded UI response times out.
    const reading = inspectTarget(target, new ReadBudget(controller.signal)).then(async inspection => {
      // An exactly matching product-owned file is expected. Unknown or edited files remain blockers;
      // removing this one finding never clears trust/settings/entrypoint or other independent findings.
      if (!controller.signal.aborted && inspection.findings.includes('existing-extension') && await entry.connection?.matchesDeployment()) {
        return { ...inspection, findings: inspection.findings.filter(finding => finding !== 'existing-extension') };
      }
      return inspection;
    }).catch((): Inspection => ({ target, findings: ['unreadable'] })).finally(() => {
      delete entry.controller; this.busy = false; this.emit();
    });
    try {
      const inspection = await Promise.race([reading, new Promise<Inspection>(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve({ target, findings: ['budget'] }); }, limits.milliseconds);
      })]);
      if (!this.closed && this.entries.get(id) === entry && revision === entry.revision) entry.inspection = inspection;
    } finally { if (timer) clearTimeout(timer); }
    return this.emit();
  }
  private async operation(id: string, work: (connection: PiConnection | ClaudePresence | ClaudeNormalPresence | CodexConnection) => Promise<unknown> | unknown): Promise<ConfigurationsState> {
    if (!this.available()) return this.result(this.blockedNotice());
    const entry = this.entry(id); if (!entry) return this.result('not-found');
    const connection = entry.codex ?? entry.claude ?? entry.connection;
    if (!connection) return this.result('unsupported');
    this.notice = 'none'; await work(connection); return this.emit();
  }
  preview(id: string): Promise<ConfigurationsState> { return this.operation(id, connection => connection.preview()); }
  /** Main-owned discovery only. IPC never accepts an executable path from Renderer. */
  previewDetectedClaude(id: string, executable: string): Promise<ConfigurationsState> {
    return this.operation(id, connection => connection instanceof ClaudeNormalPresence ? connection.preview(executable) : undefined);
  }
  cancel(id: string): Promise<ConfigurationsState> { return this.operation(id, connection => connection.invalidate()); }
  confirm(id: string, planId: string): Promise<ConfigurationsState> { return this.operation(id, connection => connection.confirm(planId)); }
  resume(id: string): Promise<ConfigurationsState> { return this.operation(id, connection => connection.resume()); }
  disable(id: string): Promise<ConfigurationsState> { return this.operation(id, connection => connection.disable()); }
  async remove(id: string): Promise<ConfigurationsState> {
    if (!this.available()) return this.result(this.blockedNotice());
    const entry = this.entry(id); if (!entry) return this.result('not-found');
    if (entry.connection?.snapshot().busy || entry.claude?.snapshot().busy || entry.codex?.snapshot().busy) return this.result('busy');
    this.busy = true; this.notice = 'none'; this.emit();
    try {
      if (entry.codex && !await entry.codex.remove()) { this.notice = 'retained'; return this.snapshotAfterRemoval(); }
      if (entry.claude && !await entry.claude.remove()) { this.notice = 'retained'; return this.snapshotAfterRemoval(); }
      const before = entry.connection?.snapshot();
      if (before?.deployedPath || before?.canRemove) {
        const removed = await entry.connection!.remove();
        if (removed.deployedPath || !['removed', 'already-absent'].includes(removed.notice) || removed.saved === 'uncertain') {
          this.notice = 'retained'; return this.snapshotAfterRemoval();
        }
      } else if (before && (before.receiving !== 'stopped' || before.saved === 'invalid' || before.saved === 'uncertain' ||
          before.mode === 'development-env' || !before.canConfigure)) {
        this.notice = 'retained'; return this.snapshotAfterRemoval();
      }
      if (!this.persist(this.metadata().filter(record => record.id !== id))) return this.snapshotAfterRemoval();
      entry.controller?.abort(); entry.unsubscribe?.(); await entry.connection?.stop(); await entry.claude?.stop(); await entry.codex?.stop(); entry.claudeObservations?.stop(); this.entries.delete(id);
      for (const session of Object.keys(this.sessionConfigurations)) if (this.sessionConfigurations[session] === id) delete this.sessionConfigurations[session];
      this.notice = 'none'; return this.snapshotAfterRemoval();
    } finally { if (this.busy) { this.busy = false; this.emit(); } }
  }
  private snapshotAfterRemoval(): ConfigurationsState { this.busy = false; return this.emit(); }
  async stop(): Promise<void> {
    this.closed = true;
    for (const entry of this.entries.values()) { entry.controller?.abort(); entry.unsubscribe?.(); }
    const results = await Promise.allSettled([...this.entries.values()].flatMap(entry => [entry.connection?.stop(), entry.claude?.stop(), entry.codex?.stop()]));
    for (const entry of this.entries.values()) entry.claudeObservations?.stop();
    this.listeners.clear();
    if (results.some(result => result.status === 'rejected')) throw new Error('Configuration receiver shutdown not confirmed');
  }
}
