import { randomUUID } from 'node:crypto';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectClaudePresence, startClaudePresenceServer } from './presence-channel.js';

const token = 'a'.repeat(64), otherToken = 'b'.repeat(64);
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function waitFor(predicate: () => boolean) {
  const end = Date.now() + 2000;
  while (!predicate()) { if (Date.now() > end) throw new Error('Fixture condition timed out'); await new Promise(resolve => setTimeout(resolve, 5)); }
}
async function receiver(onChange?: (value: { launchers: number; observedRuns: number }) => undefined) {
  const changes: { launchers: number; observedRuns: number }[] = [];
  const server = await startClaudePresenceServer({ token, onChange: onChange ?? (value => { changes.push(value); }) });
  cleanup.push(server.stop);
  return { ...server, changes, current: () => changes.at(-1) ?? { launchers: 0, observedRuns: 0 } };
}
async function client(url: string, onLost = vi.fn(() => undefined)) {
  const connection = await connectClaudePresence({ url, token, onLost }); cleanup.push(connection.close);
  return { ...connection, onLost };
}
function frame(runId: string, kind = 'child-started', extra: Record<string, unknown> = {}) {
  return `${JSON.stringify({ schemaVersion: 1, runId, kind, ...extra })}\n`;
}
async function raw(url: string, options: { token?: string; path?: string; headers?: http.OutgoingHttpHeaders; method?: string } = {}) {
  const request = http.request(new URL(options.path ?? '/claude-presence', url), { method: options.method ?? 'POST', agent: false,
    headers: { Authorization: `Bearer ${options.token ?? token}`, 'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked', ...options.headers } });
  request.on('error', () => {});
  let closed = false;
  request.on('close', () => { closed = true; });
  cleanup.push(() => { request.destroy(); });
  const accepted = new Promise<number | undefined>(resolve => {
    request.once('response', response => { response.on('error', () => {}); response.resume(); resolve(response.statusCode); });
    request.once('error', () => resolve(undefined));
    request.once('close', () => resolve(undefined));
  });
  request.flushHeaders();
  return { request, accepted, isClosed: () => closed };
}
function report(connection: Awaited<ReturnType<typeof client>>, runId: string, kind: 'child-started' | 'hook-observed' | 'child-ended') {
  expect(connection.report({ runId, kind })).toBeUndefined();
}

