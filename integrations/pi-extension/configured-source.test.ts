import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { renderConfiguredPiExtension } from './configured-source.js';
import { PiBridgeAdapter } from '../../packages/adapter-pi/src/index.js';
import { createApplication } from '../../packages/application/src/index.js';

// Synthetic pi surface only. The child imports the deployed artifact, not the workspace.
const runner = `
import extension from './extension.mts';
const handlers = new Map();
const ctx = { cwd: '/synthetic/project', mode: 'tui', isIdle: () => true,
  sessionManager: { getSessionId: () => 'configured-session', getSessionName: () => 'Temporary target' } };
extension({ on: (event, handler) => handlers.set(event, handler) });
process.on('message', ({ event, payload = {} }) => {
  if (event === 'detach-harness') { process.disconnect(); return; }
  const start = performance.now();
  const result = handlers.get(event)(payload, ctx);
  process.send({ kind: 'callback', synchronous: result === undefined, elapsed: performance.now() - start });
});
process.send({ kind: 'ready', count: handlers.size,
  cleanEnv: process.env.AGENT_PET_PI_ENDPOINT === undefined && process.env.AGENT_PET_PI_TOKEN === undefined });
`;

type Reply = { kind: string; count?: number; cleanEnv?: boolean; synchronous?: boolean; elapsed?: number };

