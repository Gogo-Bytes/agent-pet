import { test, expect } from 'vitest';
import { Worker } from 'node:worker_threads';
import { WorkerHost } from './host.js';

test('WorkerHost fences synchronously on timeout and does not cancel the late operation', async () => {
  let fenced = false;
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); parentPort.on('message', m => setTimeout(() => parentPort.postMessage({ ...m, kind: 'reply', body: { type: 'reply', ok: true, result: { type: 'initialized', ownerCap: 'c'.repeat(32) } } }), 100));`, { eval: true });
  const host = new WorkerHost({ roots: { storageRoot: '/tmp/a', runtimeRoot: '/tmp/b' }, initialize: true, timeoutMs: 10, worker, onFailure: () => { fenced = true; } });
  await expect(host.initialized).rejects.toMatchObject({ code: 'outcome-uncertain' });
  expect(fenced).toBe(true);
  await host.stop();
});

test('WorkerHost fences duplicate responses after the first response settles', async () => {
  let fenced = false;
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); parentPort.on('message', m => { const reply = { ...m, kind: 'reply', body: { type: 'reply', ok: true, result: { type: 'initialized', ownerCap: 'c'.repeat(32) } } }; parentPort.postMessage(reply); setTimeout(() => parentPort.postMessage(reply), 1); });`, { eval: true });
  const host = new WorkerHost({ roots: { storageRoot: '/tmp/a', runtimeRoot: '/tmp/b' }, initialize: true, worker, onFailure: () => { fenced = true; } });
  await expect(host.initialized).resolves.toMatchObject({ type: 'initialized' });
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(fenced).toBe(true);
  await host.stop();
});

test('WorkerHost poisons on malformed failed events before exposing their error', async () => {
  let fenced = false;
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); parentPort.on('message', m => parentPort.postMessage({ ...m, kind: 'event', requestId: 'd'.repeat(32), sequence: 1, body: { type: 'failed', error: { code: 'forged', effect: 'none' } } }));`, { eval: true });
  const host = new WorkerHost({ roots: { storageRoot: '/tmp/a', runtimeRoot: '/tmp/b' }, initialize: true, worker, onFailure: () => { fenced = true; } });
  await expect(host.initialized).rejects.toMatchObject({ code: 'outcome-uncertain', effect: 'uncertain' });
  expect(fenced).toBe(true);
  expect(host.failed).toBe(true);
  await host.stop();
});
