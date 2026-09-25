import { afterEach, expect, test } from 'vitest';
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { createApplication } from '../../../application/src/index.js';
import { connectNativeManagedCore } from './client.js';
import { openNativeManagedCore } from './service.js';
import type { ManagedSessionEvent } from './protocol.js';

const nativeTest = process.platform === 'darwin' ? test : test.skip;
const fixtureRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const rootsInUse: string[] = [];

afterEach(async () => {
  while (rootsInUse.length) await rm(rootsInUse.pop()!, { recursive: true, force: true });
});

async function fixture() {
  const base = await mkdtemp(join(fixtureRoot, '.b3-vertical-'));
  const roots = { storageRoot: join(base, 'storage'), runtimeRoot: join(base, 'runtime') };
  await mkdir(roots.storageRoot, { mode: 0o700 });
  await mkdir(roots.runtimeRoot, { mode: 0o700 });
  rootsInUse.push(base);
  return roots;
}
async function open(roots: Awaited<ReturnType<typeof fixture>>, publish: (value: unknown) => void = () => {}) {
  const service = await openNativeManagedCore({ roots, initialize: true, publish });
  return service;
}
async function enabled(service: Awaited<ReturnType<typeof open>>) {
  const pending = await service.store.prepareTarget();
  await service.store.enableTarget(pending.targetId, pending.epoch, service.store.snapshot().revision);
  return pending;
}
function event(seq: number, status: 'idle' | 'working' | 'completed', workId?: string): ManagedSessionEvent {
  if (seq === 1) return { type: 'hello', schemaVersion: 1, seq, processInstanceId: 'native-process', providerSessionId: 'native-session', sentAt: '2026-01-01T00:00:00.000Z', status: 'idle', sessionName: 'native', projectName: 'fixture' };
  return { type: 'lifecycle', schemaVersion: 1, seq, processInstanceId: 'native-process', providerSessionId: 'native-session', sentAt: '2026-01-01T00:00:00.000Z', status, ...(workId ? { workId } : {}) };
}
async function client(roots: Awaited<ReturnType<typeof fixture>>, service: Awaited<ReturnType<typeof open>>, targetId: string) {
  return connectNativeManagedCore({ roots, authSetId: service.store.snapshot().authSetId, targetId });
}

nativeTest('B3 native storage/service/client/Application vertical lifecycle uses real UDS and revision fencing', async () => {
  const roots = await fixture();
  const application = createApplication([]);
  const observations: unknown[] = [];
  const service = await open(roots, observation => { observations.push(observation); application.observe(observation as never); });
  const target = await enabled(service);
  await service.start();
  const first = await client(roots, service, target.targetId);
  first.send(event(1, 'idle'));
  await expect.poll(() => Object.values(application.snapshot().sessions)[0]?.status).toBe('idle');
  const sessionId = Object.keys(application.snapshot().sessions)[0]!;
  first.send(event(2, 'working'));
  await expect.poll(() => application.snapshot().sessions[sessionId]?.status).toBe('working');
  const firstRevision = application.snapshot().sessionMeta?.[sessionId]?.lastRevision;
  first.close();
  const second = await client(roots, service, target.targetId);
  second.send(event(1, 'idle'));
  await expect.poll(() => application.snapshot().sessions[sessionId]?.status).toBe('idle');
  expect(application.snapshot().sessionMeta?.[sessionId]?.lastRevision).toBeGreaterThan(firstRevision!);
  second.send(event(2, 'working', 'work-a'));
  second.send(event(3, 'completed', 'work-a'));
  await expect.poll(() => application.snapshot().bubbles[0]?.status).toBe('completed-unread');
  await expect(application.acknowledgeAndOpen({ provider: 'pi', sessionId })).resolves.toEqual({ status: 'unsupported' });
  expect(application.snapshot().bubbles).toHaveLength(0);
  second.close();
  await service.stop();

  const reopened = await openNativeManagedCore({ roots, initialize: false, publish: observation => application.observe(observation as never) });
  await reopened.start();
  const third = await client(roots, reopened, target.targetId);
  third.send(event(1, 'idle'));
  await expect.poll(() => application.snapshot().sessions[sessionId]?.status).toBe('idle');
  expect(application.snapshot().bubbles).toHaveLength(0);
  third.close();
  await reopened.stop();
  expect(observations.length).toBeGreaterThanOrEqual(5);
});

