import { test, expect } from 'vitest';
import { Worker } from 'node:worker_threads';
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, cleanups } from '../test-helpers.js';
import { WorkerFilesPort } from './files-port-proxy.js';
import { MAX_RECEIPTS, MAX_TRANSACTIONS, WORKER_PROTOCOL } from './protocol.js';

type Message = { protocolVersion: number; kind: string; requestId: string; body: any; sequence: number; workerGeneration: string };
const wire = (generation: string, sequence: number, requestId: string, body: any): Message => ({
  protocolVersion: WORKER_PROTOCOL, kind: 'request', workerGeneration: generation, sequence, requestId, body,
});
const requestReply = (worker: Worker, message: Message): Promise<Message> => new Promise((resolve, reject) => {
  const onMessage = (value: Message) => { if (value.requestId !== message.requestId || value.kind !== 'reply') return; cleanup(); resolve(value); };
  const onError = (error: Error) => { cleanup(); reject(error); };
  const cleanup = () => { worker.off('message', onMessage); worker.off('error', onError); };
  worker.on('message', onMessage); worker.on('error', onError); worker.postMessage(message);
});

test('B4.1 Node Worker initializes, publishes, reads and acknowledges release', async () => {
  const f = await fixture();
  const files = new WorkerFilesPort({ roots: f.roots, initialize: true });
  cleanups.push(() => files.close().catch(() => {}));
  const owner = await files.acquireOwner();
  await files.createDirectory(join(f.roots.storageRoot, 'targets'), 'authority-write');
  const receipt = await files.publish(join(f.roots.storageRoot, 'value.json'), { value: true }, 2048, 'authority-write');
  const result = await files.read(join(f.roots.storageRoot, 'value.json'), 2048, 'authority-read');
  expect(result.value).toEqual({ value: true });
  await files.release(result.owned);
  await files.remove(receipt);
  await files.drain();
  await owner.remove();
  await owner.close();
});

test('real entry rejects foreign generation before init and does not advance receive sequence', async () => {
  const f = await fixture();
  const generation = 'a'.repeat(32);
  const worker = new Worker(new URL('./entry.mjs', import.meta.url), { workerData: { workerGeneration: generation } });
  cleanups.push(async () => { worker.unref(); });
  const event = new Promise<Message>(resolve => worker.once('message', resolve));
  const init = { type: 'init', backend: 'node-fixture', roots: f.roots, initialize: true };
  worker.postMessage(wire('b'.repeat(32), 1, 'c'.repeat(32), init));
  expect((await event).body).toEqual({ type: 'failed', error: { code: 'protocol-failure', effect: 'none' } });
  await expect(access(join(f.roots.storageRoot, 'owner'))).rejects.toThrow();
  const initialized = await requestReply(worker, wire(generation, 1, 'd'.repeat(32), init));
  expect(initialized.body.ok).toBe(true);
  const ownerCap = initialized.body.result.ownerCap;
  expect((await requestReply(worker, wire(generation, 2, 'e'.repeat(32), { type: 'drain', ownerCap }))).body.ok).toBe(true);
  expect((await requestReply(worker, wire(generation, 3, 'f'.repeat(32), { type: 'remove-owner', ownerCap }))).body.ok).toBe(true);
});

test('real entry transaction saturation rejects before allocating an extra temporary inode', async () => {
  const f = await fixture();
  const files = new WorkerFilesPort({ roots: f.roots, initialize: true });
  cleanups.push(() => files.close().catch(() => {}));
  const owner = await files.acquireOwner();
  const transactions = [];
  for (let i = 0; i < MAX_TRANSACTIONS; i++) transactions.push(await files.beginWrite(join(f.roots.storageRoot, `value-${i}.json`), 2048, 'authority-write'));
  const before = await readdir(f.roots.storageRoot);
  await expect(files.beginWrite(join(f.roots.storageRoot, 'overflow.json'), 2048, 'authority-write')).rejects.toMatchObject({ code: 'limit-exceeded', effect: 'none' });
  expect(await readdir(f.roots.storageRoot)).toEqual(before);
  for (const transaction of transactions) { await transaction.abort(); await transaction.close(); }
  expect((await readdir(f.roots.storageRoot)).filter(name => name.startsWith('.write-'))).toHaveLength(0);
  await files.drain(); await owner.remove(); await owner.close();
}, 15000);

test('real entry receipt saturation rejects reads and publication before I/O; replacement reuses its slot', async () => {
  const f = await fixture();
  const files = new WorkerFilesPort({ roots: f.roots, initialize: true });
  cleanups.push(() => files.close().catch(() => {}));
  const owner = await files.acquireOwner();
  const path = join(f.roots.storageRoot, 'value.json');
  let published = await files.publish(path, { value: 1 }, 2048, 'authority-write');
  const receipts = [];
  for (let i = 1; i < MAX_RECEIPTS; i++) receipts.push((await files.read(path, 2048, 'authority-read')).owned);
  // An absent path would fail differently if the backend read were reached.
  await expect(files.read(join(f.roots.storageRoot, 'missing.json'), 2048, 'authority-read')).rejects.toEqual({ code: 'limit-exceeded', effect: 'none' });
  const newPath = join(f.roots.storageRoot, 'new.json');
  const transaction = await files.beginWrite(newPath, 2048, 'authority-write');
  await transaction.write({ value: 2 });
  const before = await readdir(f.roots.storageRoot);
  await expect(transaction.publishNew()).rejects.toEqual({ code: 'limit-exceeded', effect: 'none' });
  expect(await readdir(f.roots.storageRoot)).toEqual(before);
  await expect(access(newPath)).rejects.toThrow();
  // Consuming replacement evidence makes room even at the receipt ceiling.
  published = await files.publish(path, { value: 3 }, 2048, 'authority-write', published);
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ value: 3 });
  await files.release(receipts.pop()!);
  const newReceipt = await transaction.publishNew();
  await transaction.close();
  for (const receipt of receipts) await files.release(receipt);
  await files.remove(newReceipt); await files.remove(published);
  await files.drain(); await owner.remove(); await owner.close();
}, 15000);
