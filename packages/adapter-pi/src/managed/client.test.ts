import { expect, test } from 'vitest';
import net from 'node:net';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectManagedCore } from './client.js';
import { ackFor, opaqueId, type AuthHello } from './protocol.js';
import { endpoint } from './discovery.js';
import { authentication, baseline, cleanups, enabled, opened, lifecycle } from './test-helpers.js';
import { createApplication } from '../../../application/src/index.js';
import { openManagedCore } from './service.js';

test('reconnect and core restart reset wire sequence without leaving Application stuck working', async () => {
  const application = createApplication([]);
  const f = await opened({ publish: observation => application.observe(observation) });
  const target = await enabled(f.service); const discovery = await f.service.start();
  const options = { ...f, authSetId: discovery.authSetId, targetId: target.targetId };
  const first = await connectManagedCore(options); cleanups.push(async () => first.close());
  const state = () => Object.values(application.snapshot().sessions)[0];
  first.send(baseline());
  await expect.poll(() => state()?.status).toBe('idle');
  const sessionId = state()!.sessionId;
  first.send(lifecycle()); await expect.poll(() => state()?.status).toBe('working');
  first.close();
  const second = await connectManagedCore(options); cleanups.push(async () => second.close());
  second.send(baseline()); await expect.poll(() => state()?.status).toBe('idle');
  expect(state()!.sessionId).toBe(sessionId);
  second.send(lifecycle()); await expect.poll(() => state()?.status).toBe('working');
  second.close(); await f.service.stop();
  const next = await openManagedCore({ ...f, initialize: false, publish: observation => application.observe(observation) });
  cleanups.push(() => next.stop()); await next.start();
  const third = await connectManagedCore(options); cleanups.push(async () => third.close());
  third.send(baseline()); await expect.poll(() => state()?.status).toBe('idle');
  expect(Object.keys(application.snapshot().sessions)).toEqual([sessionId]);
  third.send({ ...lifecycle(), workId: 'work-a' });
  third.send({ ...lifecycle(3), status: 'completed', workId: 'work-a' });
  await expect.poll(() => application.snapshot().bubbles[0]?.status).toBe('completed-unread');
  await application.acknowledgeAndOpen({ provider: 'pi', sessionId });
  expect(application.snapshot().bubbles).toHaveLength(0);
  third.close();
  const fourth = await connectManagedCore(options); cleanups.push(async () => fourth.close());
  fourth.send(baseline()); await expect.poll(() => state()?.status).toBe('idle');
  expect(application.snapshot().bubbles).toHaveLength(0);
  fourth.send({ ...lifecycle(), workId: 'work-b' });
  await expect.poll(() => application.snapshot().bubbles[0]?.status).toBe('working');
  fourth.send({ ...lifecycle(3), status: 'completed', workId: 'work-b' });
  await expect.poll(() => application.snapshot().bubbles[0]?.status).toBe('completed-unread');
  expect(application.snapshot().bubbles).toHaveLength(1);
});

