import assert from 'node:assert/strict';
import net from 'node:net';
import { chmod, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openManagedCore, type ManagedCore } from '../service.js';
import { connectManagedCore, type ManagedClient } from '../client.js';
import { fixturePolicy } from '../test-policy.js';
import { PrivateFiles } from '../private-files.js';
import { opaqueId } from '../protocol.js';
import { endpoint } from '../discovery.js';
import { validatePath } from '../path-policy.js';
import { credentialPath } from '../auth-store.js';
import { OwnedFixture, bounded, waitFor } from './fixtures.js';
import { runNativeControls } from './native-controls.js';
import { caseIds, type CaseEvidence, type Cleanup, type CaseId } from './evidence.js';

export type HarnessResult = { cases: CaseEvidence[]; cleanup: Cleanup; nativeAvailable: boolean };
export async function runHarness(publicProbe: () => Promise<CaseEvidence['facts']>): Promise<HarnessResult> {
  const cases: CaseEvidence[] = caseIds.map(id => ({ id, status: 'NOT-RUN', code: 'PREREQUISITE', fixtureOnly: true, facts: {} }));
  const cleanup: Cleanup = { schema: 1, status: 'NOT-RUN', roots: [] };
  const set = (id: CaseId, update: Partial<CaseEvidence>) => Object.assign(cases.find(c => c.id === id)!, update);
  for (const id of ['socket-native', 'native-fault'] as const) set(id, { status: 'BLOCKED', code: 'UNAVAILABLE_API' });
  for (const id of ['cross-user', 'packaging', 'recovery', 'real-target'] as const) set(id, { status: 'BLOCKED', code: 'NOT_AUTHORIZED' });
  set('freshness-before-send', { status: 'BLOCKED', code: 'NO_FRESHNESS_AUTHORITY' });
  let current: CaseId = 'public-entry';
  let f: OwnedFixture | undefined;
  let service: ManagedCore | undefined;
  let decoy: net.Server | undefined;
  let client: ManagedClient | undefined;
  const peers = new Set<net.Socket>();
  const closes: Promise<void>[] = [];
  let failed = false;
  try {
    set(current, { facts: await publicProbe(), status: 'PASS', code: 'CHECKED' });
    if (!process.getuid || process.getuid() === 0 || process.platform === 'win32') return { cases, cleanup, nativeAvailable: false };
    current = 'namespace';
    // Explicit synthetic fixture location, NOT production ancestor/namespace approval.
    f = await OwnedFixture.create(join(await realpath('/tmp'), 'agent-pet-d61-'));
    const roots = { storageRoot: join(f.root, 'd'), runtimeRoot: join(f.root, 'r') };
    await f.directory(roots.storageRoot); await f.directory(roots.runtimeRoot);
    const policy = await fixturePolicy(roots);
    const files = new PrivateFiles(await policy.openRoots(roots));
    for (const path of ['relative', roots.runtimeRoot + '/../escape', roots.runtimeRoot + '//x', roots.runtimeRoot + '/x\0y', '/' + 'x/'.repeat(65)]) assert.throws(() => validatePath(path));
    for (const id of ['..', 'x/y', 'bad', 'x\0y']) assert.throws(() => endpoint(roots.runtimeRoot, id));
    const id = opaqueId(); const short = endpoint(roots.runtimeRoot, id);
    assert.ok(Buffer.byteLength(short) <= 100);
    assert.equal(Buffer.byteLength(endpoint('/' + 'x'.repeat(64), id)), 100);
    assert.equal(Buffer.byteLength(endpoint('/' + 'é'.repeat(32), id)), 100);
    assert.throws(() => endpoint('/' + 'é'.repeat(33), id), /path-too-long/);
    assert.throws(() => endpoint('/' + 'x'.repeat(80), id), /path-too-long/);
    const collision = join(roots.runtimeRoot, opaqueId()); await f.directory(collision);
    await assert.rejects(files.createDirectory(collision, 'socket-bind'), /ownership-busy/); await f.verify(collision);
    await assert.rejects(policy.openRoots({ ...roots, runtimeRoot: roots.runtimeRoot + '-other' }), /unsupported-path/);
    set(current, { status: 'PASS', code: 'CHECKED', facts: { positive: true, collisionPreserved: true } });

    let observations = 0;
    service = await openManagedCore({ roots, policy, initialize: true, publish() { observations++; }, limits: { authMs: 500, baselineMs: 1000 } });
    await f.track(join(roots.storageRoot, 'owner'));
    await f.track(join(roots.storageRoot, 'targets'));
    const target = await service.store.prepareTarget();
    await service.store.enableTarget(target.targetId, target.epoch, service.store.snapshot().revision);
    await f.track(join(roots.storageRoot, 'authorization.json'));
    await f.track(credentialPath(roots.storageRoot, target.targetId, target.epoch));
    let discovery = await service.start();
    await f.track(join(roots.storageRoot, 'discovery.json'));
    await f.track(join(roots.runtimeRoot, discovery.instance)); await f.track(endpoint(roots.runtimeRoot, discovery.instance));
    // Separate owned client snapshot allows actual malformed/stale discovery file reads without
    // mutating the Core's checked discovery receipt or weakening its teardown barrier.
    const clientRoots = { storageRoot: join(f.root, 'c'), runtimeRoot: roots.runtimeRoot };
    await f.directory(clientRoots.storageRoot); await f.directory(join(clientRoots.storageRoot, 'targets'));
    for (const [source, destination] of [
      [join(roots.storageRoot, 'authorization.json'), join(clientRoots.storageRoot, 'authorization.json')],
      [credentialPath(roots.storageRoot, target.targetId, target.epoch), credentialPath(clientRoots.storageRoot, target.targetId, target.epoch)],
    ] as const) await f.file(destination, await readFile(source, 'utf8'));
    const discoveryPath = join(clientRoots.storageRoot, 'discovery.json'); await f.file(discoveryPath, JSON.stringify(discovery));
    const options = { roots: clientRoots, policy: await fixturePolicy(clientRoots), authSetId: discovery.authSetId, targetId: target.targetId, limits: { authMs: 500 } };
    current = 'positive-handshake';
    client = await connectManagedCore(options);
    await waitFor(() => service!.connectionsSnapshot()[target.targetId] === 1);
    client.send({ type: 'hello', schemaVersion: 1, seq: 1, processInstanceId: 'fixture-process', providerSessionId: 'fixture-session', sentAt: '2026-01-01T00:00:00.000Z', status: 'idle' });
    await waitFor(() => observations === 1);
    client.close(); client = undefined;
    await waitFor(() => Object.keys(service!.connectionsSnapshot()).length === 0);
    set(current, { status: 'PASS', code: 'CHECKED', facts: { admissions: 1, observations, positive: true } });
    // Actual clean restart supplies a genuinely retired generation (not a random invalid token).
    const retiredGeneration = discovery.generation;
    await service.stop();
    service = await openManagedCore({ roots, policy, initialize: false, publish() { observations++; }, limits: { authMs: 500, baselineMs: 1000 } });
    await f.track(join(roots.storageRoot, 'owner'));
    discovery = await service.start();
    assert.notEqual(discovery.generation, retiredGeneration);
    await f.track(join(roots.storageRoot, 'discovery.json'));
    await f.track(join(roots.runtimeRoot, discovery.instance)); await f.track(endpoint(roots.runtimeRoot, discovery.instance));
    await writeFile(discoveryPath, JSON.stringify(discovery));
    client = await connectManagedCore(options); client.close(); client = undefined;
    await waitFor(() => Object.keys(service!.connectionsSnapshot()).length === 0);

    const decoyId = opaqueId(); const decoyDir = join(roots.runtimeRoot, decoyId); await f.directory(decoyDir);
    const decoyPath = endpoint(roots.runtimeRoot, decoyId);
    let bytes = 0; let connections = 0;
    decoy = net.createServer(socket => {
      connections++; peers.add(socket);
      closes.push(new Promise(resolve => socket.once('close', () => { peers.delete(socket); resolve(); })));
      socket.on('error', () => {}); socket.on('data', chunk => { bytes += chunk.length; socket.destroy(); });
      socket.setTimeout(500, () => socket.destroy());
    });
    await bounded(new Promise<void>((resolve, reject) => { decoy!.once('error', reject); decoy!.listen(decoyPath, resolve); }));
    await chmod(decoyPath, 0o600); await f.track(decoyPath);
    // A direct synthetic one-byte control proves the decoy is listening and its counter works.
    const control = net.createConnection(decoyPath); control.on('error', () => {});
    const controlClosed = new Promise<void>(resolve => control.once('close', () => resolve()));
    control.once('connect', () => control.end('x')); control.setTimeout(500, () => control.destroy());
    await bounded(controlClosed); await waitFor(() => bytes === 1 && peers.size === 0);
    bytes = 0; connections = 0;
    current = 'malformed-discovery';
    await writeFile(discoveryPath, JSON.stringify({ ...discovery, instance: decoyId, unexpected: true }));
    await assert.rejects(connectManagedCore(options), /unauthorized/);
    assert.equal(bytes, 0); assert.equal(connections, 0);
    set(current, { status: 'PASS', code: 'CHECKED', facts: { bytes, connections, positive: true } });

    current = 'protected-path';
    await writeFile(discoveryPath, JSON.stringify({ ...discovery, instance: decoyId }));
    await files.socket(decoyPath, 'socket-connect'); // same path accepted before changing protection
    await chmod(decoyPath, 0o666);
    await assert.rejects(connectManagedCore(options), /unsafe-mode/);
    assert.equal(bytes, 0); assert.equal(connections, 0);
    await chmod(decoyPath, 0o600); await files.socket(decoyPath, 'socket-connect');
    set(current, { status: 'PASS', code: 'CHECKED', facts: { bytes, connections, positive: true, denied: true } });

    current = 'stale-generation';
    // Well-formed stale generation is checked AFTER credential transmission by the existing Core.
    // No independent freshness or kernel peer-identity authority is invented by this fixture.
    await writeFile(discoveryPath, JSON.stringify({ ...discovery, generation: retiredGeneration }));
    const before = observations;
    await assert.rejects(connectManagedCore(options), /unauthorized/);
    await waitFor(() => Object.keys(service!.connectionsSnapshot()).length === 0);
    assert.equal(observations, before);
    set(current, { status: 'PASS', code: 'CHECKED', facts: { admissions: 0, observations: observations - before, denied: true } });
  } catch {
    failed = true; set(current, { status: 'FAIL', code: 'CHECK_FAILED' });
  } finally {
    client?.close();
    for (const socket of peers) socket.destroy();
    try {
      await bounded(Promise.all(closes));
      if (decoy?.listening) await bounded(new Promise<void>(resolve => decoy!.close(() => resolve())));
      if (failed) service?.failUncertain();
      if (service) await bounded(service.stop());
      if (f && !failed) { await f.cleanup(); cleanup.roots.push({ alias: 'core-root', verdict: 'REMOVED', code: 'CLEAN' }); }
      else if (f) cleanup.roots.push({ alias: 'core-root', verdict: 'PRESERVED', code: 'UNCERTAIN' });
    } catch {
      failed = true;
      if (f) cleanup.roots.push({ alias: 'core-root', verdict: 'PRESERVED', code: 'UNCERTAIN' });
    }
  }
  cleanup.status = failed ? 'FAIL' : 'PASS';
  // Stop after any failed/uncertain attempt; do not retry or launch later native controls.
  const nativeAvailable = !failed && await runNativeControls(cases, cleanup);
  return { cases, cleanup, nativeAvailable };
}
