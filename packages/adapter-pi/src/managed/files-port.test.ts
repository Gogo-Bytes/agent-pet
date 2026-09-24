import { expect, test } from 'vitest';
import { join } from 'node:path';
import { AuthStore, CREDENTIAL_BYTES, credentialPath, parseCredential } from './auth-store.js';
import { DISCOVERY_BYTES, readDiscovery, type Discovery } from './discovery.js';
import { readValue, type FileReceipt, type FilesPort, type FilesReader, type WriteTransaction } from './files-port.js';

/** Consumer fixture only: no filesystem or native security claims. */
class MemoryFiles implements FilesPort {
  readonly storageRoot = '/synthetic-storage';
  private entries = new Map<string, { value: unknown; owned: FileReceipt }>();
  private receipts = new WeakMap<FileReceipt, string>();
  readonly releasedPaths: string[] = [];
  async createDirectory(): Promise<void> {}
  release(owned: FileReceipt): void { this.releasedPaths.push(this.receipts.get(owned) ?? 'unknown'); }
  set(path: string, value: unknown): void {
    const entry = this.entries.get(path);
    this.entries.set(path, { value: structuredClone(value), owned: entry?.owned ?? Object.freeze(Object.create(null)) });
    if (entry === undefined) this.receipts.set(this.entries.get(path)!.owned, path);
  }
  receiptPath(path: string): FileReceipt | undefined { return this.entries.get(path)?.owned; }
  async beginWrite(path: string, max: number, operation: 'authority-write' | 'credential-write' | 'discovery-write'): Promise<WriteTransaction> {
    let value: unknown;
    let state: 'Prepared' | 'Writing' | 'Published' | 'Aborted' = 'Prepared';
    const files = this;
    return {
      get state() { return state; },
      async write(next: unknown) { value = next; state = 'Writing'; },
      async publishNew() { const result = await files.publish(path, value, max, operation); state = 'Published'; return result; },
      async publishReplace(previous) { const result = await files.publish(path, value, max, operation, previous); state = 'Published'; return result; },
      async abort() { state = 'Aborted'; },
      async close() {},
    } as WriteTransaction;
  }
  async read(path: string, _max?: number, _operation?: unknown): Promise<{ value: unknown; owned: FileReceipt }> {
    const entry = this.entries.get(path);
    if (!entry) throw new Error('missing fixture entry');
    return { value: structuredClone(entry.value), owned: entry.owned };
  }
  async publish(path: string, value: unknown, _max: number, _operation: unknown, previous?: FileReceipt): Promise<FileReceipt> {
    expect(previous).toBe(this.entries.get(path)?.owned);
    // No Stats, identity numbers, paths, or policy scope are carried by receipts.
    const owned: FileReceipt = Object.freeze(Object.create(null));
    this.receipts.set(owned, path);
    this.entries.set(path, { value: structuredClone(value), owned });
    return owned;
  }
  async remove(owned: FileReceipt): Promise<void> {
    const path = this.receipts.get(owned);
    expect(path).toBeDefined();
    expect(this.entries.get(path!)?.owned).toBe(owned);
    this.entries.delete(path!);
  }
}

test('AuthStore uses backend-independent receipts through prepare, enable, reopen, rotate and revoke', async () => {
  const files = new MemoryFiles();
  let store = await AuthStore.open(files, true);
  const target = await store.prepareTarget();
  expect(files.releasedPaths.some(path => path.includes('/targets/'))).toBe(true);
  expect(store.current(target.targetId, 1)).toBe(false);
  await store.enableTarget(target.targetId, 1, store.snapshot().revision);
  const authSetId = store.snapshot().authSetId;
  const credentialRead = await files.read(credentialPath(files.storageRoot, target.targetId, 1), CREDENTIAL_BYTES, 'credential-read');
  const credential = parseCredential(credentialRead.value, authSetId, target.targetId); files.release(credentialRead.owned);
  const auth = { type: 'auth', protocolVersion: 2, authSetId, targetId: target.targetId, epoch: 1, generation: 'a'.repeat(32), token: credential.token } as const;
  expect(store.authenticate(auth)).toBe(true);
  await store.close();
  store = await AuthStore.open(files, false);
  expect(store.authenticate(auth)).toBe(true);
  const rotating = store.rotateTarget(target.targetId, 1, store.snapshot().revision);
  expect(store.authenticate(auth)).toBe(false);
  await rotating;
  expect(store.current(target.targetId, 2)).toBe(true);
  await expect(files.read(credentialPath(files.storageRoot, target.targetId, 1), CREDENTIAL_BYTES, 'credential-read')).rejects.toThrow('missing fixture entry');
  const revoking = store.revokeTarget(target.targetId, 2, store.snapshot().revision);
  expect(store.current(target.targetId, 2)).toBe(false);
  await revoking;
  await store.close();
  store = await AuthStore.open(files, false);
  expect(store.snapshot().targets).toEqual([{ targetId: target.targetId, epoch: 3, state: 'revoked' }]);
  await expect(files.read(credentialPath(files.storageRoot, target.targetId, 2), CREDENTIAL_BYTES, 'credential-read')).rejects.toThrow('missing fixture entry');
  await store.close();
});

test('parsed reads settle receipts on parser failure and surface release uncertainty', async () => {
  const receipt = Object.freeze(Object.create(null)); let releases = 0;
  const reader: FilesReader = { storageRoot: '/synthetic-storage', read: async () => ({ value: {}, owned: receipt }), release: () => { releases++; } };
  await expect(readValue(reader, '/synthetic-storage/value.json', 1024, 'credential-read', () => { throw new Error('parse'); })).rejects.toThrow('parse');
  expect(releases).toBe(1);
  const uncertain: FilesReader = { ...reader, release: () => { throw new Error('release'); } };
  await expect(readValue(uncertain, '/synthetic-storage/value.json', 1024, 'credential-read', () => { throw new Error('parse'); })).rejects.toThrow('release');
});

test('AuthStore failed open releases its authority receipt', async () => {
  const files = new MemoryFiles(); const store = await AuthStore.open(files, true); await store.close();
  const path = join(files.storageRoot, 'authorization.json'); const authority = files.receiptPath(path);
  files.releasedPaths.length = 0; files.set(path, { invalid: true });
  await expect(AuthStore.open(files, false)).rejects.toThrow('store-corrupt');
  expect(files.releasedPaths).toContain(path);
  expect(authority).toBeDefined();
});

test('discovery consumes its opaque backend receipt before returning parsed data', async () => {
  const files = new MemoryFiles();
  const discovery: Discovery = { schema: 1, protocolVersion: 2, authSetId: 'a'.repeat(32), generation: 'b'.repeat(32), instance: 'c'.repeat(32), credentialLayout: 1 };
  const owned = await files.publish(join(files.storageRoot, 'discovery.json'), discovery, DISCOVERY_BYTES, 'discovery-write');
  const reader: FilesReader = { storageRoot: files.storageRoot, release: files.release.bind(files), read: async (path, max, operation) => {
    expect(path).toBe(join(files.storageRoot, 'discovery.json'));
    expect(max).toBe(DISCOVERY_BYTES); expect(operation).toBe('discovery-read');
    return files.read(path);
  } };
  const result = await readDiscovery(reader, discovery.authSetId);
  expect(result).toEqual(discovery);
  expect(Object.keys(owned)).toEqual([]);
  files.release(owned);
  await expect(readDiscovery(reader, 'd'.repeat(32))).rejects.toThrow('unauthorized');
});