nativeTest('B3 native target fences isolate peers and rotate/revoke credentials without replay', async () => {
  const roots = await fixture();
  const output: { targetId?: string; status: string }[] = [];
  const service = await open(roots, observation => output.push(observation as { targetId?: string; status: string }));
  const a = await enabled(service); const b = await enabled(service); await service.start();
  const firstA = await client(roots, service, a.targetId);
  const firstB = await client(roots, service, b.targetId);
  firstA.send(event(1, 'idle')); firstB.send(event(1, 'idle'));
  await expect.poll(() => output.length).toBe(2);
  firstA.send(event(2, 'working')); await expect.poll(() => output.length).toBe(3);
  await service.store.revokeTarget(a.targetId, a.epoch, service.store.snapshot().revision);
  await expect.poll(() => firstA.closed).toBe(true);
  firstB.send(event(2, 'working')); await expect.poll(() => output.length).toBe(4);
  firstB.close();

  const oldEpoch = service.store.snapshot().targets.find(t => t.targetId === b.targetId)!.epoch;
  const oldCredential = JSON.parse(await readFile(join(roots.storageRoot, 'targets', `${b.targetId}.${oldEpoch}.json`), 'utf8')) as { token: string };
  await service.store.rotateTarget(b.targetId, oldEpoch, service.store.snapshot().revision);
  const fresh = await client(roots, service, b.targetId);
  fresh.send(event(1, 'idle')); await expect.poll(() => output.length).toBe(5);
  const discovery = await service.start();
  const denied = net.createConnection(join(roots.runtimeRoot, discovery.instance, 's'));
  const closed = new Promise<void>(resolve => denied.once('close', resolve));
  denied.once('error', () => {});
  denied.once('connect', () => denied.write(JSON.stringify({ type: 'auth', protocolVersion: 2, authSetId: service.store.snapshot().authSetId, targetId: b.targetId, epoch: oldEpoch, generation: discovery.generation, token: oldCredential.token }) + '\n'));
  await closed;
  fresh.close(); await service.stop();
});

nativeTest('B3 native failed authority open retains owner barrier and refuses reopen', async () => {
  const roots = await fixture();
  const initial = await openNativeManagedCore({ roots, initialize: true, publish() {} });
  await initial.stop();
  await writeFile(join(roots.storageRoot, 'authorization.json'), '{malformed', { mode: 0o600 });
  await expect(openNativeManagedCore({ roots, initialize: false, publish() {} })).rejects.toThrow('store-corrupt');
  await access(join(roots.storageRoot, 'owner'));
  await expect(openNativeManagedCore({ roots, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
});

nativeTest('B3 invalid native discovery rejects before token transmission on synthetic endpoint', async () => {
  const roots = await fixture();
  const service = await open(roots); const target = await enabled(service); const discovery = await service.start();
  const decoyPath = join(roots.runtimeRoot, 'decoy', 's'); await mkdir(join(roots.runtimeRoot, 'decoy'), { mode: 0o700 });
  const received: Buffer[] = []; const decoy = net.createServer(socket => { socket.on('data', chunk => received.push(chunk)); });
  await new Promise<void>((resolve, reject) => { decoy.once('error', reject); decoy.listen(decoyPath, resolve); });
  await chmod(decoyPath, 0o600);
  await writeFile(join(roots.storageRoot, 'discovery.json'), JSON.stringify({ ...discovery, instance: 'decoy' }));
  await expect(connectNativeManagedCore({ roots, authSetId: service.store.snapshot().authSetId, targetId: target.targetId })).rejects.toThrow();
  expect(Buffer.concat(received)).toHaveLength(0);
  await new Promise<void>(resolve => decoy.close(() => resolve()));
  await service.stop().catch(() => {});
});

nativeTest.skip('B3 native transaction poison admission barrier (native syscall fault injection missing gate)', async () => {
  // Deliberately remains a labeled gate until the native fixture can inject
  // create/write/fsync/publish/parent-sync uncertainty without mocking the addon.
});
