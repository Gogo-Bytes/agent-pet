import type { SessionRecord, SessionState } from '@agent-pet/domain';
import type { PetAction } from './actions.js';
/** A nonempty replay identifies a one-shot event, never a sustained activity. */
export type PetPresentation = { action: PetAction; restAction: PetAction; replay: string };
function sustained(record: SessionRecord): PetAction {
  if (record.facts?.waitingForInput && record.capabilities?.waiting_input === 'supported') return 'waiting_input';
  return record.status === 'working' ? 'working' : 'idle';
}
/** One projection for desktop and home; capabilities constrain fine facts, never unread results. */
export function projectPetPresentation(state: SessionState): PetPresentation {
  const records = Object.values(state.sessions).filter(record => record.connected !== false && record.status !== 'offline')
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.sessionId.localeCompare(b.sessionId));
  // The domain appends updated bubbles. Preserve severity, newest update first within each kind.
  const bubbles = [...state.bubbles].reverse();
  const bubble = bubbles.find(item => item.status === 'working') ?? bubbles.find(item => item.status === 'error-unread') ?? bubbles.find(item => item.status === 'completed-unread');
  const active = records.find(item => sustained(item) !== 'idle');
  const restAction = active ? sustained(active) : bubble?.status === 'working' ? 'working' : 'idle';
  if (restAction === 'idle' && bubble && (bubble.status === 'error-unread' || bubble.status === 'completed-unread')) {
    const action = bubble.status === 'error-unread' ? 'error' : 'success';
    return { action, restAction, replay: `${bubble.sessionId}:${state.sessions[bubble.sessionId]?.workId ?? 'legacy'}:${action}` };
  }
  return { action: restAction, restAction, replay: '' };
}
