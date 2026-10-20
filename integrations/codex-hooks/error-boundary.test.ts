import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyObservation, createSessionState, type SessionObservation } from '../../packages/domain/src/index.js';
import { projectPetPresentation } from '../../packages/pet-runtime/src/presentation.js';
import { normalizeCodexHook } from './normalize.js';
import { CODEX_FEEDBACK_MS, createCodexObservations } from './observations.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Synthetic payloads only: do not run Codex or read a transcript to classify errors. */
function fixture() {
  let state = createSessionState();
  const events: SessionObservation[] = [];
  const mapper = createCodexObservations({ name: () => 'Codex', publish: event => {
    events.push(event); state = applyObservation(state, event);
  } });
  const send = (hook_event_name: string, fields: Record<string, unknown> = {}) => {
    const result = normalizeCodexHook(JSON.stringify({
      session_id: 'native-session', turn_id: 'native-turn', hook_event_name, ...fields,
    }));
    if (result.status === 'accepted') mapper.accept({ runId: 'verified-run', fact: result.fact });
  };
  send('SessionStart', { source: 'startup' });
  send('UserPromptSubmit');
  return { send, events, pet: () => projectPetPresentation(state), state: () => state };
}

it.each([
  '', // A nonzero-exit command can produce no output at all.
  'Error: This operation was aborted', // Tool text is not a native Interrupt event.
  'Process exited with code 7\nSECRET_TOOL_BODY', // Printed text can imitate a header.
  { exit_code: 7, success: false, error: 'SECRET_TOOL_BODY' }, // Not a Bash hook outcome contract.
])('keeps an ambiguous tool result neutral through Application and pet projection: %j', tool_response => {
  const f = fixture();
  f.send('PostToolUse', { tool_name: 'Bash', tool_use_id: 'native-tool', tool_response });
  expect(f.pet().action).toBe('executing');
  expect(f.events.at(-1)?.facts?.occurrence).toBeUndefined();
  expect(f.events.at(-1)?.capabilities?.tool_error).not.toBe('supported');
  expect(f.state().bubbles).toEqual([]);
  expect(JSON.stringify(f.events)).not.toMatch(/SECRET_TOOL_BODY|native-tool|exit_code|aborted/);
  f.send('Stop', { stop_hook_active: false });
  vi.advanceTimersByTime(CODEX_FEEDBACK_MS);
  expect(f.pet().action).toBe('idle');
  expect(f.state().bubbles).toEqual([]);
  expect(f.events.every(event => event.status === 'unknown' && event.connected)).toBe(true);
});

it('does not invent an outcome when a failed handler omits PostToolUse', () => {
  const f = fixture();
  f.send('PreToolUse', { tool_name: 'apply_patch', tool_use_id: 'native-tool' });
  vi.advanceTimersByTime(60_000);
  f.send('Stop', { stop_hook_active: false });
  expect(f.pet().action).toBe('idle');
  expect(f.state().bubbles).toEqual([]);
  expect(f.events.every(event => !event.facts?.occurrence && !event.facts?.recentActivity)).toBe(true);
  expect(f.events.at(-1)?.connected).toBe(true);
});

it('uses native cancellation even when a late tool result says error', () => {
  const f = fixture();
  f.send('PreToolUse', { tool_name: 'Bash', tool_use_id: 'native-tool' });
  f.send('Interrupt');
  expect(f.pet().action).toBe('cancelled');
  const count = f.events.length;
  f.send('PostToolUse', { tool_name: 'Bash', tool_use_id: 'native-tool',
    tool_response: 'Error: This operation was aborted' });
  expect(f.events).toHaveLength(count);
  expect(f.pet().action).toBe('cancelled');
  vi.advanceTimersByTime(CODEX_FEEDBACK_MS);
  expect(f.pet().action).toBe('idle');
});

it.each(['StopFailure', 'PostToolUseFailure'])('does not import Claude-only %s semantics into Codex', event => {
  const f = fixture(); const count = f.events.length;
  f.send(event, { error: 'SECRET_MODEL_ERROR' });
  expect(f.events).toHaveLength(count);
  expect(f.pet().action).toBe('idle');
  expect(f.state().bubbles).toEqual([]);
});
