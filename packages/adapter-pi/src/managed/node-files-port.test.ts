import { expect, test, vi } from 'vitest';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
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
    await expect(connectManagedCore(options)).rejects.toThrow('unauthorized');
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
