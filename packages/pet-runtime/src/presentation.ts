import type { ActivityKind, SessionRecord, SessionState } from '@agent-pet/domain';
import type { PetAction } from './actions.js';
/** A nonempty replay identifies a one-shot event, never a sustained activity. */
export type PetPresentation = { action: PetAction; restAction: PetAction; replay: string };
const priority: readonly ActivityKind[] = ['compacting', 'executing', 'writing', 'searching', 'reading', 'thinking', 'responding', 'retrying'];
function sustained(record: SessionRecord): PetAction {
  if (record.facts?.waitingForInput && record.capabilities?.waiting_input === 'supported') return 'waiting_input';
  return priority.find(kind => record.capabilities?.[kind] === 'supported' && record.facts?.activities.includes(kind)) ??
    (record.status === 'working' ? 'working' : 'idle');
}
function recentActivity(record: SessionRecord) {
  const recent = record.facts?.recentActivity;
  return recent && record.capabilities?.[recent.kind] === 'supported' ? recent : undefined;
}
/** One projection for desktop and home; capabilities constrain fine facts, never unread results. */
export function projectPetPresentation(state: SessionState): PetPresentation {
  const records = Object.values(state.sessions).filter(record => record.connected !== false && record.status !== 'offline')
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.sessionId.localeCompare(b.sessionId));
  const working = records.find(record => sustained(record) !== 'idle' || recentActivity(record));
  const bubble = state.bubbles.find(item => item.status === 'working') ?? state.bubbles.find(item => item.status === 'error-unread') ?? state.bubbles.find(item => item.status === 'completed-unread');
  const record = working ?? records.find(item => item.sessionId === bubble?.sessionId) ?? records[0];
  const active = records.find(item => sustained(item) !== 'idle');
  const restAction = active ? sustained(active) : bubble?.status === 'working' ? 'working' : 'idle';
  if (record) {
    const event = record.facts?.occurrence;
    if (event && record.capabilities?.[event.kind] === 'supported') return { action: event.kind, replay: `${record.sessionId}:${event.id}`, restAction };
    const recent = recentActivity(record), current = sustained(record);
    if (recent && (current === 'idle' || current === 'working')) return { action: recent.kind, replay: `${record.sessionId}:${recent.id}`, restAction };
  }
  if (restAction === 'idle' && bubble && (bubble.status === 'error-unread' || bubble.status === 'completed-unread')) {
    const action = bubble.status === 'error-unread' ? 'error' : 'success';
    return { action, restAction, replay: `${bubble.sessionId}:${state.sessions[bubble.sessionId]?.workId ?? 'legacy'}:${action}` };
  }
  return { action: restAction, restAction, replay: '' };
}
