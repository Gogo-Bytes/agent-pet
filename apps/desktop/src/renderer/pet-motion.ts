import type { SessionBubble } from '@agent-pet/domain';
import { projectPetPresentation, type PetMotion } from '@agent-pet/pet-runtime';
/** Legacy test-host seam; production passes the complete shared Session snapshot. */
export function selectPetMotion(bubbles: readonly SessionBubble[]): PetMotion {
  return projectPetPresentation({ sessions: {}, bubbles }).action;
}
