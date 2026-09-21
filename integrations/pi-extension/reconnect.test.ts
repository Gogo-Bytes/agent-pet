import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import extension from './index.js';
import { PiBridgeAdapter } from '../../packages/adapter-pi/src/index.js';
import { createApplication } from '../../packages/application/src/index.js';

it('reconnects a running extension after the desktop bridge restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pet-reconnect-'));
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\pet-reconnect-${process.pid}` : join(directory, 'p.sock');
  const token = 'test-only-token-123456789';
  vi.stubEnv('AGENT_PET_PI_ENDPOINT', endpoint);
  vi.stubEnv('AGENT_PET_PI_TOKEN', token);
  type Handler = Parameters<Parameters<typeof extension>[0]['on']>[1];
  const handlers = new Map<string, Handler>();
  const context = { cwd: '/test/project', mode: 'tui', isIdle: () => true,
    sessionManager: { getSessionId: () => 'existing-session' } };
  let application = createApplication([]);
  let disconnected = false;
  const adapter = new PiBridgeAdapter();
  const start = () => adapter.start({ endpoint, token }, {
    publish: value => application.observe(value),
    connectionChanged: state => { if (state === 'disconnected') disconnected = true; },
  });
  let handle = await start();
  try {
    extension({ on: (name, handler) => { handlers.set(name, handler); } });
    handlers.get('session_start')!({}, context);
    await vi.waitFor(() => expect(Object.keys(application.snapshot().sessions)).toHaveLength(1));
    await handle.stop();
    await vi.waitFor(() => expect(disconnected).toBe(true));
    application = createApplication([]);
    handle = await start();
    handlers.get('agent_start')!({}, context);
    await vi.waitFor(() => expect(application.snapshot().bubbles[0]?.status).toBe('working'), { timeout: 3000 });
    handlers.get('message_end')!({ message: { role: 'assistant', stopReason: 'stop' } }, context);
    handlers.get('agent_settled')!({}, context);
    await vi.waitFor(() => expect(application.snapshot().bubbles[0]?.status).toBe('completed-unread'));
  } finally {
    handlers.get('session_shutdown')?.({}, context);
    await handle.stop();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});

it.each([
  ['stop', 'completed-unread'],
  ['error', 'error-unread'],
] as const)('does not replay a settled %s result as unread after bridge restart', async (stopReason, status) => {
  const directory = await mkdtemp(join(tmpdir(), 'pet-terminal-reconnect-'));
  const endpoint = process.platform === 'win32'
    ? `\\\\.\\pipe\\pet-terminal-reconnect-${process.pid}-${stopReason}` : join(directory, 'p.sock');
  const token = 'test-only-token-123456789';
  vi.stubEnv('AGENT_PET_PI_ENDPOINT', endpoint);
  vi.stubEnv('AGENT_PET_PI_TOKEN', token);
  type Handler = Parameters<Parameters<typeof extension>[0]['on']>[1];
  const handlers = new Map<string, Handler>();
  const context = { cwd: '/test/project', mode: 'tui', isIdle: () => true,
    sessionManager: { getSessionId: () => 'terminal-session' } };
  let application = createApplication([]);
  const adapter = new PiBridgeAdapter();
  const start = () => adapter.start({ endpoint, token }, {
    publish: value => application.observe(value), connectionChanged() {},
  });
  let handle = await start();
  try {
    extension({ on: (name, handler) => { handlers.set(name, handler); } });
    handlers.get('session_start')!({}, context);
    await vi.waitFor(() => expect(Object.keys(application.snapshot().sessions)).toHaveLength(1));
    handlers.get('agent_start')!({}, context);
    await vi.waitFor(() => expect(application.snapshot().bubbles[0]?.status).toBe('working'));
    handlers.get('message_end')!({ message: { role: 'assistant', stopReason } }, context);
    handlers.get('agent_settled')!({}, context);
    await vi.waitFor(() => expect(application.snapshot().bubbles[0]?.status).toBe(status));
    const sessionId = application.snapshot().bubbles[0]!.sessionId;
    const workId = application.snapshot().sessions[sessionId]!.workId;
    expect(workId).toBeDefined();

    await handle.stop();
    application = createApplication([]);
    const observedBubbles: string[] = [];
    const unsubscribe = application.subscribe(state => {
      observedBubbles.push(...state.bubbles.map(bubble => bubble.status));
    });
    try {
      handle = await start();
      // No new pi callbacks: the actual extension's retry/hello must reconnect.
      await vi.waitFor(() => expect(application.snapshot().sessions[sessionId]?.status).toBe('idle'), { timeout: 3000 });
      expect(application.snapshot().sessions[sessionId]?.workId).toBe(workId);
      expect(application.snapshot().bubbles).toEqual([]);
      expect(observedBubbles).toEqual([]);
    } finally {
      unsubscribe();
    }
  } finally {
    handlers.get('session_shutdown')?.({}, context);
    await handle.stop();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
