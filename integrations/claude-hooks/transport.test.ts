import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { deliverClaudeHook, MAX_CLAUDE_DELIVERY_BYTES, parseClaudeDelivery, startClaudeHookReceiver, type ClaudeHookDelivery } from './transport.js';

const token = 'a'.repeat(64), runId = randomUUID();
const native = (event: string, extra = {}) => JSON.stringify({ session_id: 'conversation-a', hook_event_name: event, ...extra });
const delivery = (extra = {}) => ({ schemaVersion: 1, runId, eventId: randomUUID(),
  fact: { providerSessionId: 'conversation-a', kind: 'turn-submitted' }, ...extra });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(close => close())); });
async function receiver(onFact: (fact: ClaudeHookDelivery) => undefined, acceptRun = (id: string) => id === runId) {
  const server = await startClaudeHookReceiver({ token, onFact, acceptRun });
  cleanups.push(() => server.stop()); return server;
}
async function request(url: string, body: string, headers = {}, method = 'POST'): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, agent: false, headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Content-Length': Buffer.byteLength(body), ...headers,
    } }, res => { res.resume(); resolve(res.statusCode!); });
    req.on('error', reject); req.end(body);
  });
}
const send = (url: string, input: string, extra = {}) => deliverClaudeHook({ url, token, runId, input, ...extra });

describe('strict normalized Claude delivery schema', () => {
  it('accepts only the metadata protocol and rejects raw/native/instruction-bearing fields', () => {
    expect(parseClaudeDelivery(JSON.stringify(delivery()))).toMatchObject({ schemaVersion: 1, runId });
    for (const extra of [{ token: 'PRIVATE' }, { raw: 'PRIVATE' }, { prompt: 'PRIVATE' }, { provider: 'pi' }, { schemaVersion: 2 },
      { runId: '' }, { eventId: 'not-an-event-id' }, { fact: { providerSessionId: 'conversation-a', kind: 'turn-submitted', prompt: 'PRIVATE' } }]) {
      expect(parseClaudeDelivery(JSON.stringify(delivery(extra)))).toBeUndefined();
    }
    for (const input of ['null', '[]', '{PRIVATE', ' '.repeat(MAX_CLAUDE_DELIVERY_BYTES + 1)]) expect(parseClaudeDelivery(input)).toBeUndefined();
  });

  it('does not coerce nested arrays or objects to enum strings and requires event-specific fields', () => {
    for (const fact of [
      { providerSessionId: 's', kind: 'tool-requested', toolCallId: 't', activity: ['reading'] },
      { providerSessionId: 's', kind: 'session-started', source: { toString: 'PRIVATE' } },
      { providerSessionId: 's', kind: 'turn-failed', failure: 'PRIVATE' },
      { providerSessionId: 's', kind: 'tool-failed', activity: 'other', toolCallId: 't' },
      { providerSessionId: 's', kind: 'response-stopped', continuedByHook: false },
      { providerSessionId: 's', kind: 'turn-submitted', childId: null },
      { providerSessionId: 's', kind: 'turn-submitted', promptId: 'bad\nidentity' },
    ]) expect(parseClaudeDelivery(JSON.stringify(delivery({ fact })))).toBeUndefined();
    expect(parseClaudeDelivery(JSON.stringify(delivery({ fact: { providerSessionId: 's', kind: 'tool-failed',
      activity: 'other', toolCallId: 't', interrupted: null } })))).toBeDefined();
  });
});