describe('Claude launcher presence channel', () => {
  it('counts accepted launchers, and counts presence only after a started run and root observation', async () => {
    const server = await receiver(), connection = await client(server.url), runId = randomUUID();
    expect(server.current()).toEqual({ launchers: 1, observedRuns: 0 });
    report(connection, runId, 'child-started');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(server.current()).toEqual({ launchers: 1, observedRuns: 0 });
    report(connection, runId, 'hook-observed');
    await waitFor(() => server.current().observedRuns === 1);
    report(connection, runId, 'child-ended');
    await waitFor(() => server.current().observedRuns === 0);
    await connection.close();
    await waitFor(() => server.current().launchers === 0);
    expect(connection.onLost).not.toHaveBeenCalled();
  });
  it('keeps other observed runs through partial exit and close', async () => {
    const server = await receiver(), first = await client(server.url), second = await client(server.url);
    const firstId = randomUUID(), secondId = randomUUID();
    for (const [connection, runId] of [[first, firstId], [second, secondId]] as const) {
      report(connection, runId, 'child-started'); report(connection, runId, 'hook-observed');
    }
    await waitFor(() => server.current().observedRuns === 2);
    report(first, firstId, 'child-ended'); await first.close();
    await waitFor(() => server.current().launchers === 1);
    expect(server.current().observedRuns).toBe(1);
  });
  it('rejects another channel claiming an active run without dropping its owner', async () => {
    const server = await receiver(), owner = await client(server.url), intruder = await client(server.url), runId = randomUUID();
    report(owner, runId, 'child-started'); report(owner, runId, 'hook-observed');
    await waitFor(() => server.current().observedRuns === 1);
    report(intruder, runId, 'child-started');
    await waitFor(() => intruder.onLost.mock.calls.length === 1);
    expect(server.current()).toEqual({ launchers: 1, observedRuns: 1 });
    await intruder.close();
    expect(server.current()).toEqual({ launchers: 1, observedRuns: 1 });
  });
  it.each([
    { token: otherToken }, { path: '/claude-hooks' }, { path: '/claude-presence?x=1' }, { method: 'GET' },
    { headers: { Origin: 'http://localhost' } }, { headers: { Host: 'localhost' } },
    { headers: { 'Content-Type': 'application/json' } },
  ])('rejects unauthorized or browser/alternate requests %j', async options => {
    const server = await receiver(), channel = await raw(server.url, options);
    expect(await channel.accepted).toBe(options.token ? 401 : 400);
    expect(server.changes).toEqual([]);
  });
  it.each([
    () => '{bad}\n', () => frame(randomUUID(), 'hook-observed'), () => frame(randomUUID(), 'child-ended'),
    () => frame('not-a-uuid'), () => frame(randomUUID(), 'child-started', { body: 'not permitted' }),
    () => frame(randomUUID(), 'child-started', { schemaVersion: 2 }),
    () => frame(randomUUID(), 'session-started'),
  ])('retires invalid or unordered wire input', async invalid => {
    const server = await receiver(), channel = await raw(server.url);
    expect(await channel.accepted).toBe(200);
    channel.request.write(invalid());
    await waitFor(channel.isClosed);
    expect(server.current()).toEqual({ launchers: 0, observedRuns: 0 });
  });
  it.each(['changed-id', 'repeat-start', 'repeat-observed', 'after-end'])('retires invalid subsequent frame: %s', async mode => {
    const server = await receiver(), channel = await raw(server.url), runId = randomUUID();
    expect(await channel.accepted).toBe(200);
    channel.request.write(frame(runId));
    if (mode === 'changed-id') channel.request.write(frame(randomUUID(), 'hook-observed'));
    if (mode === 'repeat-start') channel.request.write(frame(runId));
    if (mode === 'repeat-observed') channel.request.write(frame(runId, 'hook-observed') + frame(runId, 'hook-observed'));
    if (mode === 'after-end') channel.request.write(frame(runId, 'child-ended') + frame(runId));
    await waitFor(channel.isClosed);
    expect(server.current()).toEqual({ launchers: 0, observedRuns: 0 });
  });
  it('bounds total bytes including unframed data', async () => {
    const server = await receiver(), channel = await raw(server.url);
    expect(await channel.accepted).toBe(200);
    channel.request.write(' '.repeat(2049));
    await waitFor(channel.isClosed);
    expect(server.current().launchers).toBe(0);
  });
  it('handles split frames and retires an incomplete request when its channel closes', async () => {
    const server = await receiver(), channel = await raw(server.url), runId = randomUUID(), line = frame(runId);
    expect(await channel.accepted).toBe(200);
    channel.request.write(line.slice(0, 18)); channel.request.write(line.slice(18));
    channel.request.write(frame(runId, 'hook-observed'));
    await waitFor(() => server.current().observedRuns === 1);
    channel.request.end('{');
    await waitFor(() => server.current().launchers === 0);
  });
  it('treats abrupt launcher socket loss as observation loss and preserves other runs', async () => {
    const server = await receiver(), first = await raw(server.url), second = await client(server.url);
    expect(await first.accepted).toBe(200);
    const firstId = randomUUID(), secondId = randomUUID();
    first.request.write(frame(firstId) + frame(firstId, 'hook-observed'));
    report(second, secondId, 'child-started'); report(second, secondId, 'hook-observed');
    await waitFor(() => server.current().observedRuns === 2);
    first.request.destroy();
    await waitFor(() => server.current().launchers === 1);
    expect(server.current().observedRuns).toBe(1); expect(second.onLost).not.toHaveBeenCalled();
  });
  it('bounds peers and releases partial-header peers at the authentication deadline', async () => {
    const server = await receiver(), sockets: net.Socket[] = [];
    for (let index = 0; index < 16; index++) {
      const socket = net.connect(Number(new URL(server.url).port), '127.0.0.1'); socket.on('error', () => {}); sockets.push(socket);
      await new Promise<void>(resolve => socket.once('connect', resolve)); socket.write('POST /claude-presence HTTP/1.1\r\n');
    }
    cleanup.push(() => { for (const socket of sockets) socket.destroy(); });
    const extra = net.connect(Number(new URL(server.url).port), '127.0.0.1'); extra.on('error', () => {});
    cleanup.push(() => { extra.destroy(); });
    await new Promise(resolve => extra.once('close', resolve));
    await waitFor(() => sockets.every(socket => socket.destroyed));
    expect(server.changes).toEqual([]);
  });
  it('allows authenticated idle beyond the connection deadline', async () => {
    const server = await receiver(), connection = await client(server.url);
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(connection.onLost).not.toHaveBeenCalled();
    report(connection, randomUUID(), 'child-started');
  });
  it('stop is idempotent and closes partial peers and clients, reporting loss once', async () => {
    const server = await receiver(), connection = await client(server.url), runId = randomUUID();
    report(connection, runId, 'child-started'); report(connection, runId, 'hook-observed');
    await waitFor(() => server.current().observedRuns === 1);
    const partial = net.connect(Number(new URL(server.url).port), '127.0.0.1'); partial.on('error', () => {});
    cleanup.push(() => { partial.destroy(); });
    await new Promise<void>(resolve => partial.once('connect', resolve));
    const stopping = server.stop(); expect(server.stop()).toBe(stopping); await stopping;
    await waitFor(() => connection.onLost.mock.calls.length === 1 && partial.destroyed);
    expect(server.current()).toEqual({ launchers: 0, observedRuns: 0 });
    const count = server.changes.length; await connection.close();
    expect(server.changes).toHaveLength(count);
    expect(() => connection.report({ runId, kind: 'child-ended' })).toThrow('Claude presence report unavailable');
  });
  it('supports synchronous stop reentry from a presence callback', async () => {
    let stop: (() => Promise<void>) | undefined;
    const changes: unknown[] = [];
    const server = await receiver(value => { changes.push(value); if (value.observedRuns) void stop?.(); }); stop = server.stop;
    const connection = await client(server.url), runId = randomUUID();
    report(connection, runId, 'child-started'); report(connection, runId, 'hook-observed');
    await waitFor(() => connection.onLost.mock.calls.length === 1);
    await server.stop(); expect(changes.at(-1)).toEqual({ launchers: 0, observedRuns: 0 });
  });
  it.each(['throw', 'async'])('fails closed and consumes %s callback failures', async mode => {
    const server = await receiver(value => {
      if (value.observedRuns) {
        if (mode === 'throw') throw new Error('private fixture detail');
        return Promise.reject(new Error('private fixture detail')) as never;
      }
    });
    const connection = await client(server.url), runId = randomUUID();
    report(connection, runId, 'child-started'); report(connection, runId, 'hook-observed');
    await waitFor(() => connection.onLost.mock.calls.length === 1); await server.stop();
  });
  it('fails closed when publication rejects acceptance before sending readiness', async () => {
    const changes: unknown[] = [];
    const server = await receiver(value => { changes.push(value); if (value.launchers) throw new Error('private fixture detail'); });
    const onLost = vi.fn(() => undefined);
    await expect(connectClaudePresence({ url: server.url, token, onLost })).rejects.toThrow('Claude presence unavailable');
    await server.stop(); expect(onLost).not.toHaveBeenCalled();
    expect(changes).toEqual([{ launchers: 1, observedRuns: 0 }, { launchers: 0, observedRuns: 0 }]);
  });
  it('fails synchronous report validation closed without sending extra fields', async () => {
    const server = await receiver(), connection = await client(server.url);
    expect(() => connection.report({ runId: randomUUID(), kind: 'child-started', body: 'private fixture detail' } as never))
      .toThrow('Claude presence report unavailable');
    await waitFor(() => server.current().launchers === 0);
    expect(connection.onLost).toHaveBeenCalledTimes(1);
  });
  it('sanitizes hostile JS accessors in report and retires the channel', async () => {
    const server = await receiver(), connection = await client(server.url);
    const event = { get runId() { throw new Error('private fixture detail'); }, kind: 'child-started' };
    expect(() => connection.report(event as never)).toThrow('Claude presence report unavailable');
    await waitFor(() => server.current().launchers === 0);
  });
  it('has a bounded acceptance deadline and does not signal a never-ready connection as lost', async () => {
    const sockets = new Set<net.Socket>(), server = net.createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    cleanup.push(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); });
    const onLost = vi.fn(() => undefined);
    await expect(connectClaudePresence({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/claude-presence`, token, onLost }))
      .rejects.toThrow('Claude presence unavailable');
    expect(onLost).not.toHaveBeenCalled();
  });
  it('rejects redirects and response instructions, and consumes a rejected onLost callback', async () => {
    const server = http.createServer((_request, response) => { response.writeHead(302, { Location: 'http://invalid.test/' }); response.end('private fixture instruction'); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    cleanup.push(() => new Promise<void>(resolve => server.close(() => resolve())));
    await expect(connectClaudePresence({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/claude-presence`, token, onLost: () => undefined }))
      .rejects.toThrow('Claude presence unavailable');
    const real = await receiver(), connection = await client(real.url, vi.fn(() => Promise.reject(new Error('private fixture detail')) as never));
    await real.stop(); await waitFor(() => connection.onLost.mock.calls.length === 1);
  });
  it('retires a server that sends response body instructions after acceptance', async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' }); response.flushHeaders(); response.write('private fixture instruction');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    cleanup.push(() => new Promise<void>(resolve => server.close(() => resolve())));
    const onLost = vi.fn(() => undefined);
    const connection = await connectClaudePresence({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/claude-presence`, token, onLost });
    cleanup.push(connection.close);
    await waitFor(() => onLost.mock.calls.length === 1);
    expect(() => connection.report({ runId: randomUUID(), kind: 'child-started' })).toThrow('Claude presence report unavailable');
  });
  it.each(['https://127.0.0.1:1/claude-presence', 'http://localhost:1/claude-presence', 'http://127.0.0.1:1/claude-hooks',
    'http://user@127.0.0.1:1/claude-presence', 'http://127.0.0.1:1/claude-presence#x'])('rejects unsafe target %s', async url => {
    await expect(connectClaudePresence({ url, token, onLost: () => undefined })).rejects.toThrow('Invalid Claude presence configuration');
  });
});
