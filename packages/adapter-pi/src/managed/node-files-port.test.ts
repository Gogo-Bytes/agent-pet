import { expect, test, vi } from 'vitest';
import { access, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeFilesPort } from './node-files-port.js';
import { PrivateFiles } from './private-files.js';
import { connectManagedCore } from './client.js';
import { openManagedCore } from './service.js';
import { baseline, cleanups, enabled, fixture, opened } from './test-helpers.js';

test('NodeFilesPort rejects forged, copied, cross-adapter and wrong-path receipts before any mutation', async () => {
  const f = await fixture(); const boundaries: string[] = [];
  const files = new PrivateFiles(await f.policy.openRoots(f.roots), step => { boundaries.push(step); });
  const adapter = new NodeFilesPort(files); const other = new NodeFilesPort(files);
  const path = join(f.roots.storageRoot, 'test.json');
  const receipt = await adapter.publish(path, { original: true }, 1024, 'authority-write');
  const foreign = (await other.read(path, 1024, 'authority-read')).owned;
  const raw = (await files.read(path, 1024, 'authority-read')).owned;
  const before = await readdir(f.roots.storageRoot);
  for (const invalid of [{}, { ...receipt }, foreign, raw]) {
    boundaries.length = 0;
    await expect(adapter.publish(path, { changed: true }, 1024, 'authority-write', invalid)).rejects.toThrow('path-changed');
    await expect(adapter.remove(invalid)).rejects.toThrow('path-changed');
    expect(boundaries).toEqual([]);
    expect(await readdir(f.roots.storageRoot)).toEqual(before);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ original: true });
  }
  boundaries.length = 0;
  await expect(adapter.publish(join(f.roots.storageRoot, 'other.json'), {}, 1024, 'authority-write', receipt)).rejects.toThrow('path-changed');
  expect(boundaries).toEqual([]);
  expect(await readdir(f.roots.storageRoot)).toEqual(before);
  const replaced = await adapter.publish(path, { changed: true }, 1024, 'authority-write', receipt);
  expect(replaced).not.toBe(receipt);
  expect(Object.keys(replaced)).toEqual([]);
  await adapter.remove(replaced);
  expect(await readdir(f.roots.storageRoot)).toEqual([]);
});

test('NodeFilesPort consumes a valid replacement receipt before begin/write I/O', async () => {
  let failCreate = false; const f = await fixture();
  const adapter = new NodeFilesPort(new PrivateFiles(await f.policy.openRoots(f.roots), step => {
    if (failCreate && step === 'create') throw new Error('create');
  }));
  const path = join(f.roots.storageRoot, 'replace.json');
  const previous = await adapter.publish(path, { old: true }, 1024, 'authority-write');
  failCreate = true;
  await expect(adapter.publish(path, { new: true }, 1024, 'authority-write', previous)).rejects.toThrow('durability-failed');
  await expect(adapter.remove(previous)).rejects.toThrow('path-changed');
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ old: true });
});

test('NodeFilesPort transaction states distinguish pre-write, write/fsync, publish, and sync failures', async () => {
  let mode: 'write' | 'file-sync' | 'publish' | 'directory-sync' | undefined;
  const f = await fixture();
  const backend = new PrivateFiles(await f.policy.openRoots(f.roots), (step, operation) => {
    if (operation === 'authority-write' && step === mode) throw new Error(step);
  });
  const adapter = new NodeFilesPort(backend);
  const pre = await adapter.beginWrite(join(f.roots.storageRoot, 'pre.json'), 1024, 'authority-write');
  mode = 'write'; await expect(pre.write({ value: 1 })).rejects.toThrow('durability-failed');
  expect(pre.state).toBe('Prepared'); await pre.abort(); expect(pre.state).toBe('Aborted'); await pre.close();
  const sync = await adapter.beginWrite(join(f.roots.storageRoot, 'fsync.json'), 1024, 'authority-write');
  mode = 'file-sync'; await expect(sync.write({ value: 1 })).rejects.toThrow('durability-failed');
  expect(sync.state).toBe('MutationUncertain'); await expect(sync.abort()).rejects.toThrow('outcome-uncertain'); await sync.close();
  const publish = await adapter.beginWrite(join(f.roots.storageRoot, 'publish.json'), 1024, 'authority-write');
  mode = undefined; await publish.write({ value: 1 }); mode = 'publish';
  await expect(publish.publishNew()).rejects.toThrow('durability-failed'); expect(publish.state).toBe('Writing');
  await publish.abort(); expect(publish.state).toBe('Aborted'); await publish.close();
  const directory = join(f.roots.storageRoot, 'sync.json');
  const parent = await adapter.beginWrite(directory, 1024, 'authority-write');
  mode = undefined; await parent.write({ value: 1 }); mode = 'directory-sync';
  await expect(parent.publishNew()).rejects.toThrow('outcome-uncertain'); expect(parent.state).toBe('MutationUncertain');
  await expect(parent.abort()).rejects.toThrow('outcome-uncertain'); await parent.close();
  mode = undefined;
  await unlink(directory);
});