async function decoy(f: Awaited<ReturnType<typeof opened>>, receive: (socket: net.Socket, auth: AuthHello) => void) {
  const instance = opaqueId(); const dir = join(f.roots.runtimeRoot, instance); await mkdir(dir, { mode: 0o700 });
  const path = endpoint(f.roots.runtimeRoot, instance); let received = '';
  const peers = new Set<net.Socket>();
  const server = net.createServer(socket => {
    peers.add(socket); socket.on('error', () => {}); socket.on('close', () => peers.delete(socket));
    let text = '';
    socket.on('data', chunk => { received += chunk.toString(); text += chunk.toString();
      if (text.includes('\n')) { const line = text.split('\n')[0]!; text = ''; receive(socket, JSON.parse(line) as AuthHello); }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
  await chmod(path, 0o600);
  cleanups.push(async () => { for (const peer of peers) peer.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return { instance, path, received: () => received };
}
for (const kind of ['traversal', 'extra', 'auth-set', 'socket-mode', 'socket-type'] as const) {
  test(`invalid discovery/endpoint ${kind} sends zero token bytes to synthetic decoy`, async () => {
    const f = await opened(); const target = await enabled(f.service); const a = await authentication(f, target.targetId);
    const listener = await decoy(f, socket => socket.destroy());
    const discovery = await f.service.start();
    const changed = { ...discovery, instance: listener.instance,
      ...(kind === 'traversal' ? { instance: '../' + listener.instance } : {}),
      ...(kind === 'extra' ? { endpoint: listener.path } : {}),
      ...(kind === 'auth-set' ? { authSetId: opaqueId() } : {}),
    };
    if (kind === 'socket-mode') await chmod(listener.path, 0o660);
    if (kind === 'socket-type') { const instance = opaqueId(); await mkdir(join(f.roots.runtimeRoot, instance), { mode: 0o700 }); await writeFile(endpoint(f.roots.runtimeRoot, instance), '{}', { mode: 0o600 }); changed.instance = instance; }
    await writeFile(join(f.roots.storageRoot, 'discovery.json'), JSON.stringify(changed));
    const error = await connectManagedCore({ ...f, authSetId: a.auth.authSetId, targetId: target.targetId }).catch(error => error);
    expect(error).toBeInstanceOf(Error); expect(listener.received()).toBe('');
    expect(error.message).not.toContain(a.auth.token); expect(error.message).not.toContain(f.base);
  });
}
for (const kind of ['generation', 'target', 'epoch', 'extra', 'version', 'auth-set'] as const) {
  test(`client validates ${kind} ack before returning a metadata-capable connection`, async () => {
    const f = await opened(); const target = await enabled(f.service); const a = await authentication(f, target.targetId);
    const listener = await decoy(f, (socket, auth) => {
      const ack = { ...ackFor(auth), ...(kind === 'generation' ? { generation: opaqueId() } : {}),
        ...(kind === 'target' ? { targetId: opaqueId() } : {}), ...(kind === 'epoch' ? { epoch: 999 } : {}),
        ...(kind === 'extra' ? { token: auth.token } : {}), ...(kind === 'version' ? { protocolVersion: 999 } : {}),
        ...(kind === 'auth-set' ? { authSetId: opaqueId() } : {}),
      };
      socket.write(JSON.stringify(ack) + '\n');
    });
    await writeFile(join(f.roots.storageRoot, 'discovery.json'), JSON.stringify({ ...await f.service.start(), instance: listener.instance }));
    await expect(connectManagedCore({ ...f, authSetId: a.auth.authSetId, targetId: target.targetId })).rejects.toThrow('unauthorized');
    const received = JSON.parse(listener.received());
    expect(Object.keys(received).sort()).toEqual(['authSetId', 'epoch', 'generation', 'protocolVersion', 'targetId', 'token', 'type'].sort());
    expect(listener.received()).not.toContain('synthetic-name'); expect(listener.received()).not.toContain('processInstanceId');
  });
}
test('bounded fixture reconnect retries reread rotated credentials with jittered unref timers and no offline queue', async () => {
  const output: unknown[] = []; const f = await opened({ publish: o => output.push(o) }); const target = await enabled(f.service);
  const options = { ...f, authSetId: f.service.store.snapshot().authSetId, targetId: target.targetId };
  let attempts = 0; let connected: Awaited<ReturnType<typeof connectManagedCore>> | undefined;
  for (; attempts < 3; ) {
    attempts++;
    try { connected = await connectManagedCore(options); break; }
    catch {
      if (attempts === 3) throw new Error('synthetic reconnect budget exhausted');
      await f.service.store.rotateTarget(target.targetId, 1, f.service.store.snapshot().revision);
      await f.service.start();
      const delay = Math.min(5000, 250 * 2 ** (attempts - 1) + Math.floor(Math.random() * 50));
      await new Promise<void>(resolve => { const timer = setTimeout(resolve, delay); timer.unref(); });
    }
  }
  expect(attempts).toBe(2); expect(output).toEqual([]);
  cleanups.push(async () => connected!.close()); connected!.send(baseline());
  await expect.poll(() => output.length).toBe(1);
});
test('restart rereads new discovery and credentials, preserves idle baseline, and stale generation is not reused', async () => {
  const output: unknown[] = []; const f = await opened({ publish: o => output.push(o) }); const target = await enabled(f.service);
  const old = await f.service.start(); const options = { ...f, authSetId: old.authSetId, targetId: target.targetId };
  const first = await connectManagedCore(options); first.send(baseline()); await expect.poll(() => output.length).toBe(1); first.close();
  await f.service.stop();
  const next = await openManagedCore({ ...f, initialize: false, publish: o => output.push(o) }); cleanups.push(() => next.stop());
  const fresh = await next.start(); expect(fresh.generation).not.toBe(old.generation);
  const second = await connectManagedCore(options); cleanups.push(async () => second.close()); second.send(baseline());
  await expect.poll(() => output.length).toBe(2);
  expect(output).toEqual([expect.objectContaining({ status: 'idle' }), expect.objectContaining({ status: 'idle' })]);
  const discovery = await readFile(join(f.roots.storageRoot, 'discovery.json'), 'utf8');
  expect(discovery).not.toContain('token'); expect(discovery).not.toContain('synthetic-name');
});
