import type { SessionBubble } from '@agent-pet/domain';
import type { PetMotion } from '@agent-pet/pet-runtime';
/** Legacy test-host seam; production passes the complete shared Session snapshot. */
export function selectPetMotion(bubbles: readonly SessionBubble[]): PetMotion {
  if (bubbles.some(bubble => bubble.status === 'working')) return 'working';
  if (bubbles.some(bubble => bubble.status === 'error-unread')) return 'error';
  return bubbles.some(bubble => bubble.status === 'completed-unread') ? 'success' : 'idle';
}