test('NodeFilesPort rejects close before a completed drain', async () => {
  const f = await fixture(); const adapter = new NodeFilesPort(new PrivateFiles(await f.policy.openRoots(f.roots)));
  await expect(adapter.close()).rejects.toThrow('unavailable');
  await adapter.drain();
  await adapter.close();
});

test('NodeFilesPort rejects retained receipt removal after close', async () => {
  const f = await fixture(); const adapter = new NodeFilesPort(new PrivateFiles(await f.policy.openRoots(f.roots)));
  const path = join(f.roots.storageRoot, 'retained.json'); const receipt = await adapter.publish(path, { value: true }, 1024, 'authority-write');
  await adapter.drain(); await adapter.close();
  await expect(adapter.remove(receipt)).rejects.toThrow('unavailable');
  await expect(access(path)).resolves.toBeUndefined();
});

test('NodeFilesPort drains a live unpublished transaction before backend close', async () => {
  const f = await fixture(); const adapter = new NodeFilesPort(new PrivateFiles(await f.policy.openRoots(f.roots)));
  const transaction = await adapter.beginWrite(join(f.roots.storageRoot, 'drain.json'), 1024, 'authority-write');
  await adapter.drain();
  expect(transaction.state).toBe('Aborted');
  expect((await readdir(f.roots.storageRoot)).filter(name => name.startsWith('.write-'))).toEqual([]);
  await adapter.close();
  await expect(access(join(f.roots.storageRoot, 'drain.json'))).rejects.toThrow();
});

test.each(['create', 'write'] as const)('NodeFilesPort drains in-flight %s without exposing its cleanup capability', async stepToPause => {
  const f = await fixture(); let release!: () => void; let entered!: () => void; let armed = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const backend = new PrivateFiles(await f.policy.openRoots(f.roots), async (step, operation) => {
    if (armed && step === stepToPause && operation === 'authority-write') { entered(); await gate; }
  });
  const adapter = new NodeFilesPort(backend);
  const idle = await adapter.beginWrite(join(f.roots.storageRoot, 'idle.json'), 1024, 'authority-write');
  const path = join(f.roots.storageRoot, 'in-flight-write.json');
  const writing = stepToPause === 'write' ? await adapter.beginWrite(path, 1024, 'authority-write') : undefined;
  armed = true;
  const work = writing ? writing.write({ value: true }).then(() => writing) : adapter.beginWrite(path, 1024, 'authority-write');
  await enteredPromise;
  const draining = adapter.drain();
  let drained = false; void draining.then(() => { drained = true; });
  // The idle transaction is not busy: these rejections must come from the fence.
  for (const action of [() => idle.write({}), () => idle.publishNew(), () => idle.publishReplace({}), () => idle.abort(), () => idle.close()]) {
    await expect(action()).rejects.toThrow('unavailable');
  }
  await expect(adapter.beginWrite(path, 1024, 'authority-write')).rejects.toThrow('unavailable');
  await expect(adapter.close()).rejects.toThrow('unavailable');
  expect(drained).toBe(false);
  expect((await readdir(f.roots.storageRoot)).some(name => name.startsWith('.write-'))).toBe(true);
  release(); const transaction = await work; await draining;
  expect(transaction.state).toBe('Aborted'); expect(idle.state).toBe('Aborted');
  expect((await readdir(f.roots.storageRoot)).filter(name => name.startsWith('.write-'))).toEqual([]);
  await expect(access(path)).rejects.toThrow();
  await expect(transaction.abort()).rejects.toThrow('unavailable');
  await expect(transaction.close()).rejects.toThrow('unavailable');
  await adapter.close();
  await expect(idle.abort()).rejects.toThrow('unavailable');
  await expect(idle.close()).rejects.toThrow('unavailable');
});