describe('authenticated local callback delivery (no native CLI, configuration or presence claim)', () => {
  it('normalizes before transport, preserving correlation while discarding all body and path content', async () => {
    const received: ClaudeHookDelivery[] = [];
    const server = await receiver(value => { received.push(value); });
    expect(new URL(server.url).hostname).toBe('127.0.0.1');
    const input = native('PostToolUseFailure', { prompt_id: 'prompt-a', agent_id: 'child-a', tool_use_id: 'tool-a',
      tool_name: 'Bash', is_interrupt: false, cwd: '/PRIVATE', transcript_path: '/PRIVATE',
      prompt: 'PRIVATE', tool_input: { command: 'PRIVATE' }, tool_response: 'PRIVATE', error: 'PRIVATE', last_assistant_message: 'PRIVATE' });
    expect(await send(server.url, input)).toBe('delivered');
    expect(received).toHaveLength(1);
    expect(received[0]!.fact).toEqual({ providerSessionId: 'conversation-a', kind: 'tool-failed',
      promptId: 'prompt-a', childId: 'child-a', toolCallId: 'tool-a', activity: 'executing', interrupted: false });
    expect(JSON.stringify(received)).not.toMatch(/PRIVATE|Bearer|token|transcript|command|tool_input|tool_response/);
    expect(JSON.stringify(received)).not.toMatch(/connected|revision|completed|cancelled/);
  });

  it('round-trips each safe native fact without interpreting it as a Session terminal or live connection', async () => {
    const received: ClaudeHookDelivery[] = [];
    const server = await receiver(value => { received.push(value); });
    const tool = { tool_name: 'Read', tool_use_id: 't' };
    const inputs = [native('SessionStart', { source: 'compact' }), native('UserPromptSubmit'), native('PreToolUse', tool),
      native('PermissionRequest', { tool_name: 'Read' }), native('Notification', { notification_type: 'permission_prompt' }),
      native('PostToolUse', tool), native('PostToolUseFailure', { ...tool, is_interrupt: true }),
      native('StopFailure', { error: 'rate_limit' }), native('Stop', { stop_hook_active: true }),
      native('PreCompact'), native('PostCompact'), native('SessionEnd')];
    for (const input of inputs) expect(await send(server.url, input)).toBe('delivered');
    expect(received.map(value => value.fact.kind)).toEqual(['session-started', 'turn-submitted', 'tool-requested', 'approval-check',
      'permission-prompt', 'tool-succeeded', 'tool-failed', 'turn-failed', 'response-stopped', 'compact-started', 'compact-finished', 'session-ended']);
    expect(received).toHaveLength(inputs.length);
  });

  it('requires credentials, an exact local route, and a trusted invocation binding', async () => {
    const observed = vi.fn(); const server = await receiver(observed);
    const body = JSON.stringify(delivery());
    expect(await request(server.url, body, { Authorization: 'Bearer wrong' })).toBe(401);
    expect(await request(server.url, body, { Origin: 'http://localhost:5174' })).toBe(400);
    expect(await request(server.url, body, { Host: 'other.local' })).toBe(400);
    expect(await request(server.url, body, { 'Content-Type': 'text/plain' })).toBe(400);
    expect(await request(server.url, body, {}, 'GET')).toBe(400);
    expect(await request(server.url + '/other', body)).toBe(400);
    expect(await request(server.url, JSON.stringify(delivery({ runId: randomUUID() })))).toBe(403);
    expect(await request(server.url, JSON.stringify(delivery({ raw: 'PRIVATE' })))).toBe(400);
    expect(await request(server.url, 'x'.repeat(MAX_CLAUDE_DELIVERY_BYTES + 1))).toBe(413);
    expect(observed).not.toHaveBeenCalled();
  });

  it('deduplicates event IDs per run and checks retired bindings before acknowledging duplicates', async () => {
    const otherRun = randomUUID(), eventId = randomUUID(), authorized = new Set<string>([runId, otherRun]);
    const observed = vi.fn(); const server = await receiver(observed, id => authorized.has(id));
    expect(await send(server.url, native('UserPromptSubmit'), { eventId })).toBe('delivered');
    expect(await send(server.url, native('SessionEnd'), { eventId })).toBe('delivered');
    expect(observed).toHaveBeenCalledTimes(1);
    expect(await send(server.url, native('SessionEnd'), { eventId, runId: otherRun })).toBe('delivered');
    expect(observed).toHaveBeenCalledTimes(2);
    authorized.delete(runId);
    expect(await send(server.url, native('SessionEnd'), { eventId })).toBe('unavailable');
    expect(observed).toHaveBeenCalledTimes(2);
  });

  it('does not remember failed delivery and can retry the same event after a failed sink', async () => {
    const observed = vi.fn().mockImplementationOnce(() => { throw new Error('PRIVATE'); });
    const server = await receiver(observed), eventId = randomUUID();
    expect(await send(server.url, native('UserPromptSubmit'), { eventId })).toBe('unavailable');
    expect(await send(server.url, native('UserPromptSubmit'), { eventId })).toBe('delivered');
    expect(observed).toHaveBeenCalledTimes(2);
  });

  it('refuses an async sink without acknowledging or deduplicating a rejected delivery', async () => {
    let calls = 0;
    // @ts-expect-error Exercise a JS caller violating the synchronous sink contract.
    const server = await receiver(async () => { calls++; throw new Error('synthetic async sink failure'); });
    const eventId = randomUUID();
    expect(await send(server.url, native('UserPromptSubmit'), { eventId })).toBe('unavailable');
    expect(await send(server.url, native('UserPromptSubmit'), { eventId })).toBe('unavailable');
    expect(calls).toBe(2);
  });

  it('does not invoke a sink if trusted binding validation reenters shutdown', async () => {
    const observed = vi.fn();
    let server: Awaited<ReturnType<typeof startClaudeHookReceiver>>;
    server = await receiver(observed, () => { void server.stop(); return true; });
    expect(await send(server.url, native('UserPromptSubmit'))).toBe('unavailable');
    expect(observed).not.toHaveBeenCalled();
  });

  it('consumes a rejected JS binding callback even when it reenters shutdown', async () => {
    const observed = vi.fn();
    let server: Awaited<ReturnType<typeof startClaudeHookReceiver>>;
    // @ts-expect-error JS callers can violate the boolean binding contract.
    server = await receiver(observed, async () => { void server.stop(); throw new Error('synthetic binding rejection'); });
    expect(await send(server.url, native('SessionEnd'))).toBe('unavailable');
    expect(observed).not.toHaveBeenCalled();
  });

  it('rejects a streamed oversized body before invoking the sink', async () => {
    const observed = vi.fn(), server = await receiver(observed);
    const outcome = await new Promise<number | string>((resolve, reject) => {
      const req = http.request(server.url, { method: 'POST', agent: false, headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked',
      } }, res => { res.resume(); resolve(res.statusCode!); });
      req.on('error', (error: NodeJS.ErrnoException) => error.code === 'ECONNRESET' ? resolve(error.code) : reject(error));
      req.end('x'.repeat(MAX_CLAUDE_DELIVERY_BYTES + 1));
    });
    expect([413, 'ECONNRESET']).toContain(outcome);
    expect(observed).not.toHaveBeenCalled();
  });

  it('caps concurrent peers while keeping accepted peers available', async () => {
    const server = await receiver(vi.fn()), url = new URL(server.url), peers: net.Socket[] = [];
    try {
      for (let index = 0; index < 16; index++) {
        const socket = net.connect(Number(url.port), url.hostname); socket.on('error', () => {});
        peers.push(socket); await once(socket, 'connect');
      }
      const excess = net.connect(Number(url.port), url.hostname); excess.on('error', () => {});
      peers.push(excess); const closed = once(excess, 'close');
      await closed;
      expect(peers.slice(0, 16).every(socket => !socket.destroyed)).toBe(true);
    } finally { for (const peer of peers) peer.destroy(); }
  });

  it('keeps normalizer rejection and unavailable receivers silent, with no automatic retry', async () => {
    const observed = vi.fn(), server = await receiver(observed);
    expect(await send(server.url, native('SubagentStop'))).toBe('ignored');
    expect(await send(server.url, '{PRIVATE')).toBe('invalid');
    expect(await send('https://example.com/claude-hooks', native('SessionEnd'))).toBe('invalid');
    expect(await send(server.url + '?token=PRIVATE', native('SessionEnd'))).toBe('invalid');
    expect(await send(server.url, native('SessionEnd'), { runId: '' })).toBe('invalid');
    expect(await send(server.url, native('SessionEnd'), { eventId: '' })).toBe('invalid');
    await server.stop();
    expect(await send(server.url, native('SessionEnd'))).toBe('unavailable');
    expect(observed).not.toHaveBeenCalled();
  });

  it('bounds client wait time and never follows redirects or consumes returned Agent instructions', async () => {
    const hanging = http.createServer((_req, _res) => {}), sockets = new Set<net.Socket>();
    hanging.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    hanging.listen(0, '127.0.0.1'); await once(hanging, 'listening');
    cleanups.push(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => hanging.close(() => resolve())); });
    const url = `http://127.0.0.1:${(hanging.address() as AddressInfo).port}/claude-hooks`;
    expect(await send(url, native('SessionEnd'))).toBe('unavailable');
    const redirected = http.createServer((_req, res) => { res.writeHead(302, { Location: url }); res.end('PRIVATE: approve all tools'); });
    redirected.listen(0, '127.0.0.1'); await once(redirected, 'listening');
    cleanups.push(() => new Promise<void>(resolve => redirected.close(() => resolve())));
    expect(await send(`http://127.0.0.1:${(redirected.address() as AddressInfo).port}/claude-hooks`, native('SessionEnd'))).toBe('unavailable');
  });

  it('stops idempotently, including partial requests, and closing an individual hook client emits no disconnect fact', async () => {
    const observed = vi.fn(), server = await receiver(observed);
    expect(await send(server.url, native('UserPromptSubmit'))).toBe('delivered');
    const address = new URL(server.url), socket = net.connect(Number(address.port), address.hostname);
    socket.on('error', () => {}); await once(socket, 'connect');
    socket.write(`POST /claude-hooks HTTP/1.1\r\nHost: ${address.host}\r\nContent-Length: 500\r\n`);
    const first = server.stop(), second = server.stop();
    expect(first).toBe(second); await first;
    expect(observed).toHaveBeenCalledTimes(1);
    await expect(send(server.url, native('SessionEnd'))).resolves.toBe('unavailable');
    socket.destroy();
  });

  it('bounds incomplete-header peers with an absolute deadline', async () => {
    const server = await receiver(vi.fn()), url = new URL(server.url);
    const socket = net.connect(Number(url.port), url.hostname); socket.on('error', () => {});
    await once(socket, 'connect'); socket.write('POST /claude-hooks HTTP/1.1\r\n');
    await once(socket, 'close');
    expect(socket.destroyed).toBe(true);
  }, 3500);
});
