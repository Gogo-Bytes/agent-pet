import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthStore, CREDENTIAL_BYTES, credentialPath, parseCredential } from './auth-store.js';
import { DarwinFilesPort } from './darwin-files-port.js';

// Controlled native adapter faults; no production native implementation is changed.
const nativeControl = vi.hoisted(() => ({
  loaderFailure: undefined as Error | undefined,
  rootFailure: undefined as Error | undefined,
  closeFailure: undefined as 'owner' | 'transaction' | 'file' | 'root' | undefined,
  inspectFailure: undefined as 'file' | undefined,
  inspectFailures: 0,
  inspectAfterPublication: false,
  closeCalls: 0,
  closeKinds: [] as string[],
  beginWriteCalls: 0,
  nativeFailure: undefined as { method: 'createDirectory' | 'removeDirectoryChecked' | 'removeChecked' | 'beginWrite'; code: string } | undefined,
  cleanup: new Map<object, () => void>(),
}));
vi.mock('./native-darwin.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./native-darwin.js')>();
  return {
    ...actual,
    loadDarwinWritePrimitives: () => {
      if (nativeControl.loaderFailure) throw nativeControl.loaderFailure;
      const native = actual.loadDarwinWritePrimitives();
      type Handle = Parameters<typeof native.close>[0];
      const kinds = new WeakMap<Handle, string>();
      const remember = (handle: Handle, kind: string): Handle => {
        kinds.set(handle, kind);
        nativeControl.cleanup.set(handle, () => native.close(handle));
        return handle;
      };
      return {
        ...native,
        openRoot(path: string) {
          if (nativeControl.rootFailure) throw nativeControl.rootFailure;
          return remember(native.openRoot(path), 'root');
        },
        initializeWriter: (root: Handle) => remember(native.initializeWriter(root), 'lease'),
        acquireWriter: (root: Handle) => remember(native.acquireWriter(root), 'lease'),
        openFile: (parent: Handle, name: string) => remember(native.openFile(parent, name), 'file'),
        createDirectory: (...args: Parameters<typeof native.createDirectory>) => {
          if (nativeControl.nativeFailure?.method === 'createDirectory' &&
              (nativeControl.nativeFailure.code === 'owner' ? args[1] === 'owner' : args[1] === 'targets')) {
            throw new Error(nativeControl.nativeFailure.code === 'owner' ? 'ownership-uncertain' : nativeControl.nativeFailure.code);
          }
          return remember(native.createDirectory(...args), args[1]);
        },
        beginWrite: (...args: Parameters<typeof native.beginWrite>) => {
          nativeControl.beginWriteCalls++;
          if (nativeControl.nativeFailure?.method === 'beginWrite') throw new Error(nativeControl.nativeFailure.code);
          return remember(native.beginWrite(...args), 'transaction');
        },
        removeDirectoryChecked: (...args: Parameters<typeof native.removeDirectoryChecked>) => {
          if (nativeControl.nativeFailure?.method === 'removeDirectoryChecked') throw new Error(nativeControl.nativeFailure.code);
          return native.removeDirectoryChecked(...args);
        },
        removeChecked: (...args: Parameters<typeof native.removeChecked>) => {
          if (nativeControl.nativeFailure?.method === 'removeChecked') throw new Error(nativeControl.nativeFailure.code);
          return native.removeChecked(...args);
        },
        publishNew: (...args: Parameters<typeof native.publishNew>) => {
          const result = native.publishNew(...args);
          nativeControl.inspectAfterPublication = true;
          return result;
        },
        publishReplace: (...args: Parameters<typeof native.publishReplace>) => {
          const result = native.publishReplace(...args);
          nativeControl.inspectAfterPublication = true;
          return result;
        },
        inspect(handle: Handle) {
          if ((nativeControl.inspectAfterPublication || nativeControl.inspectFailure === (kinds.get(handle) ?? 'file')) &&
              (kinds.get(handle) ?? 'file') === 'file' && nativeControl.inspectFailures > 0) {
            nativeControl.inspectFailures--;
            throw new Error('evidence-unavailable');
          }
          return native.inspect(handle);
        },
        close(handle: Handle) {
          nativeControl.closeCalls++;
          const kind = kinds.get(handle) ?? 'file';
          nativeControl.closeKinds.push(kind);
          native.close(handle);
          nativeControl.cleanup.delete(handle);
          if (kind === nativeControl.closeFailure) throw new Error('close-uncertain');
        },
      };
    },
  };
});

