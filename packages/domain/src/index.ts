export type Provider = 'codex' | 'pi' | 'claude';

export type SessionStatus =
  | 'working'
  | 'completed'
  | 'error'
  | 'idle'
  | 'waiting_input'
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

export function createSessionState(): SessionState {
  return { sessions: {}, bubbles: [], sessionMeta: {} };
}

export function applyObservation(
  state: SessionState,
  observation: SessionObservation,
): SessionState {
  const previousMeta = state.sessionMeta?.[observation.sessionId];
  if (isStale(previousMeta, observation)) return state;

  const name = getSessionName(observation);
  const sessions = {
    ...state.sessions,
    [observation.sessionId]: { ...observation, name },
  };
  const displayStatus = toDisplayStatus(observation.status);
  const meta = {
    ...state.sessionMeta,
    [observation.sessionId]: nextMeta(previousMeta, observation),
  };
  const bubbles = state.bubbles.filter(
    (bubble) => bubble.sessionId !== observation.sessionId,
  );

  if (!displayStatus || isAcknowledgedTerminal(previousMeta, observation)) {
    return { sessions, bubbles, sessionMeta: meta };
  }

  return {
    sessions,
    sessionMeta: meta,
    bubbles: [
      ...bubbles,
      {
        sessionId: observation.sessionId,
        name,
        status: displayStatus,
        unread: displayStatus !== 'working',
      },
    ],
  };
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

  return {
    sessions: state.sessions,
    sessionMeta: {
      ...sessionMeta,
      [sessionId]: {
        ...sessionMeta[sessionId],
        ...(acknowledgedTerminal ? { acknowledgedTerminal } : {}),
      },
    },
    bubbles: state.bubbles.filter(
      (candidate) => candidate.sessionId !== sessionId || candidate.status === 'working',
    ),
  };
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
  if (!previousMeta) return false;
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
