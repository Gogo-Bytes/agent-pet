import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { renderConfiguredPiExtension } from '../../../../integrations/pi-extension/configured-source.js';
import { PiConnectionStore, sameIdentity, validSavedConnection, type SavedConnection } from './pi-connection-store.js';
import { PiTemporaryDeployment, saveStat, type SavedStat } from './pi-temp-deployment.js';
import { ReadBudget, limits } from './pi-preflight-files.js';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const fingerprint = (stat: SavedStat) => JSON.stringify(saveStat(stat));
async function bytes(path: string): Promise<Buffer | null> {
  const budget = new ReadBudget(), before = await budget.regular(path);
  if (!before) return null;
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (fingerprint(await file.stat()) !== fingerprint(before)) throw Error();
    const buffer = Buffer.alloc(limits.bytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      budget.check();
      const read = await file.read(buffer, offset, buffer.length - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    if (offset > limits.bytes || fingerprint(await file.stat()) !== fingerprint(before) || fingerprint(await lstat(path)) !== fingerprint(before)) throw Error();
    return buffer.subarray(0, offset);
  } finally { await file.close(); }
}
async function privateWrite(path: string, value: string | Buffer): Promise<void> {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(value); await file.sync(); } finally { await file.close(); }
}
async function matches(saved: SavedConnection): Promise<boolean> {
  const deployment = new PiTemporaryDeployment(saved.target, saved.config);
  return deployment.matches(deployment.restoreOwnership(saved.ownership));
}
export type ExtensionUpdatePreview = Readonly<{ path: string; backupDirectory: string; changed: boolean }>;
type Plan = { saved: SavedConnection; original: Buffer; source: string; settings: string | null };
export type ExtensionUpdateResult = { status: 'updated' | 'restored'; settingsUnchanged: boolean } |
  { status: 'refused' | 'failed-preserved' };

/** Explicit host/operator operation only, never automatic startup or Renderer IPC.
 * Uses the existing ownership guard. Local revalidation is not same-UID isolation.
 * Any uncertain receipt publication preserves the private recovery files and fails closed.
 */
