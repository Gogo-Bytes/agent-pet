import { expect, it } from 'vitest';
import type { SessionBubble } from '@agent-pet/domain';
import { selectPetMotion } from './pet-motion.js';

const done: SessionBubble = { sessionId: 'a', name: 'A', status: 'completed-unread', unread: true };
const error: SessionBubble = { ...done, sessionId: 'b', status: 'error-unread' };
const work: SessionBubble = { ...done, sessionId: 'c', status: 'working', unread: false };

it('selects idle when no session bubbles remain', () => {
  expect(selectPetMotion([])).toBe('idle');
});
it('uses the prototype priority working, error, completed regardless of bubble order', () => {
  expect(selectPetMotion([done])).toBe('success');
  expect(selectPetMotion([done, error])).toBe('error');
  expect(selectPetMotion([work, error, done])).toBe('working');
  expect(selectPetMotion([done, error, work])).toBe('working');
});
