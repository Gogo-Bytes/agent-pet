import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyObservation, createSessionState, type SessionObservation } from '../../packages/domain/src/index.js';
import { projectPetPresentation } from '../../packages/pet-runtime/src/presentation.js';
import { createCodexObservations, CODEX_FEEDBACK_MS } from './observations.js';
import type { CodexHookFact } from './normalize.js';
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
function fixture() {
  let state = createSessionState(); const events: SessionObservation[] = [];
  const mapper = createCodexObservations({ name: () => 'Codex', publish: event => { events.push(event); state = applyObservation(state, event); } });
  const send = (fact: CodexHookFact, runId = 'opaque-run') => mapper.accept({ runId, fact });
  const start = (s = 'private-session', run = 'opaque-run') => send({ kind: 'session-started', source: 'startup', providerSessionId: s }, run);
  const turn = (t = 'private-turn', s = 'private-session') => send({ kind: 'turn-submitted', turnId: t, providerSessionId: s });
  const tool = (id = 'private-tool', t = 'private-turn', activity: 'executing' | 'writing' | 'other' = 'executing', s = 'private-session') => send({
    kind: 'tool-returned', providerSessionId: s, turnId: t, toolCallId: id, activity });
  start(); return { mapper, send, start, turn, tool, events, state: () => state, last: () => events.at(-1)!, pet: () => projectPetPresentation(state) };
}
it('keeps native IDs private and neutral presence without fabricated task status', () => {
  const f = fixture(); f.turn();
  f.send({ kind: 'approval-check', providerSessionId: 'private-session', turnId: 'private-turn', activity: 'executing' });
  f.send({ kind: 'stop-requested', providerSessionId: 'private-session', turnId: 'private-turn', alreadyContinued: false });
  expect(f.last()).toMatchObject({ provider: 'codex', status: 'unknown', connected: true });
  expect(f.state().bubbles).toEqual([]); expect(f.pet().action).toBe('idle');
  expect(JSON.stringify(f.events)).not.toMatch(/private-session|private-turn|private-tool/);
});
it('shows brief tool-result feedback without claiming success or ongoing execution', () => {
  const f = fixture(); f.turn(); f.tool(); expect(f.pet().action).toBe('executing');
  expect(f.last().facts?.activities).toEqual([]); expect(f.last().capabilities?.executing).toBe('supported');
  const replay = f.pet().replay; f.tool(); expect(f.pet().replay).toBe(replay);
  vi.advanceTimersByTime(1000); f.tool('second', 'private-turn', 'writing'); expect(f.pet().action).toBe('writing');
  vi.advanceTimersByTime(1000); expect(f.pet().action).toBe('writing');
  vi.advanceTimersByTime(1000); expect(f.pet().action).toBe('idle'); expect(f.state().bubbles).toEqual([]);
});
it('shows explicit interrupt once and rejects all late results for that turn', () => {
  const f = fixture(); f.turn(); f.tool();
  const interrupt: CodexHookFact = { kind: 'turn-interrupted', providerSessionId: 'private-session', turnId: 'private-turn' };
  f.send(interrupt); const replay = f.pet().replay; expect(f.pet().action).toBe('cancelled');
  f.send(interrupt); f.tool('late'); expect(f.pet().replay).toBe(replay); expect(f.state().bubbles).toEqual([]);
  vi.advanceTimersByTime(CODEX_FEEDBACK_MS); expect(f.pet().action).toBe('idle');
  f.turn('new'); f.tool('next', 'new'); expect(f.pet().action).toBe('executing');
});
it('rejects child, unknown session, old turn and pre-submit results', () => {
  const f = fixture(); f.tool(); f.turn(); f.tool('wrong', 'old'); f.tool('unknown', 'private-turn', 'writing', 'unseen');
  f.send({ kind: 'turn-interrupted', providerSessionId: 'private-session', turnId: 'private-turn', childId: 'child' });
  expect(f.pet().action).toBe('idle'); f.turn('new'); const length = f.events.length;
  f.turn(); f.tool(); expect(f.events).toHaveLength(length);
});
it('keeps two sessions in the same host and same native ID in different hosts independent', () => {
  const f = fixture(); f.start('second'); f.start('private-session', 'other-run');
  expect(Object.values(f.state().sessions).filter(s => s.connected)).toHaveLength(3);
  expect(new Set(f.events.map(s => s.sessionId)).size).toBe(3);
  f.mapper.retire('opaque-run'); expect(Object.values(f.state().sessions).filter(s => s.connected)).toHaveLength(1);
  const length = f.events.length; f.start(); f.turn(); expect(f.events).toHaveLength(length);
});
it('session end clears feedback and cannot be resurrected by replayed startup', () => {
  const f = fixture(); f.turn(); f.tool(); f.send({ kind: 'session-ended', providerSessionId: 'private-session' });
  expect(f.last().connected).toBe(false); const length = f.events.length;
  f.start(); f.tool('late'); vi.advanceTimersByTime(3000); expect(f.events).toHaveLength(length); expect(vi.getTimerCount()).toBe(0);
});
it('bounds turn/tool tombstones without eviction accepting old events', () => {
  const f = fixture(); for (let i = 0; i < 257; i++) f.turn(`t${i}`);
  const length = f.events.length; f.turn(); f.tool(); expect(f.events).toHaveLength(length);
  const g = fixture(); g.turn(); for (let i = 0; i < 1025; i++) g.tool(`tool${i}`);
  const count = g.events.length; g.tool('tool0'); expect(g.events).toHaveLength(count); expect(g.pet().action).toBe('idle');
});
it('limits runs and sessions without retiring unrelated sessions', () => {
  const f = fixture(); for (let i = 0; i < 40; i++) f.start(`s${i}`);
  expect(Object.keys(f.state().sessions)).toHaveLength(32);
  for (let i = 0; i < 40; i++) f.start('same', `run${i}`);
  expect(new Set(f.events.map(e => e.processInstanceId)).size).toBe(32);
});
it('supports synchronous subscriber shutdown with no leaked timer or revival', () => {
  let mapper: ReturnType<typeof createCodexObservations>; const events: SessionObservation[] = [];
  mapper = createCodexObservations({ name: () => 'Codex', publish: value => {
    events.push(value); if (value.facts?.recentActivity) mapper.stop();
  } });
  mapper.accept({ runId: 'run', fact: { kind: 'session-started', providerSessionId: 's', source: 'startup' } });
  mapper.accept({ runId: 'run', fact: { kind: 'turn-submitted', providerSessionId: 's', turnId: 't' } });
  mapper.accept({ runId: 'run', fact: { kind: 'tool-returned', providerSessionId: 's', turnId: 't', toolCallId: 'c', activity: 'writing' } });
  expect(events.at(-1)?.connected).toBe(false); expect(vi.getTimerCount()).toBe(0);
  const length = events.length; mapper.stop(); vi.advanceTimersByTime(10000); expect(events).toHaveLength(length);
});