test.each(['directory-sync', 'transaction-close'] as const)('NodeFilesPort retains a failed drain abort barrier on %s failure', async faultStep => {
  const f = await fixture(); let failures = 0;
  const backend = new PrivateFiles(await f.policy.openRoots(f.roots), (step, operation) => {
    if (step === faultStep && (step === 'transaction-close' || operation === 'cleanup')) {
      failures++; throw Object.assign(new Error('abort failed'), { code: 'ENOENT' });
    }
  });
  const adapter = new NodeFilesPort(backend);
  const path = join(f.roots.storageRoot, 'drain-abort-failure.json');
  const transaction = await adapter.beginWrite(path, 1024, 'authority-write');
  await transaction.write({ value: true });
  const temporaries = (await readdir(f.roots.storageRoot)).filter(name => name.startsWith('.write-'));
  expect(temporaries).toHaveLength(1);
  const draining = adapter.drain();
  await expect(draining).rejects.toThrow('outcome-uncertain');
  expect(transaction.state).toBe(faultStep === 'transaction-close' ? 'CloseUncertain' : 'MutationUncertain');
  expect((await readdir(f.roots.storageRoot)).filter(name => name.startsWith('.write-'))).toEqual(faultStep === 'transaction-close' ? temporaries : []);
  expect(adapter.drain()).toBe(draining);
  await expect(adapter.drain()).rejects.toThrow('outcome-uncertain');
  await expect(adapter.close()).rejects.toThrow('unavailable');
  await expect(transaction.abort()).rejects.toThrow('unavailable');
  await expect(transaction.close()).rejects.toThrow('unavailable');
  expect(failures).toBe(1);
  await expect(access(path)).rejects.toThrow();
});

test('NodeFilesPort drain cleanup cannot bypass a poisoned adapter', async () => {
  const f = await fixture(); let closes = 0;
  const backend = new PrivateFiles(await f.policy.openRoots(f.roots), (step, operation) => {
    if (step === 'transaction-close') closes++;
    if (step === 'directory-sync' && operation === 'authority-write') throw new Error('sync failed');
  });
  const adapter = new NodeFilesPort(backend);
  const transaction = await adapter.beginWrite(join(f.roots.storageRoot, 'poisoned.json'), 1024, 'authority-write');
  const temporaries = (await readdir(f.roots.storageRoot)).filter(name => name.startsWith('.write-'));
  expect(temporaries).toHaveLength(1);
  await expect(adapter.createDirectory(join(f.roots.storageRoot, 'poison'), 'authority-write')).rejects.toThrow('outcome-uncertain');
  await expect(adapter.drain()).rejects.toThrow('outcome-uncertain');
  await expect(adapter.close()).rejects.toThrow('unavailable');
  expect(transaction.state).toBe('Prepared'); expect(closes).toBe(1);
  expect((await readdir(f.roots.storageRoot)).filter(name => name.startsWith('.write-'))).toEqual(temporaries);
});

test('NodeFilesPort waits for an in-flight removal before drain completes and close', async () => {
  const f = await fixture(); let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const backend = new PrivateFiles(await f.policy.openRoots(f.roots), async (step, operation) => {
    if (step === 'cleanup' && operation === 'cleanup') { entered(); await gate; }
  });
  const adapter = new NodeFilesPort(backend); const path = join(f.roots.storageRoot, 'in-flight.json');
  const receipt = await adapter.publish(path, { value: true }, 1024, 'authority-write');
  const removing = adapter.remove(receipt); await enteredPromise;
  const draining = adapter.drain();
  await expect(access(path)).resolves.toBeUndefined();
  release(); await Promise.all([removing, draining]); await adapter.close();
  await expect(access(path)).rejects.toThrow();
});

