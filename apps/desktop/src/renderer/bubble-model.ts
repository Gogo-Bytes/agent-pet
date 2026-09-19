import type { SessionBubble, SessionState } from '@agent-pet/domain';

export function visibleBubbles(state: SessionState): readonly SessionBubble[] {
  return state.bubbles;
}

export function bubbleLabel(bubble: SessionBubble): string {
  const status = bubble.status.replace('-unread', '');
  return `${bubble.name} · ${status}`;
}
