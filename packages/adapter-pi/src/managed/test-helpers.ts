import { afterEach } from 'vitest';
import { mkdtemp, mkdir, realpath, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { fixturePolicy } from './test-policy.js';
import { openManagedCore, type CoreOptions, type ManagedCore } from './service.js';
import { credentialPath, type Credential } from './auth-store.js';
import { endpoint } from './discovery.js';
import type { AuthHello, ManagedSessionEvent } from './protocol.js';
export const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
export async function fixture() {
  // Explicit, isolated short synthetic root; NOT a product fallback from os.tmpdir().
  const base = await mkdtemp(join(await realpath('/tmp'), 'ap-'));
  cleanups.push(() => rm(base, { recursive: true, force: true }));
  const storageRoot = join(base, 'd'); const runtimeRoot = join(base, 'r');
  await mkdir(storageRoot, { mode: 0o700 }); await mkdir(runtimeRoot, { mode: 0o700 });
  const roots = { storageRoot, runtimeRoot };
  return { base, roots, policy: await fixturePolicy(roots) };
}
export async function opened(overrides: Partial<Pick<CoreOptions, 'limits' | 'fault' | 'publish'>> = {}) {
  const f = await fixture();
  const service = await openManagedCore({ ...f, initialize: true, publish() {}, ...overrides });
  cleanups.push(() => service.stop().catch(() => {}));
  return { ...f, service };
}
export async function enabled(service: ManagedCore) {
  const target = await service.store.prepareTarget();
  await service.store.enableTarget(target.targetId, target.epoch, service.store.snapshot().revision);
  return target;
}
export async function authentication(f: Awaited<ReturnType<typeof opened>>, targetId: string): Promise<{ auth: AuthHello; path: string }> {
  const discovery = await f.service.start();
  const target = f.service.store.snapshot().targets.find(t => t.targetId === targetId)!;
  const credential = JSON.parse(await readFile(credentialPath(f.roots.storageRoot, targetId, target.epoch), 'utf8')) as Credential;
  return { path: endpoint(f.roots.runtimeRoot, discovery.instance), auth: { type: 'auth', protocolVersion: 2,
    authSetId: discovery.authSetId, targetId, epoch: credential.epoch, generation: discovery.generation, token: credential.token } };
}
export async function raw(path: string) {
  const socket = net.createConnection(path); socket.on('error', () => {});
  const closed = new Promise<void>(resolve => socket.once('close', () => resolve()));
  cleanups.push(async () => { socket.destroy(); await closed; });
  await once(socket, 'connect');
  return { socket, closed };
}
export function line(socket: net.Socket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let text = '';
    const data = (chunk: Buffer) => { text += chunk.toString(); if (text.includes('\n')) { cleanup(); resolve(JSON.parse(text.split('\n')[0]!)); } };
    const close = () => { cleanup(); reject(new Error('closed')); };
    const cleanup = () => { socket.off('data', data); socket.off('close', close); };
    socket.on('data', data); socket.on('close', close);
  });
}
export const wire = (value: unknown): string => JSON.stringify(value) + '\n';
export function baseline(seq = 1): ManagedSessionEvent {
  return { type: 'hello', schemaVersion: 1, seq, processInstanceId: 'process', providerSessionId: 'session', sentAt: '2026-01-01T00:00:00.000Z', status: 'idle', sessionName: 'synthetic-name', projectName: 'synthetic-project' };
}
export function lifecycle(seq = 2): Extract<ManagedSessionEvent, { type: 'lifecycle' }> {
  return { type: 'lifecycle', schemaVersion: 1, seq, processInstanceId: 'process', providerSessionId: 'session', sentAt: '2026-01-01T00:00:00.000Z', status: 'working' };
}
export async function admitted(auth: AuthHello, path: string) {
  const peer = await raw(path); const ack = line(peer.socket); peer.socket.write(wire(auth)); await ack;
  return peer;
}