test('NodeFilesPort tracks owner acquisition until it cannot escape drain', async () => {
  const f = await fixture(); let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const backend = new PrivateFiles(await f.policy.openRoots(f.roots), async (step, operation) => {
    if (step === 'create' && operation === 'ownership') { entered(); await gate; }
  });
  const adapter = new NodeFilesPort(backend); const acquiring = adapter.acquireOwner(); await enteredPromise;
  const draining = adapter.drain();
  await expect(adapter.close()).rejects.toThrow('unavailable');
  release();
  await expect(acquiring).rejects.toThrow('unavailable');
  await draining; await adapter.close();
  await expect(access(join(f.roots.storageRoot, 'owner'))).rejects.toThrow();
});

test('NodeFilesPort poisons the drain barrier after owner post-mkdir failure', async () => {
  const f = await fixture();
  const backend = new PrivateFiles(await f.policy.openRoots(f.roots), (step, operation) => {
    if (step === 'directory-sync' && operation === 'ownership') throw new Error('sync failed');
  });
  const adapter = new NodeFilesPort(backend);
  await expect(adapter.acquireOwner()).rejects.toThrow('outcome-uncertain');
  await expect(access(join(f.roots.storageRoot, 'owner'))).resolves.toBeUndefined();
  await expect(adapter.drain()).rejects.toThrow('outcome-uncertain');
  await expect(adapter.close()).rejects.toThrow('unavailable');
});

test('NodeFilesPort poisons owner cleanup after a substitution race across drain', async () => {
  const f = await fixture(); let release!: () => void; let entered!: () => void; let closeCalls = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  class DelayedOwnerFiles extends PrivateFiles {
    override async acquireOwner() {
      const owner = await super.acquireOwner();
      entered(); await gate;
      return {
        path: owner.path,
        get removed() { return owner.removed; },
        remove: owner.remove.bind(owner),
        close: async () => { closeCalls++; await owner.close(); },
      };
    }
  }
  const backend = new DelayedOwnerFiles(await f.policy.openRoots(f.roots));
  const adapter = new NodeFilesPort(backend); const owner = join(f.roots.storageRoot, 'owner');
  const acquiring = adapter.acquireOwner(); await enteredPromise;
  const draining = adapter.drain(); const replacement = join(f.roots.storageRoot, 'owner-replaced');
  await rename(owner, replacement); await mkdir(owner, { mode: 0o700 });
  release();
  await expect(acquiring).rejects.toThrow('path-changed');
  await expect(draining).rejects.toThrow('outcome-uncertain');
  await expect(adapter.close()).rejects.toThrow('unavailable');
  expect(() => adapter.acquireOwner()).toThrow('unavailable');
  expect(closeCalls).toBe(0);
  await access(owner); await access(replacement);
});

test('NodeFilesPort tracks directory creation until drain completes', async () => {
  const f = await fixture(); let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const backend = new PrivateFiles(await f.policy.openRoots(f.roots), async (step, operation) => {
    if (step === 'create' && operation === 'authority-write') { entered(); await gate; }
  });
  const adapter = new NodeFilesPort(backend); const path = join(f.roots.storageRoot, 'created-during-drain');
  const creating = adapter.createDirectory(path, 'authority-write'); await enteredPromise;
  const draining = adapter.drain();
  await expect(adapter.close()).rejects.toThrow('unavailable');
  release(); await creating; await draining; await adapter.close();
  await access(path); await rmdir(path);
});

test('NodeFilesPort poisons the drain barrier after a generic post-mkdir failure', async () => {
  const f = await fixture();
  const backend = new PrivateFiles(await f.policy.openRoots(f.roots), (step, operation) => {
    if (step === 'directory-sync' && operation === 'authority-write') throw new Error('sync failed');
  });
  const adapter = new NodeFilesPort(backend); const path = join(f.roots.storageRoot, 'post-mkdir-generic');
  await expect(adapter.createDirectory(path, 'authority-write')).rejects.toThrow('outcome-uncertain');
  await expect(access(path)).resolves.toBeUndefined();
  await expect(adapter.drain()).rejects.toThrow('outcome-uncertain');
});

