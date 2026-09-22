import { expect, test } from 'vitest';
import { join } from 'node:path';
import { AuthStore, CREDENTIAL_BYTES, credentialPath, parseCredential } from './auth-store.js';
import { DISCOVERY_BYTES, readDiscovery, type Discovery } from './discovery.js';
import type { FileReceipt, FilesPort, FilesReader } from './files-port.js';

/** Consumer fixture only: no filesystem or native security claims. */
class MemoryFiles implements FilesPort {
  readonly storageRoot = '/synthetic-storage';
  private entries = new Map<string, { value: unknown; owned: FileReceipt }>();
  private receipts = new WeakMap<FileReceipt, string>();
  async createDirectory(): Promise<void> {}
  async read(path: string): Promise<{ value: unknown; owned: FileReceipt }> {
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
  const files: FilesPort = new MemoryFiles();
  let store = await AuthStore.open(files, true);
  const target = await store.prepareTarget();
  expect(store.current(target.targetId, 1)).toBe(false);
  await store.enableTarget(target.targetId, 1, store.snapshot().revision);
  const authSetId = store.snapshot().authSetId;
  const credential = parseCredential((await files.read(credentialPath(files.storageRoot, target.targetId, 1), CREDENTIAL_BYTES, 'credential-read')).value, authSetId, target.targetId);
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

test('discovery needs only the read projection and preserves an opaque backend receipt', async () => {
  const files = new MemoryFiles();
  const discovery: Discovery = { schema: 1, protocolVersion: 2, authSetId: 'a'.repeat(32), generation: 'b'.repeat(32), instance: 'c'.repeat(32), credentialLayout: 1 };
  const owned = await files.publish(join(files.storageRoot, 'discovery.json'), discovery, DISCOVERY_BYTES, 'discovery-write');
  const reader: FilesReader = { storageRoot: files.storageRoot, read: async (path, max, operation) => {
    expect(path).toBe(join(files.storageRoot, 'discovery.json'));
    expect(max).toBe(DISCOVERY_BYTES); expect(operation).toBe('discovery-read');
    return files.read(path);
  } };
  const result = await readDiscovery(reader, discovery.authSetId);
  expect(result.discovery).toEqual(discovery);
  expect(result.owned).toBe(owned);
  expect(Object.keys(result.owned)).toEqual([]);
  await expect(readDiscovery(reader, 'd'.repeat(32))).rejects.toThrow('unauthorized');
});
