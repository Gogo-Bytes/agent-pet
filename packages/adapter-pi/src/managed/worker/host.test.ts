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
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(fenced).toBe(true);
  await host.stop();
});

test('WorkerHost fences committed owner unlink before exposing terminal cleanup failure', async () => {
  let fenced = false;
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); parentPort.on('message', m => { const body = m.body.type === 'init' ? { type: 'reply', ok: true, result: { type: 'initialized', ownerCap: 'c'.repeat(32) } } : { type: 'reply', ok: false, error: { code: 'owner-unlink-committed', effect: 'committed' } }; parentPort.postMessage({ ...m, kind: 'reply', body }); });`, { eval: true });
  const host = new WorkerHost({ roots: { storageRoot: '/tmp/a', runtimeRoot: '/tmp/b' }, initialize: true, timeoutMs: 1000, worker, onFailure: () => { fenced = true; } });
  await expect(host.initialized).resolves.toMatchObject({ type: 'initialized' });
  await expect(host.request({ type: 'remove-owner', ownerCap: 'c'.repeat(32) })).rejects.toEqual({ code: 'owner-unlink-committed', effect: 'committed' });
  expect(fenced).toBe(true);
  expect(host.failed).toBe(true);
  await host.stop();
});

test('WorkerHost poisons on an unexpected zero-code Worker exit before rejecting pending work', async () => {
  const order: string[] = [];
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); parentPort.once('message', () => process.exit(0));`, { eval: true });
  const host = new WorkerHost({ roots: { storageRoot: '/tmp/a', runtimeRoot: '/tmp/b' }, initialize: true, onFailure: () => { order.push('failure'); }, worker });
  await expect(host.initialized.catch(error => { order.push('rejection'); throw error; })).rejects.toMatchObject({ code: 'outcome-uncertain', effect: 'uncertain' });
  expect(order).toEqual(['failure', 'rejection']);
  expect(host.failed).toBe(true);
  await host.stop();
});

test('WorkerHost accepts zero-code exit only after acknowledged clean stop', async () => {
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); let sequence = 0; parentPort.on('message', message => { const result = message.body.type === 'init' ? { type: 'initialized', ownerCap: 'c'.repeat(32) } : { type: 'owner-removed', parentSync: 'complete' }; parentPort.postMessage({ ...message, kind: 'reply', sequence: ++sequence, body: { type: 'reply', ok: true, result } }); if (message.body.type === 'remove-owner') { parentPort.postMessage({ ...message, kind: 'event', sequence: ++sequence, body: { type: 'stopped', clean: true } }); process.exit(0); } });`, { eval: true });
  const host = new WorkerHost({ roots: { storageRoot: '/tmp/a', runtimeRoot: '/tmp/b' }, initialize: true, worker });
  await expect(host.initialized).resolves.toMatchObject({ type: 'initialized' });
  await expect(host.request({ type: 'remove-owner', ownerCap: 'c'.repeat(32) })).resolves.toMatchObject({ type: 'owner-removed' });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(host.failed).toBe(false);
  await host.stop();
});

test('WorkerHost poisons a request racing an acknowledged remove-owner and settles it', async () => {
  let fenced = false;
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); let sequence = 0; parentPort.on('message', message => { const result = message.body.type === 'init' ? { type: 'initialized', ownerCap: 'c'.repeat(32) } : { type: 'owner-removed', parentSync: 'complete' }; parentPort.postMessage({ ...message, kind: 'reply', sequence: ++sequence, body: { type: 'reply', ok: true, result } }); if (message.body.type === 'remove-owner') setTimeout(() => { parentPort.postMessage({ ...message, kind: 'event', sequence: ++sequence, body: { type: 'stopped', clean: true } }); process.exit(0); }, 25); });`, { eval: true });
  const host = new WorkerHost({ roots: { storageRoot: '/tmp/a', runtimeRoot: '/tmp/b' }, initialize: true, worker, onFailure: () => { fenced = true; } });
  await expect(host.initialized).resolves.toMatchObject({ type: 'initialized' });
  await expect(host.request({ type: 'remove-owner', ownerCap: 'c'.repeat(32) })).resolves.toMatchObject({ type: 'owner-removed' });
  await expect(host.request({ type: 'drain', ownerCap: 'c'.repeat(32) })).rejects.toMatchObject({ code: 'outcome-uncertain', effect: 'uncertain' });
  expect(fenced).toBe(true);
  expect(host.failed).toBe(true);
  await host.stop();
});