export class PiExtensionUpdate {
  private plans = new WeakMap<ExtensionUpdatePreview, Plan>();
  readonly backupDirectory: string;
  constructor(private readonly connectionDirectory: string, operationId: string = randomUUID(), private readonly expectedTarget?: string) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(operationId)) throw Error('Invalid update operation');
    this.backupDirectory = join(connectionDirectory, `extension-update-${operationId}`);
  }
  private saved(): { store: PiConnectionStore; value: SavedConnection } {
    const store = new PiConnectionStore(this.connectionDirectory), value = store.snapshot();
    if (store.error || !value || (this.expectedTarget !== undefined && value.target !== this.expectedTarget)) throw Error();
    return { store, value };
  }
  private unchanged(saved: SavedConnection): boolean {
    const { value } = this.saved();
    return JSON.stringify(value) === JSON.stringify(saved);
  }
  private async privateDirectory(path: string): Promise<SavedStat> {
    await new ReadBudget().ancestors(path, true);
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o7777) !== 0o700) throw Error();
    return saveStat(stat);
  }
  private async inactive(saved: SavedConnection): Promise<boolean> {
    const runtime = await lstat(dirname(saved.config.endpoint));
    if (!runtime.isDirectory() || !sameIdentity(saved.runtime, saveStat(runtime))) return false;
    return await new ReadBudget().stat(saved.config.endpoint) === null;
  }
  private async settings(saved: SavedConnection) {
    const value = await bytes(join(saved.target, 'settings.json'));
    return value ? hash(value) : null;
  }
  async preview(): Promise<ExtensionUpdatePreview> {
    try {
      const { value: saved } = this.saved();
      if (!await this.inactive(saved) || !await matches(saved)) throw Error();
      const path = join(saved.target, 'extensions', 'agent-pet.ts');
      const original = await bytes(path);
      if (!original || hash(original) !== saved.ownership.digest) throw Error();
      const source = await renderConfiguredPiExtension(saved.config);
      if (Buffer.byteLength(source) > limits.bytes) throw Error();
      const settings = await this.settings(saved);
      const preview = Object.freeze({ path, backupDirectory: this.backupDirectory, changed: hash(source) !== hash(original) });
      this.plans.set(preview, { saved, original, source, settings });
      return preview;
    } catch { throw Error('Pi extension update preview refused'); }
  }
  async apply(preview: ExtensionUpdatePreview): Promise<ExtensionUpdateResult> {
    const plan = this.plans.get(preview);
    this.plans.delete(preview);
    if (!plan || !preview.changed) return { status: 'refused' };
    try {
      const { store, value: saved } = this.saved();
      if (JSON.stringify(saved) !== JSON.stringify(plan.saved) || !await this.inactive(saved) || !await matches(saved) || await this.settings(saved) !== plan.settings) return { status: 'refused' };
      await this.privateDirectory(this.connectionDirectory);
      await mkdir(this.backupDirectory, { mode: 0o700 }); // exclusive; never reuse an unknown journal
      await privateWrite(join(this.backupDirectory, 'original.ts'), plan.original);
      await privateWrite(join(this.backupDirectory, 'recovery.json'), JSON.stringify({ version: 1, original: saved, nextDigest: hash(plan.source), backup: await this.privateDirectory(this.backupDirectory) }) + '\n');
      const staging = join(this.backupDirectory, 'next.ts');
      await privateWrite(staging, plan.source);
      // No partial target writes. Unknown/edited targets and settings remain untouched.
      if (!this.unchanged(saved) || !await this.inactive(saved) || !await matches(saved) || await this.settings(saved) !== plan.settings) return { status: 'refused' };
      await new ReadBudget().ancestors(join(saved.target, 'extensions'), true);
      await rename(staging, preview.path);
      const file = await lstat(preview.path);
      const next = { ...saved, ownership: { ...saved.ownership, file: saveStat(file), digest: hash(plan.source) } };
      if (!await matches(next) || !store.save(next)) return { status: 'failed-preserved' };
      return { status: 'updated', settingsUnchanged: await this.settings(saved) === plan.settings };
    } catch { return { status: 'failed-preserved' }; }
  }
  /** Explicit rollback only. Validates both the current receipt and the private original. */
  async restore(): Promise<ExtensionUpdateResult> {
    try {
      await this.privateDirectory(this.connectionDirectory);
      const backup = await this.privateDirectory(this.backupDirectory);
      for (const name of ['recovery.json', 'original.ts']) {
        const stat = await lstat(join(this.backupDirectory, name));
        if (!stat.isFile() || stat.uid !== process.getuid?.() || stat.nlink !== 1 || (stat.mode & 0o7777) !== 0o600) return { status: 'refused' };
      }
      const journal = await bytes(join(this.backupDirectory, 'recovery.json'));
      if (!journal) return { status: 'refused' };
      const recovery: unknown = JSON.parse(journal.toString('utf8'));
      if (!recovery || typeof recovery !== 'object' || Array.isArray(recovery)) return { status: 'refused' };
      const data = recovery as Record<string, unknown>;
      if (Object.keys(data).sort().join(',') !== 'backup,nextDigest,original,version' || data.version !== 1 || !validSavedConnection(data.original) || typeof data.nextDigest !== 'string') return { status: 'refused' };
      if (!data.backup || typeof data.backup !== 'object' || !sameIdentity(data.backup as SavedStat, backup)) return { status: 'refused' };
      const original = await bytes(join(this.backupDirectory, 'original.ts'));
      const { store, value: saved } = this.saved();
      if (!original || hash(original) !== data.original.ownership.digest || saved.ownership.digest !== data.nextDigest ||
        saved.target !== data.original.target || JSON.stringify(saved.config) !== JSON.stringify(data.original.config) || !await this.inactive(saved) || !await matches(saved)) return { status: 'refused' };
      const settings = await this.settings(saved), staging = join(this.backupDirectory, 'restore.ts');
      await privateWrite(staging, original);
      if (!this.unchanged(saved) || !await this.inactive(saved) || !await matches(saved) || await this.settings(saved) !== settings) return { status: 'refused' };
      await rename(staging, join(saved.target, 'extensions', 'agent-pet.ts'));
      const restored = { ...saved, ownership: { ...saved.ownership, digest: hash(original), file: saveStat(await lstat(join(saved.target, 'extensions', 'agent-pet.ts'))) } };
      if (!await matches(restored) || !store.save(restored)) return { status: 'failed-preserved' };
      return { status: 'restored', settingsUnchanged: await this.settings(saved) === settings };
    } catch { return { status: 'failed-preserved' }; }
  }
}
