import * as fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { startCodexNormalBridge } from '../../../../integrations/codex-hooks/normal-bridge.js';
import { createCodexNormalHookDocument } from '../../../../integrations/codex-hooks/hook-source.js';
import { privatePath, readPrivateFile, verifyPrivateDirectory } from '../../../../integrations/hook-runtime/private-activation.js';
type BridgeOptions = Parameters<typeof startCodexNormalBridge>[0];
type Receipt = { schemaVersion: 1; configurationId: string; executable: string; observerExecutable: string; files: Record<string, string> };
const files = ['activation.json', 'hook.json', 'observer.cjs'] as const;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
/** Main-only private runtime. Does not install/rewrite Codex hooks or grant native trust.
 * Unknown, edited or interrupted material is preserved and fails closed.
 */
export class CodexNormalObserver {
  private bridge: Awaited<ReturnType<typeof startCodexNormalBridge>> | undefined;
  private pending: Promise<Awaited<ReturnType<typeof startCodexNormalBridge>>> | undefined;
  private opening = false;
  private generation = 0;
  private closed = false;
  private status: 'not-configured' | 'waiting-for-event' | 'observing' | 'stopped' | 'failed' = 'not-configured';
  private sessions = 0;
  constructor(private readonly options: Omit<BridgeOptions, 'onChange'> & {
    directory: string; nodeExecutable: string; runAsNode: boolean;
    /** Self-owned cancellation fixture only; production callers use the native bridge. */
    startBridge?: typeof startCodexNormalBridge;
  }) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options.configurationId) ||
        !privatePath(options.directory) || basename(options.directory) !== `codex-normal-${options.configurationId}` ||
        !privatePath(options.nodeExecutable)) throw new Error('Invalid Codex runtime directory');
  }
  snapshot() { return { status: this.status, busy: this.opening, observedSessions: this.sessions }; }
  private material(name: string) { return readPrivateFile(join(this.options.directory, name), name === 'observer.cjs' ? 512 * 1024 : name === 'hook.json' ? 256 * 1024 : 16384); }
  private read(): Receipt {
    verifyPrivateDirectory(this.options.directory);
    const names: string[] = [], folder = fs.opendirSync(this.options.directory);
    try { let next: fs.Dirent | null; while ((next = folder.readSync()) !== null) { names.push(next.name); if (names.length > 4) break; } }
    finally { folder.closeSync(); }
    const actual = names.sort().join(',');
    if (actual !== [...files, 'receipt.json'].sort().join(',')) throw new Error('Unknown or pending runtime files');
    const value: unknown = JSON.parse(this.material('receipt.json').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid runtime receipt');
    const v = value as Receipt;
    if (Object.keys(v).sort().join(',') !== 'configurationId,executable,files,observerExecutable,schemaVersion' ||
        v.schemaVersion !== 1 || v.configurationId !== this.options.configurationId ||
        v.executable !== this.options.executable || v.observerExecutable !== this.options.observerExecutable ||
        !v.files || typeof v.files !== 'object' || Array.isArray(v.files) || Object.keys(v.files).sort().join(',') !== [...files].sort().join(',') ||
        files.some(name => v.files[name] !== hash(this.material(name)))) throw new Error('Changed Codex runtime');
    const expected = createCodexNormalHookDocument(this.options.nodeExecutable, join(this.options.directory, 'observer.cjs'), join(this.options.directory, 'activation.json'), this.options.runAsNode);
    if (this.material('hook.json').toString('utf8') !== expected) throw new Error('Hook command changed');
    return v;
  }
  private async open() {
    const generation = this.generation;
    const pending = (this.options.startBridge ?? startCodexNormalBridge)({ ...this.options, onChange: state => {
      if (this.closed || generation !== this.generation) return;
      this.sessions = state.observedSessions;
      this.status = this.sessions ? 'observing' : 'waiting-for-event';
    } });
    this.pending = pending;
    try {
      const bridge = await pending;
      if (this.closed || generation !== this.generation) { await bridge.stop(); throw new Error('Codex receiver start cancelled'); }
      this.bridge = bridge; return bridge;
    } finally { if (this.pending === pending) this.pending = undefined; }
  }
  /** Explicit initialization creates only a new app-private directory. Caller handles native hook review separately. */
  async initialize(observerSource: string): Promise<boolean> {
    if (this.opening || this.bridge || this.closed || !observerSource || Buffer.byteLength(observerSource) > 512 * 1024) return false;
    this.opening = true; ++this.generation;
    try {
      verifyPrivateDirectory(dirname(this.options.directory));
      fs.mkdirSync(this.options.directory, { mode: 0o700 }); // Exclusive; never adopts existing data.
      verifyPrivateDirectory(this.options.directory);
      const bridge = await this.open();
      const materials = { 'observer.cjs': observerSource, 'activation.json': bridge.activation,
        'hook.json': createCodexNormalHookDocument(this.options.nodeExecutable, join(this.options.directory, 'observer.cjs'), join(this.options.directory, 'activation.json'), this.options.runAsNode) };
      for (const [name, text] of Object.entries(materials)) fs.writeFileSync(join(this.options.directory, name), text, { flag: 'wx', mode: 0o600 });
      const receipt: Receipt = { schemaVersion: 1, configurationId: this.options.configurationId,
        executable: this.options.executable, observerExecutable: this.options.observerExecutable,
        files: Object.fromEntries(Object.entries(materials).map(([name, text]) => [name, hash(text)])) };
      fs.writeFileSync(join(this.options.directory, 'receipt.json'), JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
      this.read(); this.status = 'waiting-for-event'; return true;
    } catch { await this.fail(); return false; }
    finally { this.opening = false; }
  }
  async restore(): Promise<boolean> {
    if (this.opening || this.bridge || this.closed) return false;
    this.opening = true; ++this.generation;
    try {
      const receipt = this.read(), before = this.material('receipt.json');
      const bridge = await this.open();
      this.read();
      if (!before.equals(this.material('receipt.json'))) throw new Error('Runtime changed during restore');
      const activation = bridge.activation;
      const next = { ...receipt, files: { ...receipt.files, 'activation.json': hash(activation) } };
      // Pending marker makes interrupted multi-file commits unadoptable. Never auto-repair it.
      const pending = join(this.options.directory, '.pending');
      fs.writeFileSync(pending, '', { flag: 'wx', mode: 0o600 });
      for (const [name, text] of [['activation.json', activation], ['receipt.json', JSON.stringify(next)]] as const) {
        const temporary = join(this.options.directory, `.next-${randomUUID()}`);
        fs.writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, join(this.options.directory, name));
      }
      fs.unlinkSync(pending); this.read(); this.status = 'waiting-for-event'; return true;
    } catch { await this.fail(); return false; }
    finally { this.opening = false; }
  }
  private async fail() { const bridge = this.bridge; this.bridge = undefined; this.sessions = 0; await bridge?.stop(); this.status = this.closed ? 'stopped' : 'failed'; }
  async stop(): Promise<void> {
    this.closed = true; ++this.generation;
    const bridge = this.bridge, pending = this.pending; this.bridge = undefined; this.sessions = 0; this.status = 'stopped';
    await bridge?.stop();
    if (pending) await pending.then(value => value.stop(), () => {});
  }
}
