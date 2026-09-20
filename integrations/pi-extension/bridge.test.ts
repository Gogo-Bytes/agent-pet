import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import extension from './index.js';
import { PiBridgeAdapter } from '../../packages/adapter-pi/src/index.js';
import { createApplication } from '../../packages/application/src/index.js';

it('projects actual extension messages over a socket into a working then completed bubble', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pet-'));
  const endpoint = process.platform === 'win32'
    ? `\\\\.\\pipe\\pet-test-${process.pid}-${Date.now()}` : join(directory, 'pi.sock');
  vi.stubEnv('AGENT_PET_PI_ENDPOINT', endpoint);
  vi.stubEnv('AGENT_PET_PI_TOKEN', 'test-only-token-123456789');
  const app = createApplication([]);
  const handle = await new PiBridgeAdapter().start({ endpoint, token: 'test-only-token-123456789' }, {
    publish: observation => app.observe(observation), connectionChanged() {},
  });
  type Api = Parameters<typeof extension>[0];
  type Handler = Parameters<Api['on']>[1];
  const handlers = new Map<string, Handler>();
  const ctx = {
    cwd: '/test/project', mode: 'tui', isIdle: () => true,
    sessionManager: { getSessionId: () => 'session', getSessionName: () => 'Test session' },
  };
  try {
    extension({ on: (event, handler) => { handlers.set(event, handler); } });
    handlers.get('session_start')!({}, ctx);
    await vi.waitFor(() => expect(Object.keys(app.snapshot().sessions)).toHaveLength(1));
    handlers.get('agent_start')!({}, ctx);
    await vi.waitFor(() => expect(app.snapshot().bubbles[0]?.status).toBe('working'));
    handlers.get('message_end')!({ message: { role: 'assistant', stopReason: 'stop' } }, ctx);
    handlers.get('agent_settled')!({}, ctx);
    await vi.waitFor(() => expect(app.snapshot().bubbles[0]?.status).toBe('completed-unread'));
    expect(app.snapshot().bubbles[0]?.name).toBe('Test session');
    const id = app.snapshot().bubbles[0]!.sessionId;
    await app.acknowledgeAndOpen({ provider: 'pi', sessionId: id });
    handlers.get('session_info_changed')!({ name: 'Renamed' }, ctx);
    await vi.waitFor(() => expect(app.snapshot().sessions[id]?.name).toBe('Renamed'));
    expect(app.snapshot().bubbles).toHaveLength(0);
    handlers.get('session_info_changed')!({ name: undefined }, ctx);
    await vi.waitFor(() => expect(app.snapshot().sessions[id]?.name).toBe('project'));
    expect(app.snapshot().bubbles).toHaveLength(0);
    handlers.get('agent_start')!({}, ctx);
    await vi.waitFor(() => expect(app.snapshot().bubbles[0]?.status).toBe('working'));
    handlers.get('message_end')!({ message: { role: 'assistant', stopReason: 'aborted' } }, ctx);
    handlers.get('agent_settled')!({}, ctx);
    await vi.waitFor(() => expect(app.snapshot().sessions[id]?.status).toBe('idle'));
    expect(app.snapshot().bubbles).toHaveLength(0);
  } finally {
    handlers.get('session_shutdown')?.({}, ctx);
    await handle.stop();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
