import { expect, test } from 'vitest';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionObservation } from '@agent-pet/domain';
import { createManagedPiService, connectManagedPiClient } from './index.js';
import { openManagedCore } from './service.js';
import { connectManagedCore } from './client.js';
import { opaqueId } from './protocol.js';
import { fail } from './errors.js';
import { admitted, authentication, baseline, cleanups, enabled, fixture, lifecycle, opened, raw, wire } from './test-helpers.js';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
test('public production entries reject before any input inspection/FS/socket activity', async () => {
  const options = new Proxy({}, { get() { throw new Error('input accessed'); } });
  await expect(createManagedPiService(options as never)).rejects.toThrow('acl-unverified');
  await expect(connectManagedPiClient(options as never)).rejects.toThrow('acl-unverified');
});
test('real synthetic store prepares pending and enables only explicitly; restart retains revocation and changes generation', async () => {
  const f = await opened(); const pending = await enabled(f.service);
  const discovery = await f.service.start();
  await f.service.store.revokeTarget(pending.targetId, pending.epoch, f.service.store.snapshot().revision);
  expect(f.service.store.snapshot().targets[0]?.state).toBe('revoked');
  await f.service.stop(); await f.service.stop();
  const next = await openManagedCore({ ...f, initialize: false, publish() {} });
  cleanups.push(() => next.stop());
  expect(next.store.snapshot().targets[0]?.state).toBe('revoked');
  expect((await next.start()).generation).not.toBe(discovery.generation);
});
test('two target identities are separate; immediate revoke closes all A peers and buffered events while B remains usable', async () => {
  const observations: SessionObservation[] = [];
  const f = await opened({ publish: o => observations.push(o) });
  const a = await enabled(f.service); const b = await enabled(f.service);
  const aa = await authentication(f, a.targetId); const bb = await authentication(f, b.targetId);
  const a1 = await admitted(aa.auth, aa.path); const a2 = await admitted(aa.auth, aa.path); const b1 = await admitted(bb.auth, bb.path);
  expect(observations).toHaveLength(0);
  a1.socket.write(wire(baseline())); b1.socket.write(wire(baseline()));
  await expect.poll(() => observations.length).toBe(2);
  expect(observations[0]!.sessionId).not.toBe(observations[1]!.sessionId);
  expect(observations.every(o => o.processInstanceId === 'process' && o.providerSessionId === 'session')).toBe(true);
  const before = observations.length;
  a1.socket.write(wire(lifecycle()));
  const revoked = f.service.store.revokeTarget(a.targetId, a.epoch, f.service.store.snapshot().revision);
  await Promise.all([a1.closed, a2.closed, revoked]);
  expect(observations).toHaveLength(before);
  expect(b1.socket.destroyed).toBe(false); b1.socket.write(wire(lifecycle()));
  await expect.poll(() => observations.length).toBe(3);
  const rejected = await raw(aa.path); rejected.socket.write(wire(aa.auth)); await rejected.closed;
  expect(f.service.connectionsSnapshot()[b.targetId]).toBe(1);
  const b2 = await admitted(bb.auth, bb.path); b2.socket.write(wire(baseline()));
  await expect.poll(() => observations.length).toBe(4);
});
for (const field of ['token', 'authSetId', 'targetId', 'epoch', 'generation', 'protocolVersion', 'extra'] as const) {
  test(`rejects auth ${field} without session publication`, async () => {
    const output: unknown[] = []; const f = await opened({ publish: o => output.push(o) });
    const target = await enabled(f.service); const { auth, path } = await authentication(f, target.targetId);
    const value = { ...auth, [field]: field === 'token' ? 'f'.repeat(64) : field === 'epoch' || field === 'protocolVersion' ? 99 : opaqueId() };
    const peer = await raw(path); peer.socket.write(wire(value)); await peer.closed;
    expect(output).toEqual([]);
  });
}
test('pending target, malformed token, session-before-auth and auth+baseline pipeline are rejected', async () => {
  const f = await opened(); const pending = await f.service.store.prepareTarget(); const a = await authentication(f, pending.targetId);
  for (const payload of [wire(a.auth), wire({ ...a.auth, token: 'x'.repeat(64) }), wire(baseline()), '{bad}\n']) {
    const peer = await raw(a.path); peer.socket.write(payload); await peer.closed;
  }
  await f.service.store.enableTarget(pending.targetId, 1, f.service.store.snapshot().revision);
  const peer = await raw(a.path); peer.socket.write(wire(a.auth) + wire(baseline())); await peer.closed;
});
test('strict first current baseline, one session per connection and monotonic sequences', async () => {
  const f = await opened(); const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  for (const event of [lifecycle(), { ...baseline(), status: 'completed' }, { ...baseline(), token: a.auth.token }, a.auth]) {
    const peer = await admitted(a.auth, a.path); peer.socket.write(wire(event)); await peer.closed;
  }
  for (const next of [baseline(2), { ...lifecycle(), providerSessionId: 'other' }, lifecycle(1)]) {
    const peer = await admitted(a.auth, a.path); peer.socket.write(wire(baseline())); await tick();
    peer.socket.write(wire(next)); await peer.closed;
  }
});
test('client rereads current credentials and discovery on each attempt; rotation closes old peers and rejects old auth', async () => {
  const output: SessionObservation[] = []; const f = await opened({ publish: o => output.push(o) });
  const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  const options = { ...f, authSetId: a.auth.authSetId, targetId: target.targetId };
  const client = await connectManagedCore(options); cleanups.push(async () => client.close());
  expect(output).toEqual([]); client.send(baseline()); await expect.poll(() => output.length).toBe(1);
  await f.service.store.rotateTarget(target.targetId, 1, f.service.store.snapshot().revision);
  await expect.poll(() => client.closed).toBe(true);
  const old = await raw(a.path); old.socket.write(wire(a.auth)); await old.closed;
  const next = await connectManagedCore(options); cleanups.push(async () => next.close()); next.send(baseline());
  await expect.poll(() => output.length).toBe(2);
  expect(output.every(o => o.status === 'idle')).toBe(true);
});
test('revocation inside publication invalidates already parsed/coalesced work before the next publish', async () => {
  let revoked: Promise<void> | undefined; let targetId = ''; const output: SessionObservation[] = [];
  const f = await opened({ publish: observation => {
    output.push(observation);
    if (output.length === 2) revoked = f.service.store.revokeTarget(targetId, 1, f.service.store.snapshot().revision);
  } });
  const target = await enabled(f.service); targetId = target.targetId;
  const a = await authentication(f, targetId); const peer = await admitted(a.auth, a.path);
  peer.socket.write(wire(baseline())); await expect.poll(() => output.length).toBe(1);
  peer.socket.write(wire(lifecycle(2)) + wire(lifecycle(3)) + wire(lifecycle(4)));
  await peer.closed; await revoked;
  expect(output.map(o => o.status)).toEqual(['idle', 'working']);
  expect(output[1]!.revision).toBeGreaterThan(output[0]!.revision!);
});
test('callback exceptions are isolated to the offending connection, not the listener or another target', async () => {
  let throws = true; const output: unknown[] = [];
  const f = await opened({ publish: o => { if (throws) throw new Error('private-callback-payload'); output.push(o); } });
  const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  const bad = await admitted(a.auth, a.path); bad.socket.write(wire(baseline())); await bad.closed;
  throws = false; const good = await admitted(a.auth, a.path); good.socket.write(wire(baseline()));
  await expect.poll(() => output.length).toBe(1);
});
test('bounded stop destroys idle and unauthenticated peers and is idempotent', async () => {
  const f = await opened(); const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  const idle = await admitted(a.auth, a.path); idle.socket.write(wire(baseline())); const pending = await raw(a.path);
  const first = f.service.stop(); const second = f.service.stop(); expect(second).toBe(first);
  await Promise.all([first, idle.closed, pending.closed]);
  expect(f.service.connectionsSnapshot()).toEqual({});
  await expect(f.service.start()).rejects.toThrow('unavailable');
});

