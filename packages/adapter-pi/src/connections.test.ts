import net from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { SessionObservation } from '@agent-pet/domain';
import { PiBridgeAdapter } from './index.js';

const token = 'isolated-connection-test-token';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function receiver(adapter = new PiBridgeAdapter(), onObservation?: () => void) {
  const root = await mkdtemp(join(tmpdir(), 'pet-peers-'));
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\pet-peers-${process.pid}-${root.split(/[/\\]/).at(-1)}` : join(root, 'p.sock');
  const states: string[] = [], observations: SessionObservation[] = [], sockets: net.Socket[] = [];
  const handle = await adapter.start({ endpoint, token }, {
    publish: value => { observations.push(value); onObservation?.(); }, connectionChanged: state => states.push(state),
  });
  let stopped = false;
  cleanups.push(async () => {
    for (const socket of sockets) socket.destroy();
    if (!stopped) await handle.stop();
    await rm(root, { recursive: true, force: true });
  });
  return { states, observations,
    async peer(processInstanceId: string, authenticate = true) {
      const socket = net.connect(endpoint); sockets.push(socket);
      socket.on('error', () => {});
      await once(socket, 'connect');
      let seq = 0;
      const send = (type: 'hello' | 'lifecycle', status: 'idle' | 'working' | 'completed' = 'idle', credential = token) => socket.write(JSON.stringify({
        type, schemaVersion: 1, token: credential, seq: ++seq, processInstanceId, providerSessionId: 'session',
        sentAt: '2026-10-14T00:00:00Z', status,
      }) + '\n');
      if (authenticate) {
        send('hello');
        await vi.waitFor(() => expect(observations.some(value => value.processInstanceId === processInstanceId)).toBe(true));
      }
      return { socket, send };
    },
    stop() { stopped = true; return handle.stop(); },
  };
}

async function disconnect(socket: net.Socket) {
  const closed = once(socket, 'close'); socket.end(); await closed;
  // Drain both ends' close callbacks before checking the absence of an offline notification.
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
}

it('stays online until the last authenticated peer leaves and preserves separate Session observations', async () => {
  const r = await receiver();
  const first = await r.peer('first'), second = await r.peer('second');
  first.send('lifecycle', 'working'); second.send('lifecycle', 'working');
  await vi.waitFor(() => expect(r.observations.filter(value => value.status === 'working')).toHaveLength(2));
  await disconnect(first.socket);
  second.send('lifecycle', 'completed');
  await vi.waitFor(() => expect(r.observations.at(-1)).toMatchObject({ processInstanceId: 'second', status: 'completed' }));
  expect(r.states).toEqual(['connected']);
  expect(new Set(r.observations.map(value => value.sessionId)).size).toBe(2);
  expect(r.observations.filter(value => value.status === 'error' || value.status === 'offline')).toEqual([]);
  await disconnect(second.socket);
  await vi.waitFor(() => expect(r.states).toEqual(['connected', 'disconnected']));
});

it('does not count raw, wrong-token, pre-hello or malformed peers as online', async () => {
  const r = await receiver();
  const unauthenticated = await r.peer('unauthenticated', false);
  unauthenticated.send('hello', 'idle', 'wrong-connection-token');
  unauthenticated.send('lifecycle', 'working');
  await disconnect(unauthenticated.socket);
  expect(r.states).toEqual([]); expect(r.observations).toEqual([]);
  const valid = await r.peer('valid');
  const malformed = await r.peer('malformed', false);
  malformed.socket.write('{broken}\n'); malformed.send('hello', 'idle', 'wrong-connection-token');
  await disconnect(malformed.socket);
  valid.send('lifecycle', 'working');
  await vi.waitFor(() => expect(r.observations.at(-1)?.status).toBe('working'));
  expect(r.states).toEqual(['connected']);
  await disconnect(valid.socket);
  await vi.waitFor(() => expect(r.states).toEqual(['connected', 'disconnected']));
});

it('keeps an overlapping reconnect online without duplicate hello transitions or stale close effects', async () => {
  const r = await receiver();
  const old = await r.peer('process');
  old.send('hello');
  await vi.waitFor(() => expect(r.observations).toHaveLength(2));
  const replacement = await r.peer('process', false);
  replacement.send('hello');
  await vi.waitFor(() => expect(r.observations).toHaveLength(3));
  await disconnect(old.socket);
  replacement.send('lifecycle', 'working');
  await vi.waitFor(() => expect(r.observations.at(-1)?.status).toBe('working'));
  expect(r.states).toEqual(['connected']);
  await disconnect(replacement.socket);
  await vi.waitFor(() => expect(r.states).toEqual(['connected', 'disconnected']));
  const later = await r.peer('new-process');
  expect(r.states).toEqual(['connected', 'disconnected', 'connected']);
  await disconnect(later.socket);
  await vi.waitFor(() => expect(r.states.at(-1)).toBe('disconnected'));
});

it('isolates receivers started by one adapter and drains shutdown once before a new receiver starts', async () => {
  const adapter = new PiBridgeAdapter(), first = await receiver(adapter), second = await receiver(adapter);
  await first.peer('same-process'); const remaining = await second.peer('same-process');
  await Promise.all([first.stop(), first.stop()]);
  expect(first.states).toEqual(['connected', 'disconnected']);
  remaining.send('lifecycle', 'working');
  await vi.waitFor(() => expect(second.observations.at(-1)?.status).toBe('working'));
  expect(second.states).toEqual(['connected']);
  const next = await receiver(adapter); await next.peer('same-process');
  await first.stop();
  expect(next.states).toEqual(['connected']);
  expect(first.states).toEqual(['connected', 'disconnected']);
});

it('drops already buffered events when an observation causes the receiver to stop', async () => {
  let shutdown!: () => void;
  let stopped: Promise<void> | undefined;
  const r = await receiver(undefined, () => shutdown());
  shutdown = () => { stopped ??= r.stop(); };
  const peer = await r.peer('stopping-process', false);
  peer.socket.write(['idle', 'working'].map((status, index) => JSON.stringify({
    type: index ? 'lifecycle' : 'hello', schemaVersion: 1, token, seq: index + 1,
    processInstanceId: 'stopping-process', providerSessionId: 'session', sentAt: '2026-10-14T00:00:00Z', status,
  })).join('\n') + '\n');
  await vi.waitFor(() => expect(stopped).toBeDefined()); await stopped;
  expect(r.observations.map(value => value.status)).toEqual(['idle']);
  expect(r.states).toEqual(['connected', 'disconnected']);
});
