import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observeClaudeInvocation, type ClaudeInvocationPresence } from './launcher.js';
import { deliverClaudeHook } from './transport.js';

type Invocation = Awaited<ReturnType<typeof observeClaudeInvocation>>;
type Registration = { args: string[]; environment: Record<string, string>; };
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

// Only this generated Node fixture is launched. Its HTTP response controls its
// own natural exit; no Agent, config, user prompt or process signal is involved.
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'agent-pet-launcher-'));
  let response: http.ServerResponse | undefined;
  let register!: (value: Registration) => void;
  const registration = new Promise<Registration>(resolve => { register = resolve; });
  const server = http.createServer((request, res) => {
    let body = '';
    request.setEncoding('utf8'); request.on('data', chunk => { body += chunk; });
    request.on('end', () => { response = res; register(JSON.parse(body)); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const controlUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const file = join(directory, 'fixture.cjs');
  await writeFile(file, `
    const http = require('node:http');
    setTimeout(() => process.exit(82), 10000);
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('AGENT_PET_') || key === 'FIXTURE_KEEP'));
    const body = JSON.stringify({ args: process.argv.slice(2), environment });
    const request = http.request(process.env.FIXTURE_CONTROL_URL, { method:'POST', headers: { 'Content-Length': Buffer.byteLength(body) } }, response => {
      let code = ''; response.on('data', chunk => { code += chunk; });
      response.on('end', () => process.exit(Number(code)));
    });
    request.on('error', () => process.exit(81)); request.end(body);
  `);
  const invocations: Invocation[] = [];
  cleanup.push(async () => {
    response?.end('0');
    await Promise.all(invocations.map(invocation => invocation.completed));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  return {
    directory,
    async start(onPresence: (event: ClaudeInvocationPresence) => undefined = () => {}, args: string[] = [], environment = {}) {
      const invocation = await observeClaudeInvocation({ command: process.execPath, args: [file, ...args],
        pluginDirectory: join(directory, "plugin with ' quote"), environment: { FIXTURE_CONTROL_URL: controlUrl,
          FIXTURE_KEEP: 'preserved', AGENT_PET_MAIN_CONTROL_SECRET: 'not-for-child', AGENT_PET_PI_TOKEN: 'not-for-child',
          AGENT_PET_CLAUDE_TOKEN: 'stale-hook-token', AGENT_PET_FUTURE_KEY: 'not-for-child', ...environment }, onPresence });
      invocations.push(invocation);
      const registered = await registration;
      return { invocation, registered,
        exit: async (code = 0) => { response!.end(String(code)); return invocation.completed; } };
    },
  };
}
function sender(registered: Registration) {
  const environment = registered.environment;
  return (event: string, fields = {}, overrides = {}) => deliverClaudeHook({
    url: environment.AGENT_PET_CLAUDE_URL!, token: environment.AGENT_PET_CLAUDE_TOKEN!, runId: environment.AGENT_PET_CLAUDE_RUN_ID!,
    input: JSON.stringify({ session_id: 'fixture-session', hook_event_name: event, ...fields }), ...overrides,
  });
}

describe('explicit terminal invocation presence (own Node fixtures only)', () => {
  it('preserves argv and ordinary environment, removes every inherited Agent Pet key, and never exposes credentials in results', async () => {
    const own = await fixture(), events: ClaudeInvocationPresence[] = [];
    const userArgs = ['--some-flag', 'value with spaces', '--', 'literal;$(nothing)`text`'];
    const { invocation, registered, exit } = await own.start(event => { events.push(event); }, userArgs);
    expect(registered.args).toEqual(['--some-flag', 'value with spaces', '--plugin-dir', join(own.directory, "plugin with ' quote"), '--', 'literal;$(nothing)`text`']);
    expect(registered.environment.FIXTURE_KEEP).toBe('preserved');
    expect(Object.keys(registered.environment).filter(key => key.startsWith('AGENT_PET_')).sort()).toEqual([
      'AGENT_PET_CLAUDE_RUN_ID', 'AGENT_PET_CLAUDE_TOKEN', 'AGENT_PET_CLAUDE_URL',
    ]);
    expect(registered.environment.AGENT_PET_CLAUDE_TOKEN).toMatch(/^[0-9a-f]{64}$/);
    expect(registered.environment.AGENT_PET_CLAUDE_TOKEN).not.toBe('stale-hook-token');
    expect(events).toEqual([{ runId: invocation.runId, kind: 'child-started' }]);
    const result = await exit(7);
    expect(result).toEqual({ runId: invocation.runId, outcome: 'child-ended', observation: 'closed' });
    expect(events).toEqual([{ runId: invocation.runId, kind: 'child-started' }, { runId: invocation.runId, kind: 'child-ended' }]);
    expect(JSON.stringify({ events, result })).not.toMatch(/not-for-child|stale-hook|Bearer|token|url|exitCode|success/);
    expect(Object.keys(invocation).sort()).toEqual(['completed', 'runId', 'stopObserving']);
  });

  it('requires an authenticated validated root SessionStart, once, while the direct child lives', async () => {
    const own = await fixture(), events: ClaudeInvocationPresence[] = [];
    const { invocation, registered, exit } = await own.start(event => { events.push(event); });
    const send = sender(registered);
    expect(await send('SessionStart', { source: 'startup' }, { token: 'b'.repeat(64) })).toBe('unavailable');
    expect(await send('SessionStart', { source: 'unknown' })).toBe('invalid');
    expect(await send('SessionStart', { source: 'startup', agent_id: 'subagent' })).toBe('delivered');
    expect(await send('UserPromptSubmit')).toBe('delivered');
    expect(await send('SessionEnd')).toBe('delivered');
    expect(await send('Stop', { stop_hook_active: false })).toBe('delivered');
    expect(events.map(event => event.kind)).toEqual(['child-started']);
    expect(await send('SessionStart', { source: 'clear' })).toBe('delivered');
    expect(await send('SessionStart', { source: 'resume' })).toBe('delivered');
    expect(await send('SessionEnd')).toBe('delivered');
    expect(events).toEqual([{ runId: invocation.runId, kind: 'child-started' }, { runId: invocation.runId, kind: 'hook-observed' }]);
    await exit();
    expect(await send('SessionStart', { source: 'startup' })).toBe('unavailable');
    expect(events.at(-1)).toEqual({ runId: invocation.runId, kind: 'child-ended' });
  });

  it('keeps simultaneous invocations distinct and an event credential cannot register another run', async () => {
    const first = await fixture(), second = await fixture();
    const aEvents = vi.fn(), bEvents = vi.fn();
    const [a, b] = await Promise.all([first.start(aEvents), second.start(bEvents)]);
    expect(a.invocation.runId).not.toBe(b.invocation.runId);
    expect(a.registered.environment.AGENT_PET_CLAUDE_TOKEN).not.toBe(b.registered.environment.AGENT_PET_CLAUDE_TOKEN);
    expect(a.registered.environment.AGENT_PET_CLAUDE_URL).not.toBe(b.registered.environment.AGENT_PET_CLAUDE_URL);
    const send = sender(a.registered);
    expect(await send('SessionStart', { source: 'startup' }, { runId: randomUUID() })).toBe('unavailable');
    expect(await send('SessionStart', { source: 'startup' }, { runId: b.invocation.runId })).toBe('unavailable');
    expect(await send('SessionStart', { source: 'startup' }, { url: b.registered.environment.AGENT_PET_CLAUDE_URL })).toBe('unavailable');
    expect(aEvents).toHaveBeenCalledTimes(1); expect(bEvents).toHaveBeenCalledTimes(1);
    expect(await send('SessionStart', { source: 'startup' })).toBe('delivered');
    await a.exit();
    expect(bEvents).toHaveBeenCalledTimes(1);
    expect(await sender(b.registered)('SessionStart', { source: 'startup' })).toBe('delivered');
    await b.exit();
  });

  it('does not confuse a short-lived hook client exit with the bound child lifetime', async () => {
    const own = await fixture(), events = vi.fn();
    const { registered, exit } = await own.start(events);
    const body = JSON.stringify({ schemaVersion: 1, runId: registered.environment.AGENT_PET_CLAUDE_RUN_ID, eventId: randomUUID(),
      fact: { providerSessionId: 'fixture-session', kind: 'session-started', source: 'startup' } });
    const hook = spawn(process.execPath, ['-e', `
      const http = require('node:http'); const body = process.env.FIXTURE_BODY;
      const request = http.request(process.env.AGENT_PET_CLAUDE_URL, { method:'POST', headers: { Authorization:'Bearer ' + process.env.AGENT_PET_CLAUDE_TOKEN, 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(body) } }, response => { response.resume(); response.on('end', () => process.exit(response.statusCode === 204 ? 0 : 1)); });
      request.on('error', () => process.exit(2)); request.end(body);
    `], { env: { ...registered.environment, FIXTURE_BODY: body }, stdio: 'ignore' });
    expect(await once(hook, 'exit')).toEqual([0, null]);
    expect(events.mock.calls.map(call => call[0].kind)).toEqual(['child-started', 'hook-observed']);
    expect(await sender(registered)('SessionEnd')).toBe('delivered');
    expect(events).toHaveBeenCalledTimes(2);
    await exit();
    expect(events.mock.calls.map(call => call[0].kind)).toEqual(['child-started', 'hook-observed', 'child-ended']);
  });

  it('retires partial deliveries and shuts the receiver on actual exit without inventing hook presence', async () => {
    const own = await fixture(), events = vi.fn();
    const { registered, exit } = await own.start(events);
    const url = new URL(registered.environment.AGENT_PET_CLAUDE_URL!);
    const peer = net.connect(Number(url.port), url.hostname); peer.on('error', () => {});
    await once(peer, 'connect');
    peer.write(`POST /claude-hooks HTTP/1.1\r\nHost: ${url.host}\r\nContent-Length: 500\r\n`);
    const closed = once(peer, 'close');
    await exit(); await closed;
    expect(events.mock.calls.map(call => call[0].kind)).toEqual(['child-started', 'child-ended']);
    expect(await sender(registered)('SessionStart', { source: 'startup' })).toBe('unavailable');
  });

  it('reports failed spawn with fixed enums and closes without a child-started claim', async () => {
    const events = vi.fn();
    const invocation = await observeClaudeInvocation({ command: '/agent-pet-own-missing-fixture/absent', args: [],
      pluginDirectory: '/agent-pet-own-fixture-plugin', environment: {}, onPresence: events });
    expect(await invocation.completed).toEqual({ runId: invocation.runId, outcome: 'spawn-failed', observation: 'closed' });
    expect(events.mock.calls).toEqual([[{ runId: invocation.runId, kind: 'child-ended' }]]);
    await invocation.stopObserving();
  });

  it('disconnects observation idempotently while leaving the real child running to its own exit', async () => {
    const own = await fixture(), events = vi.fn();
    const { invocation, registered, exit } = await own.start(events);
    const first = invocation.stopObserving(), second = invocation.stopObserving();
    expect(first).toBe(second); await first;
    expect(await sender(registered)('SessionStart', { source: 'startup' })).toBe('unavailable');
    let ended = false; void invocation.completed.then(() => { ended = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(ended).toBe(false); expect(events).toHaveBeenCalledTimes(1);
    expect((await exit()).outcome).toBe('child-ended');
  });

  it.each(['throw', 'reject'] as const)('contains a %s reporting failure without killing or controlling the child', async failure => {
    const own = await fixture(), events: ClaudeInvocationPresence[] = [];
    const callback = (event: ClaudeInvocationPresence): undefined => {
      events.push(event);
      if (event.kind !== 'hook-observed') return;
      if (failure === 'throw') throw new Error('PRIVATE REPORT ERROR');
      // @ts-expect-error A JS callback may violate the synchronous contract.
      return Promise.reject(new Error('PRIVATE REPORT ERROR'));
    };
    const { invocation, registered, exit } = await own.start(callback);
    await sender(registered)('SessionStart', { source: 'startup' });
    await invocation.stopObserving();
    expect(await sender(registered)('SessionStart', { source: 'startup' })).toBe('unavailable');
    let ended = false; void invocation.completed.then(() => { ended = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(ended).toBe(false);
    const result = await exit();
    expect(result).toEqual({ runId: invocation.runId, outcome: 'child-ended', observation: 'unavailable' });
    expect(events.map(event => event.kind)).toEqual(['child-started', 'hook-observed', 'child-ended']);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });

  it('contains reporting rejections at spawn and exit without delaying child lifetime cleanup', async () => {
    const own = await fixture(), events: ClaudeInvocationPresence[] = [];
    // @ts-expect-error A JS callback may reject at every lifecycle report.
    const { invocation, registered, exit } = await own.start(async event => {
      events.push(event); throw new Error('PRIVATE REPORT ERROR');
    });
    await invocation.stopObserving();
    expect(await sender(registered)('SessionStart', { source: 'startup' })).toBe('unavailable');
    expect(events.map(event => event.kind)).toEqual(['child-started']);
    expect(await exit()).toEqual({ runId: invocation.runId, outcome: 'child-ended', observation: 'unavailable' });
    expect(events.map(event => event.kind)).toEqual(['child-started', 'child-ended']);
  });

  it('rejects invalid invocation configuration with a fixed error before starting a child', async () => {
    const onPresence = vi.fn();
    await expect(observeClaudeInvocation({ command: 'relative', args: [], pluginDirectory: '/fixture', onPresence }))
      .rejects.toThrow('Invalid Claude invocation configuration');
    expect(onPresence).not.toHaveBeenCalled();
  });
});
