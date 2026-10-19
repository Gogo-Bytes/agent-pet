import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { deliverCodexHook, parseCodexDelivery, startCodexHookReceiver, MAX_CODEX_DELIVERY_BYTES, type CodexHookDelivery } from './transport.js';
const token = 'a'.repeat(64), runId = randomUUID();
const native = (event = 'UserPromptSubmit', fields = {}) => JSON.stringify({ session_id: 'private-session', turn_id: 'private-turn', hook_event_name: event, ...fields });
const wire = (extra = {}) => JSON.stringify({ schemaVersion: 1, runId, eventId: randomUUID(),
  fact: { kind: 'turn-submitted', providerSessionId: 's', turnId: 't' }, ...extra });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(fn => fn())); });
async function receiver(onFact: (delivery: CodexHookDelivery) => undefined = () => undefined, acceptRun = (id: string) => id === runId) {
  const server = await startCodexHookReceiver({ token, acceptRun, onFact }); cleanups.push(server.stop); return server;
}
async function request(url: string, body: string, headers = {}, method = 'POST') {
  return new Promise<number>((resolve, reject) => {
    const req = http.request(url, { method, agent: false, headers: { Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers } }, res => { res.resume(); resolve(res.statusCode!); });
    req.on('error', reject); req.end(body);
  });
}
const send = (url: string, input = native(), extra = {}) => deliverCodexHook({ url, input, token, runId, ...extra });
it('roundtrips all facts using the Codex route and strips native content', async () => {
  const received: CodexHookDelivery[] = []; const r = await receiver(value => { received.push(value); });
  const tool = { tool_name: 'Bash', tool_use_id: 'tool' };
  const inputs = [native('SessionStart', { source: 'fork' }), native(), native('PreToolUse', tool),
    native('PostToolUse', { ...tool, tool_input: 'SECRET', tool_response: 'SECRET', cwd: 'SECRET' }),
    native('PermissionRequest', { tool_name: 'Bash' }), native('Stop', { stop_hook_active: false }),
    native('Interrupt'), native('PreCompact', { trigger: 'manual' }), native('PostCompact', { trigger: 'auto' }),
    native('SessionEnd', { reason: 'other' })];
  for (const input of inputs) expect(await send(r.url, input)).toBe('delivered');
  expect(received.map(d => d.fact.kind)).toEqual(['session-started', 'turn-submitted', 'tool-requested', 'tool-returned',
    'approval-check', 'stop-requested', 'turn-interrupted', 'compact-requested', 'compact-finished', 'session-ended']);
  expect(JSON.stringify(received)).not.toMatch(/SECRET|tool_response|tool_input|token/);
});
it('validates both the envelope and event-specific metadata without coercion', () => {
  expect(parseCodexDelivery(wire())).toBeDefined();
  for (const extra of [{ raw: 'SECRET' }, { schemaVersion: 2 }, { eventId: '' }, { runId: '' },
    { fact: { kind: 'turn-submitted', providerSessionId: 's' } },
    { fact: { kind: 'session-started', providerSessionId: 's', source: ['startup'] } },
    { fact: { kind: 'stop-requested', providerSessionId: 's', turnId: 't', alreadyContinued: 'false' } },
    { fact: { kind: 'tool-returned', providerSessionId: 's', turnId: 't', toolCallId: 'c', activity: 'reading' } },
    { fact: { kind: 'compact-finished', providerSessionId: 's', turnId: 't', trigger: 'future' } },
    { fact: { kind: 'turn-submitted', providerSessionId: 's', turnId: 't', prompt: 'SECRET' } }])
    expect(parseCodexDelivery(wire(extra))).toBeUndefined();
  for (const input of ['null', '[]', '{', ' '.repeat(MAX_CODEX_DELIVERY_BYTES + 1)]) expect(parseCodexDelivery(input)).toBeUndefined();
});
it('requires token, exact authority/route/type and independent live run binding', async () => {
  const observed = vi.fn(), r = await receiver(observed);
  for (const [headers, code] of [[{ Authorization: 'Bearer wrong' }, 401], [{ Origin: 'http://localhost' }, 400],
    [{ Host: 'other.local' }, 400], [{ 'Content-Type': 'text/plain' }, 400]] as const)
    expect(await request(r.url, wire(), headers)).toBe(code);
  expect(await request(r.url, wire(), {}, 'GET')).toBe(400);
  expect(await request(r.url.replace('/codex-hooks', '/claude-hooks'), wire())).toBe(400);
  expect(await request(r.url, wire({ runId: randomUUID() }))).toBe(403);
  expect(await request(r.url, 'x'.repeat(MAX_CODEX_DELIVERY_BYTES + 1))).toBe(413);
  expect(observed).not.toHaveBeenCalled();
});
it('deduplicates deliveries, checks retirement before duplicates, and does not remember sink failures', async () => {
  let live = true; const observed = vi.fn().mockImplementationOnce(() => { throw new Error('SECRET'); });
  const r = await receiver(observed, () => live), eventId = randomUUID();
  expect(await send(r.url, native(), { eventId })).toBe('unavailable');
  expect(await send(r.url, native(), { eventId })).toBe('delivered');
  expect(await send(r.url, native(), { eventId })).toBe('delivered'); expect(observed).toHaveBeenCalledTimes(2);
  live = false; expect(await send(r.url, native(), { eventId })).toBe('unavailable');
});
it('refuses async binding/sink callbacks and consumes their rejection', async () => {
  const called = vi.fn();
  // @ts-expect-error Exercise JS contract violation.
  const r = await receiver(called, async () => { throw new Error('SECRET'); });
  expect(await send(r.url)).toBe('unavailable'); expect(called).not.toHaveBeenCalled();
  // @ts-expect-error Exercise JS contract violation.
  const s = await receiver(async () => { throw new Error('SECRET'); });
  expect(await send(s.url)).toBe('unavailable');
});
it('handles shutdown reentry and cleans partial peers without publishing disconnect facts', async () => {
  const called = vi.fn(); let r: Awaited<ReturnType<typeof receiver>>;
  r = await receiver(called, () => { void r.stop(); return true; });
  expect(await send(r.url)).toBe('unavailable'); expect(called).not.toHaveBeenCalled();
  const s = await receiver(called), url = new URL(s.url);
  const peer = net.connect(Number(url.port), url.hostname); peer.on('error', () => {}); await once(peer, 'connect');
  peer.write('POST /codex-hooks HTTP/1.1\r\n'); const first = s.stop(); expect(s.stop()).toBe(first); await first;
  expect(await send(s.url)).toBe('unavailable'); peer.destroy(); expect(called).not.toHaveBeenCalled();
});
it('keeps ignored/invalid inputs and unreachable receivers silent', async () => {
  const called = vi.fn(), r = await receiver(called);
  expect(await send(r.url, native('SubagentStop'))).toBe('ignored');
  expect(await send(r.url, '{')).toBe('invalid');
  expect(await send('https://example.com/codex-hooks')).toBe('invalid');
  expect(await send(r.url + '?secret=x')).toBe('invalid');
  await r.stop(); expect(await send(r.url)).toBe('unavailable'); expect(called).not.toHaveBeenCalled();
});
