import type { CompanionFacts, ObservationCapabilities } from './companion.js';
export * from './companion.js';
export type Provider = 'codex' | 'pi' | 'claude';

export type SessionStatus =
  | 'working'
  | 'completed'
  | 'error'
  | 'idle'
  | 'waiting_input'
  | 'unknown'
  | 'offline';

export type DisplayStatus = 'working' | 'completed-unread' | 'error-unread';

export type SessionObservation = {
  sessionId: string;
  provider: Provider;
  status: SessionStatus;
  agentName?: string;
  projectName?: string;
  observedAt: string;
  providerSessionId?: string;
  processInstanceId?: string;
  workId?: string;
  revision?: number;
  connected?: boolean;
  baseline?: boolean;
  capabilities?: ObservationCapabilities;
  facts?: CompanionFacts;
};

export type SessionRecord = SessionObservation & {
  name: string;
};

type SessionMeta = {
  lastRevision?: number;
  lastObservedAt?: string;
  acknowledgedTerminal?: string;
};

export type SessionBubble = {
  sessionId: string;
  name: string;
  status: DisplayStatus;
  unread: boolean;
};

export type SessionState = {
  sessions: Readonly<Record<string, SessionRecord>>;
  bubbles: readonly SessionBubble[];
  sessionMeta?: Readonly<Record<string, SessionMeta>>;
};

const MAX_RETAINED_SESSIONS = 256;

export function createSessionState(): SessionState {
  return { sessions: {}, bubbles: [], sessionMeta: {} };
}

export function applyObservation(
  state: SessionState,
  observation: SessionObservation,
): SessionState {
  const previousMeta = state.sessionMeta?.[observation.sessionId];
  if (isStale(previousMeta, observation)) return state;

  // A reconnect baseline cannot invent history or erase an unread result already
  // held by this Application. A fresh process with no result stays idle.
  const previous = state.sessions[observation.sessionId];
  if (((observation.baseline && observation.status === 'idle') ||
      (observation.status === 'unknown' && observation.workId === previous?.workId)) && previous &&
    state.bubbles.some(bubble => bubble.sessionId === observation.sessionId && bubble.unread)) {
    observation = { ...observation, status: previous.status, ...(previous.workId ? { workId: previous.workId } : {}) };
  }
  const name = getSessionName(observation);
  const sessions = {
    ...state.sessions,
    [observation.sessionId]: { ...observation, name },
  };
  const displayStatus = observation.connected === false && observation.status === 'working'
    ? undefined : toDisplayStatus(observation.status);
  const meta = {
    ...state.sessionMeta,
    [observation.sessionId]: nextMeta(previousMeta, observation),
  };
  const bubbles = state.bubbles.filter(
    (bubble) => bubble.sessionId !== observation.sessionId,
  );
  const nextBubbles = !displayStatus || isAcknowledgedTerminal(previousMeta, observation) ? bubbles : [
    ...bubbles,
    {
      sessionId: observation.sessionId,
      name,
      status: displayStatus,
      unread: displayStatus !== 'working',
    },
  ];
  const retained = retainSessions(sessions, meta, nextBubbles);
  return { sessions: retained.sessions, bubbles: nextBubbles, sessionMeta: retained.meta };
}

export function acknowledgeBubble(
  state: SessionState,
  sessionId: string,
): SessionState {
  const bubble = state.bubbles.find((candidate) => candidate.sessionId === sessionId);
  const session = state.sessions[sessionId];
  const sessionMeta = state.sessionMeta ?? {};
  const acknowledgedTerminal = bubble && session && bubble.status !== 'working'
    ? terminalKey(session)
    : sessionMeta[sessionId]?.acknowledgedTerminal;

  const bubbles = state.bubbles.filter(
    (candidate) => candidate.sessionId !== sessionId || candidate.status === 'working',
  );
  const sessions = { ...state.sessions };
  if (bubble && bubble.status !== 'working') delete sessions[sessionId];
  const meta = {
    ...sessionMeta,
    [sessionId]: {
      ...sessionMeta[sessionId],
      ...(acknowledgedTerminal ? { acknowledgedTerminal } : {}),
    },
  };
  const retained = retainSessions(sessions, meta, bubbles);
  return { sessions: retained.sessions, sessionMeta: retained.meta, bubbles };
}

function retainSessions(
  sessions: Record<string, SessionRecord>,
  meta: Record<string, SessionMeta>,
  bubbles: readonly SessionBubble[],
): { sessions: Record<string, SessionRecord>; meta: Record<string, SessionMeta> } {
  const ids = Object.keys(sessions);
  const protectedIds = new Set(bubbles.map(bubble => bubble.sessionId));
  const removable = ids.filter(id => !protectedIds.has(id) && sessions[id]?.status !== 'working');
  const removeCount = Math.min(removable.length, Math.max(0, ids.length - MAX_RETAINED_SESSIONS));
  const removed = new Set(removable.slice(0, removeCount));
  const metaIds = Object.keys(meta);
  const removableMeta = metaIds.filter(id => !sessions[id] && !!meta[id]?.acknowledgedTerminal);
  const metaRemoveCount = Math.min(removableMeta.length, Math.max(0, metaIds.length - MAX_RETAINED_SESSIONS));
  removableMeta.slice(0, metaRemoveCount).forEach(id => removed.add(id));
  if (!removed.size) return { sessions, meta };
  const nextSessions = Object.fromEntries(Object.entries(sessions).filter(([id]) => !removed.has(id)));
  const nextMeta = Object.fromEntries(Object.entries(meta).filter(([id]) => !removed.has(id)));
  return { sessions: nextSessions, meta: nextMeta };
}

function getSessionName(observation: SessionObservation): string {
  return (
    observation.agentName?.trim() ||
    observation.projectName?.trim() ||
    `${observation.provider} ${observation.sessionId}`
  );
}

function toDisplayStatus(status: SessionStatus): DisplayStatus | undefined {
  switch (status) {
    case 'working':
      return 'working';
    case 'completed':
      return 'completed-unread';
    case 'error':
      return 'error-unread';
    default:
      return undefined;
  }
}

function terminalKey(observation: SessionObservation): string {
  return `${observation.workId ?? 'default'}:${observation.status}`;
}

function isAcknowledgedTerminal(
  previousMeta: SessionMeta | undefined,
  observation: SessionObservation,
): boolean {
  return (
    observation.status === 'completed' || observation.status === 'error'
  ) && previousMeta?.acknowledgedTerminal === terminalKey(observation);
}

function isStale(
  previousMeta: SessionMeta | undefined,
  observation: SessionObservation,
): boolean {
  if (!previousMeta || (observation.baseline && observation.connected !== false)) return false;
  if (
    observation.revision !== undefined &&
    previousMeta.lastRevision !== undefined
  ) {
    return observation.revision <= previousMeta.lastRevision;
  }
  return Boolean(
    previousMeta.lastObservedAt &&
    observation.observedAt < previousMeta.lastObservedAt,
  );
}

function nextMeta(
  previousMeta: SessionMeta | undefined,
  observation: SessionObservation,
): SessionMeta {
  const acknowledgedTerminal = observation.status === 'working'
    ? undefined
    : previousMeta?.acknowledgedTerminal;
  return {
    ...(observation.revision !== undefined
      ? { lastRevision: observation.revision }
      : {}),
    lastObservedAt: observation.observedAt,
    ...(acknowledgedTerminal ? { acknowledgedTerminal } : {}),
  };
}