it('retirement before first hook prevents late startup from reviving a dead host', () => {
  const f = fixture(); f.mapper.retire('other-run'); const length = f.events.length;
  f.start('late', 'other-run'); expect(f.events).toHaveLength(length);
});

it.each(['stop', 'retire'] as const)('consumer failure cannot interrupt %s cleanup of other sessions', operation => {
  const events: SessionObservation[] = []; let failed = false;
  const mapper = createCodexObservations({ name: () => 'Codex', publish: event => {
    if (!event.connected && !failed) { failed = true; throw new Error('synthetic consumer failure'); }
    events.push(event);
  } });
  for (const providerSessionId of ['a', 'b']) {
    mapper.accept({ runId: 'run', fact: { kind: 'session-started', source: 'startup', providerSessionId } });
    mapper.accept({ runId: 'run', fact: { kind: 'turn-submitted', turnId: 't', providerSessionId } });
    mapper.accept({ runId: 'run', fact: { kind: 'tool-returned', toolCallId: 'c', activity: 'writing', turnId: 't', providerSessionId } });
  }
  expect(() => operation === 'stop' ? mapper.stop() : mapper.retire('run')).not.toThrow();
  expect(events.filter(e => !e.connected)).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  const length = events.length; vi.advanceTimersByTime(3000); expect(events).toHaveLength(length);
});
