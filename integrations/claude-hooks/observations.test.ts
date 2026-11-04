import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyObservation, createSessionState, acknowledgeBubble, type SessionObservation } from '../../packages/domain/src/index.js';
import { projectPetPresentation } from '../../packages/pet-runtime/src/presentation.js';
import { createClaudeObservations, CLAUDE_FEEDBACK_MS } from './observations.js';
import { normalizeClaudeHook, type ClaudeHookFact } from './normalize.js';
import { createApplication } from '../../packages/application/src/index.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
function fixture() {
  let state = createSessionState(); const observations: SessionObservation[] = [];
  const mapper = createClaudeObservations({ name: () => '我的 Claude', publish: observation => {
    observations.push(observation); state = applyObservation(state, observation);
  } });
  const send = (fact: Omit<ClaudeHookFact, 'providerSessionId'>, nativeId = 'private-session') =>
    mapper.accept({ runId: 'opaque-run', fact: { providerSessionId: nativeId, ...fact } as ClaudeHookFact });
  const fact = (value: ClaudeHookFact) => mapper.accept({ runId: 'opaque-run', fact: value });
  send({ kind: 'session-started', source: 'startup' } as ClaudeHookFact);
  const turn = (promptId = 'private-prompt') => fact({ kind: 'turn-submitted', providerSessionId: 'private-session', promptId });
  const tool = (kind: 'tool-succeeded' | 'tool-requested' = 'tool-succeeded', activity: 'reading' | 'writing' | 'executing' = 'reading', promptId = 'private-prompt', toolCallId = 'private-tool') => fact({ kind, activity, providerSessionId: 'private-session', promptId, toolCallId });
  return { mapper, send, fact, turn, tool, observations, state: () => state,
    last: () => observations.at(-1)!, presentation: () => projectPetPresentation(state) };
}
it('publishes neutral unknown presence with opaque identities and no fake working, success or input state', () => {
  const f = fixture(); expect(f.last()).toMatchObject({ provider: 'claude', status: 'unknown', connected: true, agentName: '我的 Claude' });
  expect(f.state().bubbles).toEqual([]); expect(f.presentation().action).toBe('idle');
  f.turn(); f.tool('tool-requested');
  for (const fact of [
    { kind: 'approval-check', activity: 'executing' }, { kind: 'permission-prompt' },
    { kind: 'compact-started' }, { kind: 'compact-finished' },
    { kind: 'response-stopped', continuedByHook: false, backgroundWork: false },
    { kind: 'response-stopped', continuedByHook: true, backgroundWork: true },
  ]) f.fact({ providerSessionId: 'private-session', promptId: 'private-prompt', ...fact } as ClaudeHookFact);
  expect(f.state().bubbles).toEqual([]); expect(f.presentation().action).toBe('idle');
  expect(JSON.stringify(f.observations)).not.toMatch(/private-session|private-prompt|private-tool/);
  expect(f.observations.every(item => item.status === 'unknown')).toBe(true);
});
it('observes a completed tool as brief recent feedback, never as continuously executing', () => {
  const f = fixture(); f.turn(); f.tool();
  expect(f.last().facts).toMatchObject({ activities: [], recentActivity: { kind: 'reading' } });
  expect(f.presentation().action).toBe('reading'); expect(f.last().capabilities?.reading).toBe('supported');
  const replay = f.presentation().replay;
  f.tool(); f.tool('tool-requested'); expect(f.presentation().replay).toBe(replay);
  vi.advanceTimersByTime(CLAUDE_FEEDBACK_MS - 1); expect(f.presentation().action).toBe('reading');
  vi.advanceTimersByTime(1); expect(f.presentation().action).toBe('idle'); expect(f.last().facts?.recentActivity).toBeUndefined();
  expect(f.state().bubbles).toEqual([]);
});
it('clears a previous feedback timer when another result arrives', () => {
  const f = fixture(); f.turn(); f.tool(); vi.advanceTimersByTime(1000);
  f.tool('tool-succeeded', 'writing', 'private-prompt', 'tool-2'); const replay = f.presentation().replay;
  vi.advanceTimersByTime(1000); expect(f.presentation()).toMatchObject({ action: 'writing', replay });
  vi.advanceTimersByTime(1000); expect(f.presentation().action).toBe('idle');
});
it.each([true, null] as const)('does not turn interrupted/unknown tool failure (%s) into task cancellation or error', interrupted => {
  const f = fixture(); f.turn(); f.fact({ kind: 'tool-failed', providerSessionId: 'private-session', promptId: 'private-prompt', toolCallId: 'tool', activity: 'executing', interrupted });
  expect(f.last().facts?.occurrence).toBeUndefined(); expect(f.state().bubbles).toEqual([]);
  expect(f.last().capabilities?.tool_error).toBeUndefined();
});
it('keeps tool errors separate from response failures and preserves acknowledged result identity', () => {
  const f = fixture(); f.turn(); f.fact({ kind: 'tool-failed', providerSessionId: 'private-session', promptId: 'private-prompt', toolCallId: 'tool', activity: 'executing', interrupted: false });
  expect(f.presentation().action).toBe('tool_error'); expect(f.state().bubbles).toEqual([]);
  f.fact({ kind: 'turn-failed', providerSessionId: 'private-session', promptId: 'private-prompt', failure: 'rate_limit' });
  const replay = f.presentation().replay; expect(f.state().bubbles[0]?.status).toBe('error-unread');
  f.fact({ kind: 'response-stopped', providerSessionId: 'private-session', promptId: 'private-prompt', continuedByHook: false, backgroundWork: null });
  f.tool(); expect(f.presentation().replay).toBe(replay);
  const state = acknowledgeBubble(f.state(), f.last().sessionId);
  expect(applyObservation(state, { ...f.last(), revision: f.last().revision! + 1, status: 'unknown' }).bubbles).toEqual([]);
  f.mapper.retire('opaque-run'); expect(f.last()).toMatchObject({ status: 'error', connected: false });
  expect(f.state().bubbles[0]?.status).toBe('error-unread');
});
it('never correlates a missing/unseen/old prompt or child fact to the current work', () => {
  const f = fixture(); f.tool(); f.turn(); f.tool('tool-succeeded', 'reading', 'old');
  f.fact({ kind: 'turn-failed', providerSessionId: 'private-session', failure: 'unknown' });
  f.fact({ kind: 'turn-submitted', providerSessionId: 'private-session', promptId: 'child-prompt', childId: 'child' });
  f.tool('tool-succeeded', 'reading', 'child-prompt'); expect(f.state().bubbles).toEqual([]);
  f.tool(); f.turn('new'); const length = f.observations.length;
  f.turn(); f.tool(); f.fact({ kind: 'turn-failed', providerSessionId: 'private-session', promptId: 'private-prompt', failure: 'unknown' });
  expect(f.observations).toHaveLength(length); expect(f.presentation().action).toBe('idle');
});
it('ignores duplicate/late SessionStart and never resurrects a retired native session', () => {
  const f = fixture(); f.turn(); f.tool(); const replay = f.presentation().replay;
  f.fact({ kind: 'session-started', providerSessionId: 'private-session', source: 'compact' });
  expect(f.presentation().replay).toBe(replay);
  f.fact({ kind: 'session-started', providerSessionId: 'second', source: 'clear' });
  expect(Object.values(f.state().sessions).map(item => item.connected)).toEqual([false, true]);
  f.fact({ kind: 'session-started', providerSessionId: 'private-session', source: 'resume' }); f.tool();
  vi.advanceTimersByTime(3000); expect(f.presentation().action).toBe('idle');
  expect(Object.keys(f.state().sessions)).toHaveLength(2);
});
it('SessionEnd and OS retirement clear feedback without claiming successful completion', () => {
  const f = fixture(); f.turn(); f.tool(); f.send({ kind: 'session-ended' }); f.tool('tool-succeeded', 'writing', 'private-prompt', 'late');
  expect(f.presentation().action).toBe('idle'); expect(f.last().connected).toBe(true);
  f.mapper.retire('opaque-run'); const length = f.observations.length; vi.advanceTimersByTime(4000);
  expect(f.last()).toMatchObject({ status: 'unknown', connected: false }); expect(f.observations).toHaveLength(length);
  expect(f.state().bubbles).toEqual([]);
});
it('stop releases timers, all sessions and rejects subsequent facts', () => {
  const f = fixture(); f.turn(); f.tool(); f.mapper.stop(); const length = f.observations.length;
  f.tool('tool-succeeded', 'writing', 'private-prompt', 'late'); f.mapper.stop(); vi.advanceTimersByTime(10000);
  expect(f.observations).toHaveLength(length); expect(vi.getTimerCount()).toBe(0); expect(f.last().connected).toBe(false);
});
it('bounds prompt and tool tombstones without evicting old identities and accepting their replay', () => {
  const f = fixture();
  for (let i = 0; i < 257; i++) f.turn(`prompt-${i}`);
  const length = f.observations.length; f.turn('private-prompt'); f.tool();
  expect(f.observations).toHaveLength(length); expect(f.presentation().action).toBe('idle');
  const g = fixture(); g.turn();
  for (let i = 0; i < 1025; i++) g.tool('tool-succeeded', 'reading', 'private-prompt', `tool-${i}`);
  const count = g.observations.length; g.tool('tool-succeeded', 'reading', 'private-prompt', 'tool-0');
  expect(g.observations).toHaveLength(count); expect(g.presentation().action).toBe('idle');
});