test('store close failure still tears down the listener and preserves the durable claim', async () => {
  const f = await opened(); const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  const peer = await admitted(a.auth, a.path);
  const originalClose = f.service.store.close.bind(f.service.store);
  f.service.store.close = async () => fail('durability-failed');
  await expect(f.service.stop()).rejects.toThrow('durability-failed');
  await peer.closed;
  await access(join(f.roots.storageRoot, 'owner'));
  await expect(f.service.start()).rejects.toThrow('unavailable');
  f.service.store.close = originalClose;
});

test('unknown owner children and substituted claims are never removed during final release', async () => {
  const first = await opened();
  await mkdir(join(first.roots.storageRoot, 'owner', 'unknown'), { mode: 0o700 });
  await expect(first.service.stop()).rejects.toThrow();
  await access(join(first.roots.storageRoot, 'owner', 'unknown'));

  const second = await opened();
  const owner = join(second.roots.storageRoot, 'owner'); const backup = join(second.roots.storageRoot, 'owner-backup');
  await rename(owner, backup); await mkdir(owner, { mode: 0o700 }); await writeFile(join(owner, 'foreign'), 'x', { mode: 0o600 });
  await expect(second.service.stop()).rejects.toThrow('path-changed');
  await access(join(owner, 'foreign')); await access(backup);
});
test('initialization is explicit and exclusive writer claim is never stolen', async () => {
  const f = await fixture();
  await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('store-corrupt');
  await expect(openManagedCore({ ...f, initialize: true, publish() {} })).rejects.toThrow('ownership-busy');
  const g = await opened();
  await expect(openManagedCore({ ...g, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
});
