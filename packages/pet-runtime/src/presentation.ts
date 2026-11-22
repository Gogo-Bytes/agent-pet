import { standardBehavior, type SessionState } from '@agent-pet/domain';
import type { PetAction } from './actions.js';
/** A nonempty replay identifies a one-shot event, never a sustained activity. */
export type PetPresentation = { action: PetAction; restAction: PetAction; replay: string };
/** The caller supplies only sessions belonging to this pet's configuration. */
export function projectPetPresentation(state: SessionState): PetPresentation {
  const records = Object.values(state.sessions).filter(record => record.behaviorOrder)
    .sort((a, b) => b.behaviorOrder! - a.behaviorOrder!);
  const restAction = records.map(standardBehavior).find(value => value === 'working' || value === 'waiting_input') ?? 'idle';
  const latest = records[0];
  if (latest) {
    const behavior = standardBehavior(latest);
    if ((behavior === 'completed' || behavior === 'error') && state.bubbles.some(b => b.sessionId === latest.sessionId && b.unread)) {
      const action = behavior === 'completed' ? 'success' : 'error';
      return { action, restAction, replay: `${latest.sessionId}:${latest.workId ?? latest.behaviorOrder}:${action}` };
    }
  }
  return { action: restAction, restAction, replay: '' };
}
