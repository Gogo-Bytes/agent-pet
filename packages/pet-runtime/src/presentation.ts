import type { ActivityKind, SessionRecord, SessionState } from '@agent-pet/domain';
import type { PetAction } from './actions.js';
export type PetPresentation = { action: PetAction; restAction: PetAction; replay: string };
const priority: readonly ActivityKind[] = ['compacting', 'executing', 'writing', 'searching', 'reading', 'thinking', 'responding', 'retrying'];
function current(record: SessionRecord): PetAction {
  if (record.facts?.waitingForInput && record.capabilities?.waiting_input === 'supported') return 'waiting_input';
  const activity = priority.find(kind => record.capabilities?.[kind] === 'supported' && record.facts?.activities.includes(kind));
  return activity ?? (record.status === 'working' ? 'working' : 'idle');
}
/** One projection for desktop and home; capabilities constrain fine facts, never unread results. */
export function projectPetPresentation(state: SessionState): PetPresentation {
  const records = Object.values(state.sessions).filter(record => record.connected !== false && record.status !== 'offline')
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.sessionId.localeCompare(b.sessionId));
  const working = records.find(record => record.status === 'working' || current(record) !== 'idle');
  const bubble = state.bubbles.find(item => item.status === 'working') ?? state.bubbles.find(item => item.status === 'error-unread') ?? state.bubbles.find(item => item.status === 'completed-unread');
  const base: PetAction = working ? current(working) : bubble?.status === 'working' ? 'working' : bubble?.status === 'error-unread' ? 'error' : bubble ? 'success' : 'idle';
  const record = working ?? records.find(item => item.sessionId === bubble?.sessionId) ?? records[0];
  const event = record?.facts?.occurrence;
  // A small tool failure does not turn a running task into a terminal error.
  const occurrence = event && record?.capabilities?.[event.kind] === 'supported' ? event : undefined;
  const action = occurrence?.kind ?? base;
  return { action, restAction: occurrence ? (base === 'error' || base === 'success' ? 'idle' : base) : 'idle',
    replay: occurrence ? `${record!.sessionId}:${occurrence.id}` : (base === 'error' || base === 'success') ? `${bubble?.sessionId}:${bubble ? state.sessions[bubble.sessionId]?.workId ?? 'legacy' : 'legacy'}:${base}` : '' };
}
