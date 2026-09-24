import { expect, test } from 'vitest';
import { access, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { openManagedCore } from './service.js';
import { credentialPath, parseRegistry } from './auth-store.js';
import { admitted, authentication, baseline, cleanups, enabled, opened, raw, wire } from './test-helpers.js';
import type { Boundary } from './private-files.js';

for (const action of ['enable', 'revoke', 'rotate'] as const) for (const boundary of ['create', 'write', 'file-sync', 'publish', 'directory-sync'] as const) {
  test(`${action} ${boundary} failure stops admission and leaves a restart barrier even after stop`, async () => {
    let armed = false;
    const f = await opened({ fault(step, operation) { if (armed && step === boundary && operation === 'authority-write') { armed = false; throw new Error('SECRET-NATIVE-ERROR'); } } });
    const target = action === 'enable' ? await f.service.store.prepareTarget() : await enabled(f.service);
    const a = await authentication(f, target.targetId);
    const peer = action === 'enable' ? undefined : await admitted(a.auth, a.path);
    const revision = f.service.store.snapshot().revision; armed = true;
    const operation = action === 'enable' ? f.service.store.enableTarget(target.targetId, 1, revision) :
      action === 'revoke' ? f.service.store.revokeTarget(target.targetId, 1, revision) : f.service.store.rotateTarget(target.targetId, 1, revision);
    await expect(operation).rejects.toThrow(boundary === 'file-sync' || boundary === 'directory-sync' ? 'outcome-uncertain' : 'durability-failed');
    if (peer) await peer.closed;
    expect(f.service.store.snapshot().blocked).toBe(true);
    expect(f.service.store.authenticate(a.auth)).toBe(false);
    await expect(f.service.stop()).rejects.toThrow('outcome-uncertain');
    await access(join(f.roots.storageRoot, 'owner'));
    await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
    expect(JSON.stringify(f.service.store.snapshot())).not.toContain(a.auth.token);
    // No cleanup deletes evidence of the previous credential, even if rename became visible.
    await access(credentialPath(f.roots.storageRoot, target.targetId, 1));
  });
}
for (const action of ['revoke', 'rotate'] as const) for (const behindPrepare of [false, true]) {
  test(`${action} racing stop retains the restart barrier (queued behind prepare: ${behindPrepare})`, async () => {
    let armed = false; let reached!: () => void; let release!: () => void;
    const atBoundary = new Promise<void>(resolve => { reached = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    const f = await opened({ fault: async (step, operation) => {
      if (armed && step === 'create' && operation === 'credential-write') { armed = false; reached(); await resume; }
    } });
    const target = await enabled(f.service);
    let preparing: Promise<unknown> | undefined;
    if (behindPrepare) {
      armed = true; preparing = f.service.store.prepareTarget().catch(error => error);
      await atBoundary;
    }
    const revision = f.service.store.snapshot().revision;
    const mutation = (action === 'revoke'
      ? f.service.store.revokeTarget(target.targetId, 1, revision)
      : f.service.store.rotateTarget(target.targetId, 1, revision)).catch(error => error);
    const stopping = f.service.stop().then(() => null, error => error);
    release();
    await preparing;
    expect((await mutation).message).toBe('unavailable');
    expect(await stopping).toMatchObject({ message: 'outcome-uncertain' });
    await access(join(f.roots.storageRoot, 'owner'));
    await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
  });
}
test('acknowledged revoke persists across restart; orphaned old credential cannot restore authority', async () => {
  const f = await opened(); const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  const path = credentialPath(f.roots.storageRoot, target.targetId, 1); const orphan = await readFile(path);
  await f.service.store.revokeTarget(target.targetId, 1, f.service.store.snapshot().revision);
  await writeFile(path, orphan, { mode: 0o600, flag: 'wx' });
  await f.service.stop();
  const next = await openManagedCore({ ...f, initialize: false, publish() {} }); cleanups.push(() => next.stop());
  expect(next.store.authenticate(a.auth)).toBe(false);
  expect(next.store.snapshot().targets[0]?.state).toBe('revoked');
});
test('final clean claim-release sync failure reports error but cannot promise a retained removed claim', async () => {
  let armed = false;
  const f = await opened({ fault(step, operation) {
    if (armed && step === 'directory-sync' && operation === 'cleanup') { armed = false; throw new Error('synthetic-sync'); }
  } });
  const target = await enabled(f.service);
  await f.service.store.revokeTarget(target.targetId, 1, f.service.store.snapshot().revision);
  armed = true;
  await expect(f.service.stop()).rejects.toThrow();
  await expect(access(join(f.roots.storageRoot, 'owner'))).rejects.toMatchObject({ code: 'ENOENT' });
  const next = await openManagedCore({ ...f, initialize: false, publish() {} });
  cleanups.push(() => next.stop());
  expect(next.store.snapshot().targets[0]).toMatchObject({ targetId: target.targetId, state: 'revoked', epoch: 2 });
});
test('missing or corrupt authority is never reconstructed from valid orphan credentials', async () => {
  for (const corrupt of [false, true]) {
    const f = await opened(); await enabled(f.service); await f.service.stop();
    const path = join(f.roots.storageRoot, 'authorization.json');
    if (corrupt) await writeFile(path, '{secret-corruption'); else await unlink(path);
    await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('store-corrupt');
    await expect(openManagedCore({ ...f, initialize: true, publish() {} })).rejects.toThrow('ownership-busy');
  }
});
test('cleanup failure follows durable revoked state, reports failure, and retains restart barrier', async () => {
  let armed = false;
  const f = await opened({ fault(step) { if (armed && step === 'cleanup') throw new Error('synthetic'); } });
  const target = await enabled(f.service); armed = true;
  await expect(f.service.store.revokeTarget(target.targetId, 1, f.service.store.snapshot().revision)).rejects.toThrow('unavailable');
  const registry = parseRegistry(JSON.parse(await readFile(join(f.roots.storageRoot, 'authorization.json'), 'utf8')));
  expect(registry.targets[0]?.state).toBe('revoked');
  await expect(f.service.stop()).rejects.toThrow('outcome-uncertain');
  await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
});
test('an enable paused before publication cannot resurrect after immediate revocation entry', async () => {
  let armed = false; let reached!: () => void; let release!: () => void;
  const atBoundary = new Promise<void>(resolve => { reached = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const f = await opened({ fault: async (step, operation) => {
    if (armed && step === 'publish' && operation === 'authority-write') { armed = false; reached(); await resume; }
  } });
  const target = await f.service.store.prepareTarget(); const a = await authentication(f, target.targetId);
  const revision = f.service.store.snapshot().revision; armed = true;
  const enable = f.service.store.enableTarget(target.targetId, 1, revision);
  const enableResult = enable.catch(error => error);
  await atBoundary;
  const revoke = f.service.store.revokeTarget(target.targetId, 1, revision); const revokeResult = revoke.catch(error => error);
  expect(f.service.store.authenticate(a.auth)).toBe(false); release();
  expect((await enableResult).message).toBe('outcome-uncertain');
  expect((await revokeResult).message).toBe('unavailable');
  expect(f.service.store.authenticate(a.auth)).toBe(false);
  await expect(f.service.stop()).rejects.toThrow('outcome-uncertain');
  await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
});
test('interrupted rotation commits non-admitting pending before creating replacement credential', async () => {
  let armed = false;
  const f = await opened({ fault(step, operation) { if (armed && step === 'create' && operation === 'credential-write') throw new Error('interruption'); } });
  const target = await enabled(f.service); const a = await authentication(f, target.targetId); const peer = await admitted(a.auth, a.path);
  armed = true; await expect(f.service.store.rotateTarget(target.targetId, 1, f.service.store.snapshot().revision)).rejects.toThrow(); await peer.closed;
  const disk = parseRegistry(JSON.parse(await readFile(join(f.roots.storageRoot, 'authorization.json'), 'utf8')));
  expect(disk.targets[0]).toMatchObject({ state: 'pending', epoch: 2, digest: null });
  await expect(f.service.stop()).rejects.toThrow('outcome-uncertain');
  await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
});
test('stale expected revisions reject without changing other targets', async () => {
  const f = await opened(); const a = await enabled(f.service); const revision = f.service.store.snapshot().revision;
  const b = await enabled(f.service);
  expect(() => f.service.store.revokeTarget(a.targetId, 1, revision)).toThrow('stale-operation');
  const bb = await authentication(f, b.targetId); const peer = await admitted(bb.auth, bb.path); peer.socket.write(wire(baseline()));
  expect(f.service.store.snapshot().blocked).toBe(false);
});
test('registry rejects duplicate targets, unsupported schemas and retained-target exhaustion without evicting tombstones', () => {
  const authSetId = 'a'.repeat(32); const target = { targetId: 'b'.repeat(32), epoch: 2, state: 'revoked', digest: null };
  for (const value of [
    { schema: 2, authSetId, revision: 1, targets: [] },
    { schema: 1, authSetId, revision: 1, targets: [target, target] },
    { schema: 1, authSetId, revision: 1, targets: Array.from({ length: 129 }, (_, n) => ({ ...target, targetId: n.toString(16).padStart(32, '0') })) },
  ]) expect(() => parseRegistry(value)).toThrow('store-corrupt');
});
test('saturated mutation queue cannot drop a synchronous revocation denial and later remove its barrier', async () => {
  let armed = false; let reached!: () => void; let release!: () => void;
  const atBoundary = new Promise<void>(resolve => { reached = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const f = await opened({ fault: async (step, operation) => {
    if (armed && step === 'create' && operation === 'credential-write') { armed = false; reached(); await resume; }
  } });
  const target = await enabled(f.service); armed = true;
  const pending = [f.service.store.prepareTarget().catch(error => error)]; await atBoundary;
  for (let n = 1; n < 128; n++) pending.push(f.service.store.prepareTarget().catch(error => error));
  expect(() => f.service.store.revokeTarget(target.targetId, 1, f.service.store.snapshot().revision)).toThrow('limit-exceeded');
  expect(f.service.store.current(target.targetId, 1)).toBe(false);
  release(); await Promise.all(pending);
  await expect(f.service.stop()).rejects.toThrow('outcome-uncertain');
  await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
});
test('credential cleanup does not delete a modified same-inode token after durable revoke', async () => {
  const f = await opened(); const target = await enabled(f.service);
  const path = credentialPath(f.roots.storageRoot, target.targetId, 1);
  const changed = { ...JSON.parse(await readFile(path, 'utf8')), token: 'f'.repeat(64) };
  await writeFile(path, JSON.stringify(changed));
  await expect(f.service.store.revokeTarget(target.targetId, 1, f.service.store.snapshot().revision)).rejects.toThrow('store-corrupt');
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(changed);
  expect(f.service.store.snapshot().targets[0]?.state).toBe('revoked');
  await expect(f.service.stop()).rejects.toThrow('outcome-uncertain');
});
test('full retained-target registry refuses enrollment and keeps every revoked tombstone', async () => {
  const f = await opened(); const authSetId = f.service.store.snapshot().authSetId; await f.service.stop();
  const targets = Array.from({ length: 128 }, (_, n) => ({ targetId: n.toString(16).padStart(32, '0'), epoch: 2, state: 'revoked', digest: null }));
  await writeFile(join(f.roots.storageRoot, 'authorization.json'), JSON.stringify({ schema: 1, authSetId, revision: 1000, targets }));
  const next = await openManagedCore({ ...f, initialize: false, publish() {} }); cleanups.push(() => next.stop().catch(() => {}));
  await expect(next.store.prepareTarget()).rejects.toThrow('limit-exceeded');
  expect(next.store.snapshot().targets).toHaveLength(128);
  const disk = parseRegistry(JSON.parse(await readFile(join(f.roots.storageRoot, 'authorization.json'), 'utf8')));
  expect(disk.targets).toEqual(targets);
});
for (const boundary of ['create', 'write', 'file-sync', 'publish', 'directory-sync'] satisfies Boundary[]) {
  test(`prepare credential ${boundary} failure never publishes pending authority and blocks restart`, async () => {
    let armed = false;
    const f = await opened({ fault(step, operation) { if (armed && step === boundary && operation === 'credential-write') throw new Error('failure'); } });
    armed = true; await expect(f.service.store.prepareTarget()).rejects.toThrow();
    expect(f.service.store.snapshot().targets).toEqual([]);
    await expect(f.service.stop()).rejects.toThrow('outcome-uncertain');
    await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
  });
}