test('NodeFilesPort keeps an unpublished transaction tracked after close', async () => {
  const f = await fixture(); const adapter = new NodeFilesPort(new PrivateFiles(await f.policy.openRoots(f.roots)));
  const path = join(f.roots.storageRoot, 'closed-unpublished.json');
  const transaction = await adapter.beginWrite(path, 1024, 'authority-write');
  await transaction.write({ value: true }); await transaction.close();
  expect(transaction.state).toBe('Writing');
  await expect(adapter.close()).rejects.toThrow('unavailable');
  await adapter.drain(); expect(transaction.state).toBe('Aborted');
  await adapter.close();
  await expect(access(path)).rejects.toThrow();
});

test('NodeFilesPort maps generic post-unlink sync errors to mutation uncertainty', async () => {
  const f = await fixture();
  const backend = new PrivateFiles(await f.policy.openRoots(f.roots), (step, operation) => {
    if (step === 'directory-sync' && operation === 'cleanup') throw new Error('sync failed');
  });
  const adapter = new NodeFilesPort(backend); const path = join(f.roots.storageRoot, 'post-mutation-generic.json');
  const receipt = await adapter.publish(path, { value: true }, 1024, 'authority-write');
  await expect(adapter.remove(receipt)).rejects.toThrow('outcome-uncertain');
  await expect(access(path)).rejects.toThrow();
  await expect(adapter.drain()).rejects.toThrow('outcome-uncertain');
});

test('NodeFilesPort treats post-unlink ENOENT as mutation uncertainty', async () => {
  const f = await fixture();
  const backend = new PrivateFiles(await f.policy.openRoots(f.roots), (step, operation) => {
    if (step === 'directory-sync' && operation === 'cleanup') throw Object.assign(new Error('missing sync'), { code: 'ENOENT' });
  });
  const adapter = new NodeFilesPort(backend); const path = join(f.roots.storageRoot, 'post-mutation.json');
  const receipt = await adapter.publish(path, { value: true }, 1024, 'authority-write');
  await expect(adapter.remove(receipt)).rejects.toThrow('outcome-uncertain');
  await expect(access(path)).rejects.toThrow();
  await expect(adapter.drain()).rejects.toThrow('outcome-uncertain');
});

test('NodeFilesPort retains a transaction barrier when abort sync returns ENOENT', async () => {
  const f = await fixture();
  const backend = new PrivateFiles(await f.policy.openRoots(f.roots), (step, operation) => {
    if (step === 'directory-sync' && operation === 'cleanup') throw Object.assign(new Error('missing sync'), { code: 'ENOENT' });
  });
  const adapter = new NodeFilesPort(backend); const transaction = await adapter.beginWrite(join(f.roots.storageRoot, 'abort-uncertain.json'), 1024, 'authority-write');
  await transaction.write({ value: true });
  await expect(transaction.abort()).rejects.toThrow('outcome-uncertain');
  expect(transaction.state).toBe('MutationUncertain');
  await transaction.close();
  await expect(adapter.drain()).rejects.toThrow('outcome-uncertain');
});

test('NodeFilesPort receipts are single-use and repeated descriptor-free reads settle', async () => {
  const f = await fixture(); const adapter = new NodeFilesPort(new PrivateFiles(await f.policy.openRoots(f.roots)));
  const path = join(f.roots.storageRoot, 'test.json');
  await adapter.publish(path, { value: true }, 1024, 'authority-write');
  const descriptorsBefore = await readdir('/proc/self/fd').catch(() => undefined);
  for (let n = 0; n < 100; n++) {
    const result = await adapter.read(path, 1024, 'authority-read');
    adapter.release(result.owned);
    expect(() => adapter.release(result.owned)).toThrow('path-changed');
  }
  const descriptorsAfter = await readdir('/proc/self/fd').catch(() => undefined);
  if (descriptorsBefore && descriptorsAfter) expect(descriptorsAfter.length).toBeLessThanOrEqual(descriptorsBefore.length + 2);
  const other = new NodeFilesPort(new PrivateFiles(await f.policy.openRoots(f.roots)));
  const foreign = (await other.read(path, 1024, 'authority-read')).owned;
  await expect(adapter.remove(foreign)).rejects.toThrow('path-changed');
  const current = (await adapter.read(path, 1024, 'authority-read')).owned;
  await adapter.remove(current);
  await expect(adapter.remove(current)).rejects.toThrow('path-changed');
});