afterEach(() => {
  nativeControl.loaderFailure = nativeControl.rootFailure = undefined;
  nativeControl.closeFailure = undefined;
  nativeControl.inspectFailure = undefined;
  nativeControl.inspectFailures = 0;
  nativeControl.inspectAfterPublication = false;
  nativeControl.closeCalls = 0;
  nativeControl.closeKinds = [];
  nativeControl.beginWriteCalls = 0;
  nativeControl.nativeFailure = undefined;
  // Test-only teardown for deliberately poisoned adapters; never a production retry.
  for (const cleanup of [...nativeControl.cleanup.values()].reverse()) cleanup();
  nativeControl.cleanup.clear();
});

const nativeTest = process.platform === 'darwin' ? test : test.skip;
const fixtureParent = fileURLToPath(new URL('../../native/managed-darwin/', import.meta.url));

async function fixture(): Promise<string> {
  return mkdtemp(join(fixtureParent, '.d3-native-store-'));
}

nativeTest('DarwinFilesPort runs the sole AuthStore through native create/read/publish/replace/remove and reopen', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  let store: AuthStore | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    await expect(AuthStore.open(files, true)).rejects.toThrow('unavailable');
    claim = await files.acquireOwner();
    store = await AuthStore.open(files, true);
    const pending = await store.prepareTarget();
    await store.enableTarget(pending.targetId, pending.epoch, store.snapshot().revision);
    const firstRead = await files.read(join(root, 'authorization.json'), 256 * 1024, 'authority-read');
    expect(firstRead.value).toMatchObject({ schema: 1 });
    files.release(firstRead.owned);
    const credentialRead = await files.read(credentialPath(root, pending.targetId, pending.epoch), CREDENTIAL_BYTES, 'credential-read');
    const credential = parseCredential(credentialRead.value, store.snapshot().authSetId, pending.targetId);
    files.release(credentialRead.owned);
    expect(store.authenticate({ type: 'auth', protocolVersion: 2, authSetId: credential.authSetId,
      targetId: credential.targetId, epoch: credential.epoch, generation: 'g'.repeat(32), token: credential.token })).toBe(true);

    await store.close(); store = undefined;
    await claim.remove(); await claim.close(); claim = undefined;
    await files.drain(); await files.close(); files = undefined;

    files = await DarwinFilesPort.open(root, false);
    claim = await files.acquireOwner();
    store = await AuthStore.open(files, false);
    expect(store.snapshot().targets).toEqual([{ targetId: pending.targetId, epoch: 1, state: 'enabled' }]);
    await store.rotateTarget(pending.targetId, 1, store.snapshot().revision);
    expect(store.snapshot().targets[0]?.state).toBe('enabled');
    await store.revokeTarget(pending.targetId, 2, store.snapshot().revision);
    expect(store.snapshot().targets[0]?.state).toBe('revoked');
    await expect(files.read(credentialPath(root, pending.targetId, 2), CREDENTIAL_BYTES, 'credential-read')).rejects.toThrow();
  } finally {
    await store?.close().catch(() => {});
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort drains an unpublished native transaction and rejects stale receipts before mutation', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    await files.createDirectory(join(root, 'targets'), 'authority-write');
    const first = await files.publish(join(root, 'authorization.json'),
      { schema: 1, authSetId: 'a'.repeat(32), revision: 1, targets: [] }, 256 * 1024, 'authority-write');
    await expect(files.remove(Object.freeze(Object.create(null)))).rejects.toThrow('path-changed');
    const second = await files.publish(join(root, 'authorization.json'),
      { schema: 1, authSetId: 'a'.repeat(32), revision: 2, targets: [] }, 256 * 1024, 'authority-write', first);
    await expect(files.remove(first)).rejects.toThrow('path-changed');
    await files.remove(second);
    const transaction = await files.beginWrite(join(root, 'authorization.json'), 256 * 1024, 'authority-write');
    await transaction.write({ schema: 1, authSetId: 'a'.repeat(32), revision: 1, targets: [] });
    await files.drain();
    expect(transaction.state).toBe('Aborted');
    await expect(transaction.write({})).rejects.toThrow('unavailable');
    await expect(files.close()).rejects.toThrow();
    await claim.remove(); await claim.close(); claim = undefined;
    await files.close(); files = undefined;
  } finally {
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort poisons after uncertain owner acquisition and fences later work', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    nativeControl.nativeFailure = { method: 'createDirectory', code: 'owner' };
    await expect(files.acquireOwner()).rejects.toThrow('outcome-uncertain');
    await expect(files.beginWrite(join(root, 'authorization.json'), 1024, 'authority-write')).rejects.toThrow('unavailable');
    await expect(files.drain()).rejects.toThrow('outcome-uncertain');
  } finally {
    nativeControl.nativeFailure = undefined;
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest.each(['mkdir-uncertain', 'sync-uncertain'] as const)('DarwinFilesPort poisons after uncertain directory mutation (%s)', async code => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    nativeControl.nativeFailure = { method: 'createDirectory', code };
    await expect(files.createDirectory(join(root, 'targets'), 'authority-write')).rejects.toThrow('outcome-uncertain');
    await expect(files.beginWrite(join(root, 'authorization.json'), 1024, 'authority-write')).rejects.toThrow('unavailable');
  } finally {
    nativeControl.nativeFailure = undefined;
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort poisons after uncertain owner removal', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    nativeControl.nativeFailure = { method: 'removeDirectoryChecked', code: 'remove-uncertain' };
    await expect(claim.remove()).rejects.toThrow('outcome-uncertain');
    await expect(files.beginWrite(join(root, 'authorization.json'), 1024, 'authority-write')).rejects.toThrow('unavailable');
  } finally {
    nativeControl.nativeFailure = undefined;
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort poisons after uncertain file removal', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    const receipt = await files.publish(join(root, 'authorization.json'), { revision: 1 }, 1024, 'authority-write');
    nativeControl.nativeFailure = { method: 'removeChecked', code: 'remove-uncertain' };
    await expect(files.remove(receipt)).rejects.toThrow('outcome-uncertain');
    await expect(files.beginWrite(join(root, 'authorization.json'), 1024, 'authority-write')).rejects.toThrow('unavailable');
  } finally {
    nativeControl.nativeFailure = undefined;
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort preserves CloseUncertain when abort handle close fails', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    const transaction = await files.beginWrite(join(root, 'authorization.json'), 1024, 'authority-write');
    await transaction.write({ revision: 1 });
    nativeControl.closeFailure = 'transaction';
    await expect(transaction.abort()).rejects.toThrow('outcome-uncertain');
    expect(transaction.state).toBe('CloseUncertain');
  } finally {
    nativeControl.closeFailure = undefined;
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort validates replacement receipts before transaction I/O', async () => {
  const root = await fixture();
  const foreignRoot = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  let foreignFiles: DarwinFilesPort | undefined;
  let foreignClaim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  let wrongPath: object | undefined;
  let foreignReceipt: object | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    foreignFiles = await DarwinFilesPort.open(foreignRoot, true);
    foreignClaim = await foreignFiles.acquireOwner();
    foreignReceipt = await foreignFiles.publish(join(foreignRoot, 'authorization.json'), { revision: 1 }, 1024, 'authority-write');
    wrongPath = await files.publish(join(root, 'discovery.json'), { revision: 1 }, 1024, 'discovery-write');
    const invalid = Object.freeze(Object.create(null));
    const authPath = join(root, 'authorization.json');
    for (const previous of [invalid, foreignReceipt, wrongPath]) {
      const before = nativeControl.beginWriteCalls;
      await expect(files.publish(authPath, { revision: 2 }, 1024, 'authority-write', previous)).rejects.toThrow('path-changed');
      expect(nativeControl.beginWriteCalls).toBe(before);
    }
    const previous = await files.publish(authPath, { revision: 3 }, 1024, 'authority-write');
    nativeControl.nativeFailure = { method: 'beginWrite', code: 'native-api' };
    const before = nativeControl.beginWriteCalls;
    await expect(files.publish(authPath, { revision: 4 }, 1024, 'authority-write', previous)).rejects.toThrow('durability-failed');
    expect(nativeControl.beginWriteCalls).toBe(before + 1);
    nativeControl.nativeFailure = undefined;
    await expect(files.remove(previous)).rejects.toThrow('path-changed');
  } finally {
    nativeControl.nativeFailure = undefined;
    if (wrongPath && files) await files.remove(wrongPath).catch(() => {});
    if (foreignReceipt && foreignFiles) await foreignFiles.remove(foreignReceipt).catch(() => {});
    if (foreignClaim) { await foreignClaim.remove().catch(() => {}); await foreignClaim.close().catch(() => {}); }
    if (foreignFiles) { await foreignFiles.drain().catch(() => {}); await foreignFiles.close().catch(() => {}); }
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
    await rm(foreignRoot, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort requires owner capability close before backend disposal', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    nativeControl.closeCalls = 0;
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    await expect(claim.close()).rejects.toThrow('unavailable');
    await claim.remove();
    await files.drain();
    expect(nativeControl.closeCalls).toBe(0);
    await expect(files.close()).rejects.toThrow('unavailable');
    expect(nativeControl.closeCalls).toBe(0);
    await claim.close(); claim = undefined;
    await files.close(); files = undefined;
    expect(nativeControl.closeKinds).toEqual(['owner', 'lease', 'root']);
  } finally {
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest.each(['new', 'replace'] as const)('DarwinFilesPort drains a forgotten published %s transaction handle before disposal', async publication => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    nativeControl.closeCalls = 0;
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    const transaction = await files.beginWrite(join(root, 'authorization.json'), 256 * 1024, 'authority-write');
    await transaction.write({ schema: 1, authSetId: 'a'.repeat(32), revision: 1, targets: [] });
    if (publication === 'new') await transaction.publishNew();
    else {
      const previous = await files.publish(join(root, 'authorization.json'), { revision: 0 }, 1024, 'authority-write');
      await transaction.publishReplace(previous);
    }
    const beforeDrain = nativeControl.closeKinds.length;
    await files.drain();
    expect(transaction.state).toBe('Published');
    expect(nativeControl.closeKinds.slice(beforeDrain)).toEqual(['transaction']);
    await claim.remove(); await claim.close(); claim = undefined;
    await files.close(); files = undefined;
  } finally {
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort treats read cleanup close uncertainty as terminal', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    const receipt = await files.publish(join(root, 'authorization.json'), { revision: 1 }, 1024, 'authority-write');
    files.release(receipt);
    nativeControl.inspectFailure = 'file'; nativeControl.inspectFailures = 1; nativeControl.closeFailure = 'file';
    const before = nativeControl.closeKinds.filter(kind => kind === 'file').length;
    await expect(files.read(join(root, 'authorization.json'), 1024, 'authority-read')).rejects.toThrow('outcome-uncertain');
    expect(nativeControl.closeKinds.filter(kind => kind === 'file').length - before).toBe(1);
  } finally {
    nativeControl.closeFailure = undefined;
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort treats transaction abort temporary close uncertainty as terminal', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    const transaction = await files.beginWrite(join(root, 'authorization.json'), 1024, 'authority-write');
    await transaction.write({ revision: 1 });
    nativeControl.closeFailure = 'file';
    await expect(transaction.abort()).rejects.toThrow('outcome-uncertain');
    expect(transaction.state).toBe('MutationUncertain');
    expect(nativeControl.closeKinds.filter(kind => kind === 'file')).toHaveLength(1);
  } finally {
    nativeControl.closeFailure = undefined;
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort treats replacement expected close uncertainty as terminal', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    const previous = await files.publish(join(root, 'authorization.json'), { revision: 1 }, 1024, 'authority-write');
    const transaction = await files.beginWrite(join(root, 'authorization.json'), 1024, 'authority-write');
    await transaction.write({ revision: 2 });
    nativeControl.inspectFailure = 'file'; nativeControl.inspectFailures = 1; nativeControl.closeFailure = 'file';
    const before = nativeControl.closeKinds.filter(kind => kind === 'file').length;
    await expect(transaction.publishReplace(previous)).rejects.toThrow('outcome-uncertain');
    expect(nativeControl.closeKinds.filter(kind => kind === 'file').length - before).toBe(1);
  } finally {
    nativeControl.closeFailure = undefined;
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort treats removal close uncertainty as terminal', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    const receipt = await files.publish(join(root, 'authorization.json'), { revision: 1 }, 1024, 'authority-write');
    nativeControl.closeFailure = 'file';
    const before = nativeControl.closeKinds.filter(kind => kind === 'file').length;
    await expect(files.remove(receipt)).rejects.toThrow('outcome-uncertain');
    expect(nativeControl.closeKinds.filter(kind => kind === 'file').length - before).toBe(1);
  } finally {
    nativeControl.closeFailure = undefined;
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest.each(['new', 'replace'] as const)('DarwinFilesPort closes final publication handle on validation failure (%s)', async publication => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    const previous = publication === 'replace'
      ? await files.publish(join(root, 'authorization.json'), { revision: 0 }, 1024, 'authority-write')
      : undefined;
    nativeControl.inspectAfterPublication = false;
    const transaction = await files.beginWrite(join(root, 'authorization.json'), 1024, 'authority-write');
    await transaction.write({ revision: 1 });
    nativeControl.inspectFailure = undefined; nativeControl.inspectFailures = 1;
    nativeControl.inspectAfterPublication = false;
    nativeControl.closeFailure = 'file';
    const before = nativeControl.closeKinds.filter(kind => kind === 'file').length;
    const result = publication === 'new' ? transaction.publishNew() : transaction.publishReplace(previous!);
    await expect(result).rejects.toThrow('outcome-uncertain');
    expect(nativeControl.closeKinds.filter(kind => kind === 'file').length - before).toBe(publication === 'new' ? 1 : 2);
  } finally {
    nativeControl.closeFailure = undefined;
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort preserves publication close uncertainty while closing its transaction', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    nativeControl.inspectFailures = 1;
    nativeControl.inspectAfterPublication = false;
    nativeControl.closeFailure = 'file';
    await expect(files.publish(join(root, 'authorization.json'), { revision: 1 }, 1024, 'authority-write'))
      .rejects.toThrow('outcome-uncertain');
    expect(nativeControl.closeKinds.filter(kind => kind === 'file')).toHaveLength(1);
    expect(nativeControl.closeKinds.filter(kind => kind === 'transaction')).toHaveLength(1);
  } finally {
    nativeControl.closeFailure = undefined;
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort does not retry an uncertain backend close', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    await claim.remove(); await claim.close(); claim = undefined;
    await files.drain();
    nativeControl.closeFailure = 'root';
    await expect(files.close()).rejects.toThrow('outcome-uncertain');
    const rootCloses = nativeControl.closeKinds.filter(kind => kind === 'root').length;
    await expect(files.close()).rejects.toThrow('outcome-uncertain');
    expect(nativeControl.closeKinds.filter(kind => kind === 'root')).toHaveLength(rootCloses);
  } finally {
    nativeControl.closeFailure = undefined;
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort retains the owner barrier after uncertain owner close', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    await claim.remove();
    await files.drain();
    nativeControl.closeFailure = 'owner';
    await expect(claim.close()).rejects.toThrow('outcome-uncertain');
    await expect(files.close()).rejects.toThrow('unavailable');
  } finally {
    nativeControl.closeFailure = undefined;
    if (claim) await claim.close().catch(() => {});
    if (files) await files.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest('DarwinFilesPort retains the transaction barrier after uncertain transaction close', async () => {
  const root = await fixture();
  let files: DarwinFilesPort | undefined;
  let claim: Awaited<ReturnType<DarwinFilesPort['acquireOwner']>> | undefined;
  try {
    files = await DarwinFilesPort.open(root, true);
    claim = await files.acquireOwner();
    const transaction = await files.beginWrite(join(root, 'authorization.json'), 256 * 1024, 'authority-write');
    await transaction.write({ schema: 1, authSetId: 'a'.repeat(32), revision: 1, targets: [] });
    await transaction.publishNew();
    nativeControl.closeFailure = 'transaction';
    await expect(transaction.close()).rejects.toThrow('outcome-uncertain');
    await expect(files.drain()).rejects.toThrow('outcome-uncertain');
    await expect(files.close()).rejects.toThrow('unavailable');
  } finally {
    nativeControl.closeFailure = undefined;
    if (claim) { await claim.remove().catch(() => {}); await claim.close().catch(() => {}); }
    if (files) { await files.drain().catch(() => {}); await files.close().catch(() => {}); }
    await rm(root, { recursive: true, force: true });
  }
});

nativeTest.each(['native-version', 'native-write-version', 'cannot load /private/secret/managed-darwin.node'])(
  'DarwinFilesPort sanitizes native loader failure %s without leaking details', async message => {
  nativeControl.loaderFailure = Object.assign(new Error(message), { path: '/private/secret', cause: new Error('secret') });
  try {
    const error = await DarwinFilesPort.open('/private/secret/store', true).catch(error => error);
    expect(error).toMatchObject({ name: 'ManagedError', code: 'store-corrupt', message: 'store-corrupt' });
    expect(error).not.toHaveProperty('path');
    expect(error).not.toHaveProperty('cause');
    expect(String(error)).not.toContain('secret');
  } finally {
    nativeControl.loaderFailure = undefined;
  }
});

nativeTest.each(['acl-unavailable', 'evidence-unavailable'] as const)('DarwinFilesPort maps native %s to acl-unverified', async code => {
  nativeControl.rootFailure = new Error(code);
  try {
    await expect(DarwinFilesPort.open('/private/secret/store', true)).rejects.toMatchObject({
      name: 'ManagedError', code: 'acl-unverified', message: 'acl-unverified',
    });
  } finally {
    nativeControl.rootFailure = undefined;
  }
});
