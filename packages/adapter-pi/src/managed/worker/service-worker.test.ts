import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { test, expect } from 'vitest';
import { fixture, cleanups } from '../test-helpers.js';
import { openWorkerDarwinManagedCore, openWorkerManagedCore } from '../service.js';
import { fixturePolicy } from '../test-policy.js';
import { WorkerFilesPort } from './files-port-proxy.js';

const nativeFixtureParent = fileURLToPath(new URL('../../../native/managed-darwin/', import.meta.url));
const nativeAddon = join(nativeFixtureParent, 'out', 'managed-darwin.node');
const nativeTest = process.platform === 'darwin' && existsSync(nativeAddon) ? test : test.skip;
if (process.platform !== 'darwin' || !existsSync(nativeAddon)) {
  console.info(`B4.2 Darwin Worker evidence skipped: ${process.platform !== 'darwin' ? 'non-Darwin host' : 'managed-darwin addon unavailable'}.`);
}
async function nativeFixture() {
  const base = await mkdtemp(join(nativeFixtureParent, '.d3-worker-store-'));
  // Keep the synthetic socket path below Darwin's sockaddr limit while still
  // using an explicit disposable fixture root (never HOME or a product path).
  const runtimeRoot = await mkdtemp('/private/tmp/d3w-');
  const roots = { storageRoot: join(base, 'd'), runtimeRoot };
  await mkdir(roots.storageRoot, { mode: 0o700 });
  cleanups.push(() => rm(base, { recursive: true, force: true }));
  cleanups.push(() => rm(runtimeRoot, { recursive: true, force: true }));
  return { base, roots, policy: await fixturePolicy(roots) };
}

test('B4.1 Worker Core cleans discovery and owner on start/stop', async () => {
  const f = await fixture();
  const service = await openWorkerManagedCore({ ...f, initialize: true, publish() {} });
  cleanups.push(() => service.stop().catch(() => {}));
  const target = await service.store.prepareTarget();
  await service.store.enableTarget(target.targetId, target.epoch, service.store.snapshot().revision);
  expect(service.store.current(target.targetId, target.epoch)).toBe(true);
  await service.store.revokeTarget(target.targetId, target.epoch, service.store.snapshot().revision);
  expect(service.store.current(target.targetId, target.epoch)).toBe(false);

  await service.start();
  await access(join(f.roots.storageRoot, 'discovery.json'));
  await service.stop();
  await expect(access(join(f.roots.storageRoot, 'discovery.json'))).rejects.toThrow();
  await expect(access(join(f.roots.storageRoot, 'owner'))).rejects.toThrow();
});

nativeTest('B4.2 Darwin Worker reads, writes, releases and removes through native storage', async () => {
  const f = await nativeFixture();
  const files = new WorkerFilesPort({ backend: 'darwin-addon', roots: f.roots, initialize: true });
  cleanups.push(() => files.close().catch(() => {}));
  const owner = await files.acquireOwner();
  const path = join(f.roots.storageRoot, 'authorization.json');
  const written = await files.publish(path, { value: true }, 2048, 'authority-write');
  const read = await files.read(path, 2048, 'authority-read');
  expect(read.value).toEqual({ value: true });
  await files.release(read.owned);
  await files.remove(written);
  await files.drain();
  await owner.remove();
  await owner.close();
});

nativeTest('B4.2 Darwin Worker rejects retained lease contention and reopens after clean stop', async () => {
  const f = await nativeFixture();
  const first = new WorkerFilesPort({ backend: 'darwin-addon', roots: f.roots, initialize: true });
  cleanups.push(() => first.close().catch(() => {}));
  const owner = await first.acquireOwner();
  const second = new WorkerFilesPort({ backend: 'darwin-addon', roots: f.roots, initialize: false });
  cleanups.push(() => second.close().catch(() => {}));
  await expect(second.initialized()).rejects.toMatchObject({ code: 'ownership-busy', effect: 'none' });
  // Failed init is terminal: no owner capability was admitted and a later
  // caller observes the same failed start rather than reacquiring/restarting.
  await expect(second.acquireOwner()).rejects.toMatchObject({ code: 'ownership-busy', effect: 'none' });
  await first.drain();
  await owner.remove();
  await owner.close();

  const reopened = new WorkerFilesPort({ backend: 'darwin-addon', roots: f.roots, initialize: false });
  cleanups.push(() => reopened.close().catch(() => {}));
  const reopenedOwner = await reopened.acquireOwner();
  await reopened.drain();
  await reopenedOwner.remove();
  await reopenedOwner.close();
});

nativeTest('B4.2 Darwin Worker Core removes discovery and owner, then cleanly reopens', async () => {
  const f = await nativeFixture();
  const service = await openWorkerDarwinManagedCore({ ...f, initialize: true, publish() {} });
  const target = await service.store.prepareTarget();
  await service.store.enableTarget(target.targetId, target.epoch, service.store.snapshot().revision);
  await service.start();
  await access(join(f.roots.storageRoot, 'discovery.json'));
  await service.stop();
  await expect(access(join(f.roots.storageRoot, 'discovery.json'))).rejects.toThrow();
  await expect(access(join(f.roots.storageRoot, 'owner'))).rejects.toThrow();

  const reopened = await openWorkerDarwinManagedCore({ ...f, initialize: false, publish() {} });
  cleanups.push(() => reopened.stop().catch(() => {}));
  await reopened.start();
  await reopened.stop();
});