test('NodeFilesPort transactions explicitly abort, publish, and retain close uncertainty', async () => {
  let closeFailure = false; let closeCalls = 0;
  const f = await fixture();
  const fault = (step: 'transaction-close' | string) => { if (step === 'transaction-close' && closeFailure) { closeCalls++; closeFailure = false; throw new Error('close'); } };
  const adapter = new NodeFilesPort(new PrivateFiles(await f.policy.openRoots(f.roots), fault));
  const path = join(f.roots.storageRoot, 'transaction.json');
  const aborted = await adapter.beginWrite(path, 1024, 'authority-write');
  await aborted.write({ aborted: true }); await aborted.abort(); await aborted.close();
  await expect(access(path)).rejects.toThrow();
  const published = await adapter.beginWrite(path, 1024, 'authority-write');
  await published.write({ published: true }); closeFailure = true;
  await expect(published.close()).rejects.toThrow('outcome-uncertain');
  expect(published.state).toBe('CloseUncertain');
  await expect(published.close()).rejects.toThrow('outcome-uncertain');
  expect(closeCalls).toBe(1);
  await expect(adapter.close()).rejects.toThrow('unavailable');
});

test('NodeFilesPort delegates read bounds and changed-file cleanup errors unchanged', async () => {
  const f = await fixture(); const adapter = new NodeFilesPort(new PrivateFiles(await f.policy.openRoots(f.roots)));
  const path = join(f.roots.storageRoot, 'test.json');
  await adapter.publish(path, { original: true }, 1024, 'authority-write');
  await expect(adapter.read(path, 1, 'authority-read')).rejects.toThrow('limit-exceeded');
  const { owned } = await adapter.read(path, 1024, 'authority-read');
  await writeFile(path, JSON.stringify({ changed: 'different size' }));
  await expect(adapter.remove(owned)).rejects.toThrow('path-changed');
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ changed: 'different size' });
});

test('real service/client auth and discovery use NodeFilesPort and retain mutation fault hooks', async () => {
  const reading = vi.spyOn(NodeFilesPort.prototype, 'read');
  const publishing = vi.spyOn(NodeFilesPort.prototype, 'publish');
  const removing = vi.spyOn(NodeFilesPort.prototype, 'remove');
  try {
    let armed = false; const observations: unknown[] = [];
    const f = await opened({ publish: value => { observations.push(value); }, fault(step, operation) {
      if (armed && step === 'write' && operation === 'credential-write') throw new Error('synthetic');
    } });
    const target = await enabled(f.service);
    await f.service.start();
    const options = { ...f, authSetId: f.service.store.snapshot().authSetId, targetId: target.targetId };
    // A changed adapter read actually prevents connection, not merely a recorded unused call.
    reading.mockResolvedValueOnce({ value: {}, owned: Object.freeze({}) });
    await expect(connectManagedCore(options)).rejects.toThrow('path-changed');
    const client = await connectManagedCore(options);
    cleanups.push(async () => { client.close(); });
    client.send(baseline());
    await expect.poll(() => observations.length).toBe(1);
    expect(new Set(reading.mock.calls.map(call => call[2]))).toEqual(new Set(['credential-read', 'discovery-read', 'authority-read']));
    expect(new Set(publishing.mock.calls.map(call => call[3]))).toEqual(new Set(['authority-write', 'credential-write', 'discovery-write']));
    await f.service.store.revokeTarget(target.targetId, 1, f.service.store.snapshot().revision);
    expect(removing).toHaveBeenCalled();
    await expect.poll(() => client.closed).toBe(true);
    armed = true;
    await expect(f.service.store.prepareTarget()).rejects.toThrow('durability-failed');
    expect(f.service.store.snapshot().blocked).toBe(true);
    await expect(f.service.stop()).rejects.toThrow('outcome-uncertain');
    await access(join(f.roots.storageRoot, 'owner'));
    await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
  } finally { reading.mockRestore(); publishing.mockRestore(); removing.mockRestore(); }
});