function lifecycleFixture() {
  const app = createApplication([]), observations: SessionObservation[] = [];
  const mapper = createClaudeObservations({ name: () => 'Claude fixture', publish: observation => {
    observations.push(observation); app.observe(observation);
  } });
  const send = (hook_event_name: string, runId = 'run', session_id = 'private-session') => {
    const result = normalizeClaudeHook(JSON.stringify({ hook_event_name, session_id, source: 'startup',
      prompt_id: 'private-prompt', tool_use_id: 'private-tool', tool_name: 'Read', prompt: 'discarded body' }));
    if (result.status !== 'accepted') throw Error('invalid test hook');
    mapper.accept({ runId, fact: result.fact });
  };
  const start = (runId = 'run') => { send('SessionStart', runId); send('UserPromptSubmit', runId); };
  return { app, mapper, observations, send, start, presentation: () => projectPetPresentation(app.snapshot()) };
}

it.each(['stop', 'retire'] as const)('owns the feedback timer before an Application subscriber reenters %s', operation => {
  const f = lifecycleFixture(); f.start();
  f.app.subscribe(state => {
    if (Object.values(state.sessions).some(session => session.facts?.recentActivity)) f.mapper[operation]('run');
  });
  f.send('PostToolUse');
  expect(vi.getTimerCount()).toBe(0);
  expect(f.observations.at(-1)).toMatchObject({ connected: false, facts: { activities: [], waitingForInput: false } });
  expect(f.presentation().action).toBe('idle'); expect(f.app.snapshot().bubbles).toEqual([]);
  const count = f.observations.length; vi.advanceTimersByTime(CLAUDE_FEEDBACK_MS);
  expect(f.observations).toHaveLength(count); f.mapper.stop();
});

