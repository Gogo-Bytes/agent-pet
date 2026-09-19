import { describe, expect, it } from 'vitest';
import { bubbleLabel, visibleBubbles } from './bubble-model.js';
import type { SessionState } from '@agent-pet/domain';

const state: SessionState = {
  sessions: {},
  bubbles: [
    { sessionId: 'working-1', name: 'pi', status: 'working', unread: false },
    { sessionId: 'done-1', name: 'codex', status: 'completed-unread', unread: true },
    { sessionId: 'error-1', name: 'claude', status: 'error-unread', unread: true },
  ],
};

describe('renderer bubble projection', () => {
  it('preserves one visual item per session', () => {
    expect(visibleBubbles(state)).toEqual(state.bubbles);
  });

  it('creates compact labels from the session name and status', () => {
    expect(bubbleLabel(state.bubbles[0]!)).toBe('pi · working');
    expect(bubbleLabel(state.bubbles[1]!)).toBe('codex · completed');
    expect(bubbleLabel(state.bubbles[2]!)).toBe('claude · error');
  });
});
