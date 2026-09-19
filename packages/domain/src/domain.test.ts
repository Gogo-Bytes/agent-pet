import { describe, expect, it } from 'vitest';
import {
  acknowledgeBubble,
  applyObservation,
  createSessionState,
  type SessionObservation,
} from './index.js';

const working = (overrides: Partial<SessionObservation> = {}): SessionObservation => ({
  sessionId: 'session-1',
  provider: 'pi',
  status: 'working',
  agentName: 'pi',
  projectName: 'agent-pet',
  observedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('session bubble projection', () => {
  it('shows a working session using its agent name', () => {
    const state = applyObservation(createSessionState(), working());

    expect(state.bubbles).toEqual([
      {
        sessionId: 'session-1',
        name: 'pi',
        status: 'working',
        unread: false,
      },
    ]);
  });

  it('updates the same bubble to completed-unread', () => {
    const state = applyObservation(
      applyObservation(createSessionState(), working()),
      working({ status: 'completed', observedAt: '2026-01-01T00:01:00.000Z' }),
    );

    expect(state.bubbles).toEqual([
      {
        sessionId: 'session-1',
        name: 'pi',
        status: 'completed-unread',
        unread: true,
      },
    ]);
  });

  it('keeps independent sessions as separate bubbles', () => {
    const second = working({ sessionId: 'session-2', projectName: 'other-project' });
    delete second.agentName;
    const state = applyObservation(
      applyObservation(createSessionState(), working()),
      second,
    );

    expect(state.bubbles.map(({ sessionId, name }) => ({ sessionId, name }))).toEqual([
      { sessionId: 'session-1', name: 'pi' },
      { sessionId: 'session-2', name: 'other-project' },
    ]);
  });

  it('acknowledges and removes completed or errored bubbles', () => {
    const completed = applyObservation(
      createSessionState(),
      working({ status: 'completed' }),
    );

    expect(acknowledgeBubble(completed, 'session-1').bubbles).toEqual([]);
  });

  it('uses a stable fallback when no display name is available', () => {
    const observation = working();
    delete observation.agentName;
    delete observation.projectName;
    const state = applyObservation(createSessionState(), observation);

    expect(state.bubbles[0]?.name).toBe('pi session-1');
  });
});
