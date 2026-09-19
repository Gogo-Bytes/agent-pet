import type { SessionBubble } from '@agent-pet/domain';
import type { PetMotion } from '@agent-pet/pet-runtime/model';

// Prototype arbitration policy; unread notifications remain visible independently.
export function selectPetMotion(bubbles: readonly SessionBubble[]): PetMotion {
  if (bubbles.some(bubble => bubble.status === 'working')) return 'working';
  if (bubbles.some(bubble => bubble.status === 'error-unread')) return 'error';
  if (bubbles.some(bubble => bubble.status === 'completed-unread')) return 'success';
  return 'idle';
}