test('WorkerHost rejects an unsolicited stopped event before remove-owner acknowledgement', async () => {
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); parentPort.once('message', message => parentPort.postMessage({ ...message, kind: 'event', sequence: 1, requestId: 's'.repeat(32), body: { type: 'stopped', clean: true } }));`, { eval: true });
  const host = new WorkerHost({ roots: { storageRoot: '/tmp/a', runtimeRoot: '/tmp/b' }, initialize: true, timeoutMs: 100, worker });
  await expect(host.initialized).rejects.toMatchObject({ code: 'outcome-uncertain', effect: 'uncertain' });
  expect(host.failed).toBe(true);
  await host.stop();
});

test('WorkerHost rejects an early stopped event even when it names the init request', async () => {
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); parentPort.once('message', message => parentPort.postMessage({ ...message, kind: 'event', sequence: 1, body: { type: 'stopped', clean: true } }));`, { eval: true });
  const host = new WorkerHost({ roots: { storageRoot: '/tmp/a', runtimeRoot: '/tmp/b' }, initialize: true, timeoutMs: 100, worker });
  await expect(host.initialized).rejects.toMatchObject({ code: 'outcome-uncertain', effect: 'uncertain' });
  expect(host.failed).toBe(true);
  await host.stop();
});

test('WorkerHost rejects a stopped event with the wrong remove-owner request identity', async () => {
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); let sequence = 0; parentPort.on('message', message => { const result = message.body.type === 'init' ? { type: 'initialized', ownerCap: 'c'.repeat(32) } : { type: 'owner-removed', parentSync: 'complete' }; parentPort.postMessage({ ...message, kind: 'reply', sequence: ++sequence, body: { type: 'reply', ok: true, result } }); if (message.body.type === 'remove-owner') { parentPort.postMessage({ ...message, kind: 'event', sequence: ++sequence, requestId: 'w'.repeat(32), body: { type: 'stopped', clean: true } }); } });`, { eval: true });
  const host = new WorkerHost({ roots: { storageRoot: '/tmp/a', runtimeRoot: '/tmp/b' }, initialize: true, worker });
  await expect(host.initialized).resolves.toMatchObject({ type: 'initialized' });
  await expect(host.request({ type: 'remove-owner', ownerCap: 'c'.repeat(32) })).resolves.toMatchObject({ type: 'owner-removed' });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(host.failed).toBe(true);
  await host.stop();
});

test('WorkerHost rejects a duplicate stopped event for the acknowledged remove-owner request', async () => {
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); let sequence = 0; parentPort.on('message', message => { const result = message.body.type === 'init' ? { type: 'initialized', ownerCap: 'c'.repeat(32) } : { type: 'owner-removed', parentSync: 'complete' }; parentPort.postMessage({ ...message, kind: 'reply', sequence: ++sequence, body: { type: 'reply', ok: true, result } }); if (message.body.type === 'remove-owner') { const event = { ...message, kind: 'event', sequence: ++sequence, body: { type: 'stopped', clean: true } }; parentPort.postMessage(event); parentPort.postMessage({ ...event, sequence: ++sequence }); } });`, { eval: true });
  const host = new WorkerHost({ roots: { storageRoot: '/tmp/a', runtimeRoot: '/tmp/b' }, initialize: true, worker });
  await expect(host.initialized).resolves.toMatchObject({ type: 'initialized' });
  await expect(host.request({ type: 'remove-owner', ownerCap: 'c'.repeat(32) })).resolves.toMatchObject({ type: 'owner-removed' });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(host.failed).toBe(true);
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