function reply(child: ChildProcess): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    const onMessage = (message: Reply) => { cleanup(); resolve(message); };
    const onExit = () => { cleanup(); reject(new Error('Fixture child exited before reply')); };
    const onError = () => { cleanup(); reject(new Error('Fixture child failed to start')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Fixture child reply timed out')); }, 3000);
    child.once('message', onMessage);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function callback(child: ChildProcess, event: string, payload = {}): Promise<void> {
  const received = reply(child);
  child.send({ event, payload });
  const result = await received;
  expect(result.kind).toBe('callback');
  expect(result.synchronous).toBe(true);
  expect(result.elapsed).toBeLessThan(500);
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'pet-cfg-'));
  const endpoint = process.platform === 'win32'
    ? `\\\\.\\pipe\\pet-cfg-${process.pid}-${Date.now()}` : join(directory, 'p".sock');
  // Deliberately source-shaped synthetic data, including replacement metacharacters.
  const token = 'fixture-only-";throw new Error("executed");// $& ` \\ \n \u2028\u2029 end';
  let child: ChildProcess | undefined;
  let closed: Promise<unknown> | undefined;
  try {
    const source = await renderConfiguredPiExtension({ endpoint, token });
    const extensionPath = join(directory, 'extension.mts');
    await writeFile(extensionPath, source, { flag: 'wx', mode: 0o600 });
    await writeFile(join(directory, 'runner.mjs'), runner, { flag: 'wx', mode: 0o600 });
    return {
      directory, endpoint, token, source, extensionPath,
      async start() {
        child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'runner.mjs'], {
          cwd: directory, env: {}, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        });
        // Observe settlement immediately; teardown never removes a live child's root.
        closed = new Promise<void>(resolve => child!.once('close', () => resolve()));
        const ready = await reply(child);
        expect(ready).toEqual({ kind: 'ready', count: 6, cleanEnv: true });
        return child;
      },
      async cleanup() {
        if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await closed;
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

it('renders only the fixed self-contained implementation and leaves placement to its caller', async () => {
  const target = await fixture();
  try {
    const original = await readFile(join(__dirname, 'index.ts'), 'utf8');
    const slot = 'undefined /* AGENT_PET_EXPLICIT_CONFIG */';
    const [before, after] = original.split(slot);
    expect(target.source.startsWith(before!)).toBe(true);
    expect(target.source.endsWith(after!)).toBe(true);
    const configLiteral = target.source.slice(before!.length, -after!.length);
    expect(JSON.parse(configLiteral)).toEqual({ endpoint: target.endpoint, token: target.token });
    expect([...target.source.matchAll(/from '([^']+)'/g)].map(match => match[1]))
      .toEqual(['node:net', 'node:crypto', 'node:path']);
    await expect(writeFile(target.extensionPath, 'unknown replacement', { flag: 'wx' }))
      .rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(target.extensionPath, 'utf8')).toBe(target.source);
  } finally {
    await target.cleanup();
  }
});

it.each([
  { endpoint: '', token: 'fixture-only-token' },
  { endpoint: 'bad\0endpoint', token: 'fixture-only-token' },
  { endpoint: 'unused', token: 'short' },
  { endpoint: 'unused', token: 'x'.repeat(257) },
])('rejects invalid explicit config without including its values in the error %#', async config => {
  await expect(renderConfiguredPiExtension(config)).rejects.toThrow(/^Invalid pi extension configuration$/);
});

it('runs the temporary configured extension without env through working, terminal, and ack states', async () => {
  const target = await fixture();
  const adapter = new PiBridgeAdapter();
  const app = createApplication([adapter]);
  let handle: Awaited<ReturnType<typeof adapter.start>> | undefined;
  try {
    handle = await adapter.start({ endpoint: target.endpoint, token: target.token }, {
      publish: observation => app.observe(observation), connectionChanged() {},
    });
    const child = await target.start();
    await callback(child, 'session_start');
    await vi.waitFor(() => expect(Object.keys(app.snapshot().sessions)).toHaveLength(1));
    const id = Object.keys(app.snapshot().sessions)[0]!;
    for (const [stopReason, status] of [['stop', 'completed-unread'], ['error', 'error-unread']]) {
      await callback(child, 'agent_start');
      await vi.waitFor(() => expect(app.snapshot().bubbles[0]?.status).toBe('working'));
      expect(await app.acknowledgeAndOpen({ provider: 'pi', sessionId: id })).toEqual({ status: 'unsupported' });
      expect(app.snapshot().bubbles[0]?.status).toBe('working');
      await callback(child, 'message_end', { message: { role: 'assistant', stopReason } });
      await callback(child, 'agent_settled');
      await vi.waitFor(() => expect(app.snapshot().bubbles[0]?.status).toBe(status));
      expect(app.snapshot().bubbles[0]?.name).toBe('Temporary target');
      expect(await app.acknowledgeAndOpen({ provider: 'pi', sessionId: id })).toEqual({ status: 'unsupported' });
      expect(app.snapshot().bubbles).toEqual([]);
      await callback(child, 'session_info_changed', { name: 'Temporary target' });
    }
    const serializedSnapshot = JSON.stringify(app.snapshot());
    for (const value of [target.token, target.endpoint]) {
      const escapedValue = JSON.stringify(value).slice(1, -1);
      // Positive control: the same check must detect the escaped fixture value.
      expect(JSON.stringify({ leaked: value }).includes(escapedValue)).toBe(true);
      expect(serializedSnapshot.includes(escapedValue)).toBe(false);
    }
    await callback(child, 'session_shutdown');
  } finally {
    try { await handle?.stop(); } finally { await target.cleanup(); }
  }
}, 10000);

it.each(['absent', 'detached'] as const)('does not block callbacks or keep a child alive with an %s bridge', async state => {
  const target = await fixture();
  const adapter = new PiBridgeAdapter();
  let handle: Awaited<ReturnType<typeof adapter.start>> | undefined;
  let connected = false;
  try {
    if (state === 'detached') {
      handle = await adapter.start({ endpoint: target.endpoint, token: target.token }, {
        publish() {}, connectionChanged: value => { if (value === 'connected') connected = true; },
      });
    }
    const child = await target.start();
    await callback(child, 'session_start');
    if (handle) {
      await vi.waitFor(() => expect(connected).toBe(true));
      await handle.stop();
      handle = undefined;
    }
    // Allow a failed connection and a retry while IPC alone keeps the fixture alive.
    await new Promise(resolve => setTimeout(resolve, 400));
    await callback(child, 'agent_start');
    await callback(child, 'message_end', { message: { role: 'assistant', stopReason: 'error' } });
    await callback(child, 'agent_settled');
    const exited = once(child, 'exit');
    child.send({ event: 'detach-harness' });
    // No session_shutdown: active retry/socket must not prevent a natural exit.
    await vi.waitFor(() => expect(child.exitCode).toBe(0), { timeout: 2000 });
    expect(await exited).toEqual([0, null]);
  } finally {
    try { await handle?.stop(); } finally { await target.cleanup(); }
  }
}, 10000);