it.each(['stop', 'retire'] as const)('does not publish a replacement after its disconnect subscriber reenters %s', operation => {
  const f = lifecycleFixture(); f.start(); f.send('PostToolUse');
  f.app.subscribe(state => {
    if (Object.values(state.sessions).every(session => !session.connected)) f.mapper[operation]('run');
  });
  f.send('SessionStart', 'run', 'replacement');
  expect(Object.values(f.app.snapshot().sessions).map(session => session.connected)).toEqual([false]);
  expect(f.observations.at(-1)?.connected).toBe(false);
  expect(vi.getTimerCount()).toBe(0); expect(f.presentation().action).toBe('idle'); f.mapper.stop();
});

it('does not overwrite a replacement admitted by a reentrant subscriber', () => {
  const f = lifecycleFixture(); f.start();
  let reentered = false;
  f.app.subscribe(state => {
    if (!reentered && Object.values(state.sessions).every(session => !session.connected)) {
      reentered = true; f.send('SessionStart', 'run', 'reentrant-session');
    }
  });
  f.send('SessionStart', 'run', 'outer-session');
  expect(Object.values(f.app.snapshot().sessions).map(session => session.connected)).toEqual([false, true]);
  f.send('UserPromptSubmit', 'run', 'reentrant-session'); f.send('PostToolUse', 'run', 'reentrant-session');
  expect(f.presentation().action).toBe('reading'); f.mapper.stop(); expect(vi.getTimerCount()).toBe(0);
});

it('cleans every live run even when an Application subscriber throws during stop', () => {
  const f = lifecycleFixture();
  for (const run of ['first', 'second']) { f.start(run); f.send('PostToolUse', run); }
  expect(vi.getTimerCount()).toBe(2);
  f.app.subscribe(() => { throw Error('private subscriber detail'); });
  expect(() => f.mapper.stop()).not.toThrow();
  expect(f.observations.filter(observation => observation.connected === false)).toHaveLength(2);
  expect(Object.values(f.app.snapshot().sessions).every(session => !session.connected)).toBe(true);
  expect(vi.getTimerCount()).toBe(0); expect(f.presentation().action).toBe('idle');
  const count = f.observations.length; f.mapper.stop(); f.send('SessionStart', 'late');
  expect(f.observations).toHaveLength(count);
});

it('isolates a throwing feedback-expiry subscriber and still clears recent presentation', () => {
  const f = lifecycleFixture(); f.start(); f.send('PostToolUse');
  f.app.subscribe(() => { throw Error('private subscriber detail'); });
  expect(() => vi.advanceTimersByTime(CLAUDE_FEEDBACK_MS)).not.toThrow();
  expect(vi.getTimerCount()).toBe(0); expect(f.presentation().action).toBe('idle');
  expect(f.app.snapshot().bubbles).toEqual([]); expect(() => f.mapper.retire('run')).not.toThrow();
  expect(f.observations.at(-1)?.connected).toBe(false);
});

it('consumes rejected publication promises without retaining cleanup timers', async () => {
  const published: SessionObservation[] = [];
  const mapper = createClaudeObservations({ name: () => 'Claude fixture', publish: async observation => {
    published.push(observation); throw Error('private async consumer detail');
  } });
  mapper.accept({ runId: 'run', fact: { kind: 'session-started', providerSessionId: 'native', source: 'startup' } });
  mapper.accept({ runId: 'run', fact: { kind: 'turn-submitted', providerSessionId: 'native', promptId: 'prompt' } });
  mapper.accept({ runId: 'run', fact: { kind: 'tool-succeeded', providerSessionId: 'native', promptId: 'prompt', toolCallId: 'tool', activity: 'reading' } });
  mapper.stop(); await vi.advanceTimersByTimeAsync(CLAUDE_FEEDBACK_MS);
  expect(published).toHaveLength(4); expect(published.at(-1)?.connected).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
