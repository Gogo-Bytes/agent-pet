import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import extension from './index.js';
import { PiBridgeAdapter } from '../../packages/adapter-pi/src/index.js';
import { createApplication } from '../../packages/application/src/index.js';
import { projectPetPresentation } from '../../packages/pet-runtime/src/presentation.js';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs(); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'pet-activity-'));
  const endpoint = join(root, 'p.sock'), token = 'isolated-activity-token';
  vi.stubEnv('AGENT_PET_PI_ENDPOINT', endpoint); vi.stubEnv('AGENT_PET_PI_TOKEN', token);
  const app = createApplication([]), adapter = new PiBridgeAdapter();
  const start = () => adapter.start({ endpoint, token }, { publish: value => app.observe(value), connectionChanged() {} });
  let handle = await start();
  type Handler = Parameters<Parameters<typeof extension>[0]['on']>[1];
  const handlers = new Map<string, Handler>();
  let idle = true;
  const ctx = { cwd: '/fixture/project', mode: 'tui', isIdle: () => idle, sessionManager: { getSessionId: () => 'activities' } };
  extension({ on: (name, handler) => handlers.set(name, handler) });
  const emit = (name: string, event: unknown = {}) => handlers.get(name)!(event, ctx);
  cleanups.push(async () => { emit('session_shutdown'); await handle.stop(); await rm(root, { recursive: true, force: true }); });
  emit('session_start');
  await vi.waitFor(() => expect(Object.keys(app.snapshot().sessions)).toHaveLength(1));
  const record = () => Object.values(app.snapshot().sessions)[0]!;
  const motion = () => projectPetPresentation(app.snapshot());
  const expectAction = (action: string) => vi.waitFor(() => expect(motion().action).toBe(action));
  return { app, emit, record, motion, expectAction, idle: (value: boolean) => { idle = value; },
    async restart() { await handle.stop(); handle = await start(); await vi.waitFor(() => expect(record().connected).toBe(true)); },
    stop: () => handle.stop(),
  };
}
it('observes stream phases, parallel tools and waiting without changing the working lifecycle or reading bodies', async () => {
  const t = await setup(); t.idle(false); t.emit('agent_start'); await t.expectAction('working');
  expect(t.record().capabilities?.thinking).toBe('unknown');
  expect(t.record().capabilities?.retrying).toBe('unknown');
  const work = t.record().workId;
  const noBody = { type: 'thinking_start', contentIndex: 0, get delta() { throw Error('must not read body'); }, get partial() { throw Error('must not read partial'); } };
  t.emit('message_update', { assistantMessageEvent: noBody }); await t.expectAction('thinking'); expect(t.record().capabilities?.thinking).toBe('supported');
  t.emit('message_update', { assistantMessageEvent: { type: 'thinking_end', contentIndex: 0 } });
  t.emit('message_update', { assistantMessageEvent: { type: 'text_start', contentIndex: 1 } }); await t.expectAction('responding');
  t.emit('tool_execution_start', { toolCallId: 'one', toolName: 'read', get args() { throw Error('must not read args'); } }); await t.expectAction('reading');
  t.emit('tool_execution_start', { toolCallId: 'two', toolName: 'bash' }); await t.expectAction('executing');
  t.emit('ui_prompt_start', { get title() { throw Error('must not read prompt'); } }); await t.expectAction('waiting_input');
  expect(t.record().status).toBe('working'); expect(t.app.snapshot().bubbles[0]?.status).toBe('working');
  t.emit('ui_prompt_end'); await t.expectAction('executing');
  t.emit('tool_execution_end', { toolCallId: 'two', isError: false }); await t.expectAction('reading');
  t.emit('tool_execution_end', { toolCallId: 'one', isError: true, get result() { throw Error('must not read result'); } }); await t.expectAction('tool_error');
  expect(t.motion().restAction).toBe('responding'); expect(t.record().status).toBe('working');
  const replay = t.motion().replay; t.emit('session_info_changed', { name: 'renamed' });
  await vi.waitFor(() => expect(t.record().name).toBe('renamed')); expect(t.motion().replay).toBe(replay);
  t.emit('agent_start'); await t.expectAction('working'); expect(t.record().workId).toBe(work);
  t.emit('tool_execution_start', { toolCallId: 'unknown', toolName: 'unrecognized' }); await t.expectAction('working');
  t.emit('message_end', { message: { role: 'assistant', stopReason: 'stop' } });
  t.emit('agent_settled'); await t.expectAction('working'); // ctx is not idle: no premature result
  t.idle(true); t.emit('agent_settled'); await t.expectAction('success');
  expect(t.record().facts?.activities).toEqual([]);
});
it.each(['aborted', 'length', 'error'] as const)('settles %s and ignores late wait/tool/stream endings', async reason => {
  const t = await setup(); t.emit('agent_start'); await t.expectAction('working');
  t.emit('ui_prompt_start'); await t.expectAction('waiting_input');
  t.emit('message_end', { message: { role: 'assistant', stopReason: reason } }); t.emit('agent_settled');
  await t.expectAction(reason === 'aborted' ? 'cancelled' : reason === 'length' ? 'output_limited' : 'error');
  expect(t.record().status).toBe(reason === 'aborted' ? 'idle' : 'error');
  t.emit('ui_prompt_end'); t.emit('tool_execution_end', { toolCallId: 'absent', isError: true });
  t.emit('message_update', { assistantMessageEvent: { type: 'thinking_start', contentIndex: 0 } });
  expect(t.record().facts).toMatchObject({ activities: [], waitingForInput: false });
  const work = t.record().workId; t.emit('agent_start'); await t.expectAction('working'); expect(t.record().workId).not.toBe(work);
});
it('compacts while idle, cancels safely and removes old signal listeners across sessions', async () => {
  const t = await setup(), first = new AbortController();
  t.emit('session_before_compact', { signal: first.signal }); await t.expectAction('compacting');
  expect(t.record().status).toBe('idle'); first.abort(); await t.expectAction('idle');
  const old = new AbortController(), current = new AbortController();
  t.emit('session_before_compact', { signal: old.signal }); await t.expectAction('compacting');
  t.emit('session_start'); await t.expectAction('idle');
  t.emit('session_before_compact', { signal: current.signal }); await t.expectAction('compacting');
  old.abort(); expect(t.motion().action).toBe('compacting');
  t.idle(false); t.emit('session_compact'); await t.expectAction('idle'); // callback is before pi clears its own busy flag
  t.emit('session_before_compact', { signal: new AbortController().signal }); await t.expectAction('compacting');
  t.emit('session_compact_failed', { aborted: true, willRetry: false, errorMessage: 'not transmitted' }); await t.expectAction('idle');
});
it('clears current activity on receiver stop, reconnects without event replay, and retains existing unread results', async () => {
  const t = await setup(); t.emit('agent_start'); await t.expectAction('working');
  t.emit('ui_prompt_start'); await t.expectAction('waiting_input');
  await t.stop(); expect(t.record().connected).toBe(false); expect(t.record().facts).toEqual({ activities: [], waitingForInput: false });
  expect(t.app.snapshot().bubbles).toEqual([]); await t.expectAction('idle');
  await t.restart(); await t.expectAction('waiting_input');
  t.emit('message_end', { message: { role: 'assistant', stopReason: 'stop' } }); t.emit('agent_settled'); await t.expectAction('success');
  const id = t.record().sessionId; await t.restart();
  expect(t.app.snapshot().bubbles[0]?.status).toBe('completed-unread'); expect(t.record().facts?.occurrence).toBeUndefined();
  t.emit('session_info_changed', { name: 'after reconnect' });
  await vi.waitFor(() => expect(t.record().name).toBe('after reconnect'));
  expect(t.app.snapshot().bubbles[0]?.status).toBe('completed-unread');
  await t.app.acknowledgeAndOpen({ provider: 'pi', sessionId: id }); await t.expectAction('idle');
  await t.restart(); expect(t.app.snapshot().bubbles).toEqual([]);
});
