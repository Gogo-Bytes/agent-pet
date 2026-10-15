import { expect, it } from 'vitest';
import { applyObservation, createSessionState, type SessionObservation } from '@agent-pet/domain';
import { projectPetPresentation } from './presentation.js';
const base: SessionObservation = { sessionId: 'one', provider: 'pi', status: 'working', observedAt: '2026-10-15T00:00:00Z', revision: 1 };
it('uses only supported fine facts, preserves working and prioritizes user input', () => {
  const facts = { activities: ['thinking', 'reading'] as const, waitingForInput: true };
  for (const support of [undefined, 'unknown', 'unsupported'] as const) {
    const state = applyObservation(createSessionState(), { ...base, facts,
      ...(support ? { capabilities: { thinking: support, reading: support, waiting_input: support } } : {}) });
    expect(projectPetPresentation(state).action).toBe('working');
  }
  let state = applyObservation(createSessionState(), { ...base, facts, capabilities: { thinking: 'supported', reading: 'supported', waiting_input: 'supported' } });
  expect(projectPetPresentation(state).action).toBe('waiting_input'); expect(state.bubbles[0]?.status).toBe('working');
  state = applyObservation(state, { ...state.sessions.one!, facts: { ...facts, waitingForInput: false }, revision: 2 });
  expect(projectPetPresentation(state).action).toBe('reading');
});
it('keeps transient event identity stable and resumes the current base instead of a terminal result', () => {
  const state = applyObservation(createSessionState(), { ...base,
    facts: { activities: ['writing'], waitingForInput: false, occurrence: { id: 'event-1', kind: 'tool_error' } },
    capabilities: { writing: 'supported', tool_error: 'supported' } });
  const result = projectPetPresentation(state); expect(result).toEqual({ action: 'tool_error', restAction: 'writing', replay: 'one:event-1' });
  const rename = applyObservation(state, { ...state.sessions.one!, agentName: 'renamed', revision: 2 });
  expect(projectPetPresentation(rename)).toEqual(result); expect(rename.bubbles[0]?.status).toBe('working');
  expect(projectPetPresentation(applyObservation(rename, { ...rename.sessions.one!, connected: false, revision: 3 })).action).toBe('idle');
});
it('retains terminal notification priority independently of an offline peer and old coarse producers', () => {
  const error = applyObservation(createSessionState(), { ...base, status: 'error', workId: 'batch' });
  const lost = applyObservation(error, { ...error.sessions.one!, connected: false, revision: 2 });
  expect(projectPetPresentation(lost).replay).toBe(projectPetPresentation(error).replay);
  expect(lost.bubbles[0]?.status).toBe('error-unread'); expect(projectPetPresentation(lost).action).toBe('error');
  expect(projectPetPresentation(applyObservation(lost, { ...base, sessionId: 'two' })).action).toBe('working');
});
