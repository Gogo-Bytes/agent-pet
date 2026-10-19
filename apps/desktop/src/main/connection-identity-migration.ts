import * as fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import { readVolumeIdentity, type DurableFileIdentity } from './durable-file-identity.js';
import { validStat, validSavedConnection, type SavedConnection } from './pi-connection-store.js';
import { ClaudePresenceStore } from './claude-presence-store.js';
import { inspectClaudeUserHook, isClaudeUserHookOwnership } from './claude-user-hook.js';

type Snapshot = { path: string; bytes: Buffer; stat: fs.Stats };
export type IdentityMigrationPlan = Readonly<{ provider: 'pi' | 'claude'; metadataPath: string; runtimeMissing: boolean }>;
type Prepared = { snapshots: Snapshot[]; reprepare: () => { text: string; runtimeMissing: boolean }; text: string; publish: (text: string) => boolean };
const plans = new WeakMap<IdentityMigrationPlan, Prepared>();
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function parents(path: string): void {
  if (!isAbsolute(path) || normalize(path) !== path) throw new Error('migration-path');
  let current = '/';
  for (const part of path.split('/').filter(Boolean)) {
    current = join(current, part); const s = fs.lstatSync(current);
    if (!s.isDirectory() || (s.uid !== process.getuid?.() && s.uid !== 0) ||
      ((s.mode & 0o022) !== 0 && !(s.uid === 0 && (s.mode & 0o1000)))) throw new Error('migration-parent');
  }
}
function read(path: string): Snapshot {
  parents(dirname(path));
  const before = fs.lstatSync(path);
  if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid?.() ||
    (before.mode & 0o7777) !== 0o600 || before.size > 512 * 1024) throw new Error('migration-file');
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    if (!same(before, fs.fstatSync(fd), true)) throw new Error('migration-file-changed');
    const buffer = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < buffer.length) {
      const length = fs.readSync(fd, buffer, count, buffer.length - count, count);
      if (!length) break;
      count += length;
    }
    if (count !== before.size) throw new Error('migration-file-changed');
    const bytes = buffer.subarray(0, count);
    for (const after of [fs.fstatSync(fd), fs.lstatSync(path)]) {
      if (!same(before, after, true)) throw new Error('migration-file-changed');
    }
    return { path, bytes, stat: before };
  } finally { fs.closeSync(fd); }
}
function same(a: DurableFileIdentity, b: DurableFileIdentity, file = false): boolean {
  const fields = ['dev', 'ino', 'birthtimeMs', 'mode', 'uid', 'gid', ...(file ? ['size', 'nlink', 'mtimeMs', 'ctimeMs'] : [])];
  return fields.every(key => (a as unknown as Record<string, unknown>)[key] === (b as unknown as Record<string, unknown>)[key]);
}
function rebind<T extends DurableFileIdentity>(path: string, saved: T, file = false): T {
  parents(dirname(path));
  const current = fs.lstatSync(path);
  if (current.isSymbolicLink() || (file ? !current.isFile() : !current.isDirectory()) ||
    !same({ ...saved, dev: current.dev }, current, file)) throw new Error('migration-identity-changed');
  const volumeId = readVolumeIdentity(path, current);
  if (!volumeId || (saved.volumeId !== undefined && saved.volumeId.toLowerCase() !== volumeId)) throw new Error('migration-volume');
  return { ...saved, dev: current.dev, volumeId };
}
function unchanged(snapshots: Snapshot[]): void {
  for (const snapshot of snapshots) {
    const current = read(snapshot.path);
    if (!same(snapshot.stat, current.stat, true) || !snapshot.bytes.equals(current.bytes)) throw new Error('migration-stale');
  }
}
function exists(path: string): boolean {
  try { fs.lstatSync(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
function exclusive(path: string, bytes: Buffer | string): void {
  const fd = fs.openSync(path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
/** Explicit authorization must precede calling apply. Preparation is read-only; plans contain no secrets. */
export function preparePiIdentityMigration(userData: string): IdentityMigrationPlan {
  const directory = join(userData, 'pi-connection'), path = join(directory, 'connection.json');
  const original = read(path);
  if (original.bytes.length > 16384) throw new Error('migration-record-size');
  const inspect = () => {
    parents(directory);
    if ((fs.lstatSync(directory).mode & 0o7777) !== 0o700 || fs.lstatSync(directory).uid !== process.getuid?.()) throw new Error('migration-private-directory');
    if (exists(join(directory, 'pending.json'))) throw new Error('migration-pending');
    const value = JSON.parse(original.bytes.toString('utf8')) as { version: number; host: string; uid: number; directory: DurableFileIdentity; connection: SavedConnection | null };
    if (Object.keys(value).sort().join(',') !== 'connection,directory,host,uid,version' || value.version !== 1 || value.host !== hostname() ||
      value.uid !== process.getuid?.() || (value.connection !== null && !validSavedConnection(value.connection))) throw new Error('migration-record');
    if (!validStat(value.directory, 'directory')) throw new Error('migration-directory-record');
    value.directory = rebind(directory, value.directory);
    if (value.connection === null) return { text: JSON.stringify(value) + '\n', runtimeMissing: false };
    const c = value.connection, extension = join(c.target, 'extensions', 'agent-pet.ts');
    c.ownership.file = rebind(extension, c.ownership.file, true);
    if (hash(read(extension).bytes) !== c.ownership.digest) throw new Error('migration-content-changed');
    c.ownership.directories = c.ownership.directories.map(([p, s]) => [p, rebind(p, s)]);
    let runtimeMissing = false;
    try { if (!fs.lstatSync(dirname(c.config.endpoint)).isDirectory()) throw new Error('migration-runtime-directory'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; runtimeMissing = true; }
    if (!runtimeMissing) c.runtime = rebind(fs.realpathSync(dirname(c.config.endpoint)), c.runtime);
    const text = JSON.stringify(value) + '\n';
    if (Buffer.byteLength(text) > 16384) throw new Error('migration-record-size');
    return { text, runtimeMissing };
  };
  const prepared = inspect();
  const plan = Object.freeze({ provider: 'pi' as const, metadataPath: path, runtimeMissing: prepared.runtimeMissing });
  plans.set(plan, { snapshots: [original], reprepare: inspect, text: prepared.text, publish(text) {
    const pending = join(directory, 'pending.json'); exclusive(pending, text);
    unchanged([original]); fs.renameSync(pending, path); return true;
  } });
  return plan;
}
export function prepareClaudeIdentityMigration(directory: string, configurationId: string): IdentityMigrationPlan {
  const store = new ClaudePresenceStore(directory, configurationId, 'normal');
  if (store.error || !store.read()) throw new Error('migration-store');
  const snapshots = [read(join(directory, 'hook.json')), read(join(directory, 'receipt.json'))];
  const inspect = () => {
    if (!store.verify()) throw new Error('migration-store-changed');
    const ownership: unknown = JSON.parse(snapshots[0]!.bytes.toString('utf8'));
    if (!isClaudeUserHookOwnership(ownership)) throw new Error('migration-hook');
    ownership.directories = ownership.directories.map(([p, s]) => [p, rebind(p, s)]);
    if (!inspectClaudeUserHook(ownership)) throw new Error('migration-hook-changed');
    return { text: JSON.stringify(ownership) + '\n', runtimeMissing: false };
  };
  const prepared = inspect();
  const plan = Object.freeze({ provider: 'claude' as const, metadataPath: snapshots[0]!.path, runtimeMissing: false });
  plans.set(plan, { snapshots, reprepare: inspect, text: prepared.text, publish: text => store.replaceHookIdentity(text) });
  return plan;
}
export function applyIdentityMigration(plan: IdentityMigrationPlan): { applied: boolean; backupPath?: string } {
  const prepared = plans.get(plan); plans.delete(plan);
  if (!prepared) return { applied: false };
  let backupPath: string | undefined;
  try {
    unchanged(prepared.snapshots);
    const current = prepared.reprepare();
    if (current.text !== prepared.text || current.runtimeMissing !== plan.runtimeMissing) throw new Error('migration-stale');
    // Outside the fixed store tree: retained exact original bytes, never automatic rollback.
    backupPath = join(dirname(dirname(plan.metadataPath)), `identity-migration-${randomUUID()}.json`);
    exclusive(backupPath, JSON.stringify({ version: 1, files: prepared.snapshots.map(s => ({ path: s.path, base64: s.bytes.toString('base64') })) }) + '\n');
    unchanged(prepared.snapshots);
    if (prepared.reprepare().text !== prepared.text) throw new Error('migration-stale');
    return { applied: prepared.publish(prepared.text), backupPath };
  } catch { return { applied: false, ...(backupPath ? { backupPath } : {}) }; }
}
