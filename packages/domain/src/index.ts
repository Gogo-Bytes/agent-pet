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
};

export type SessionRecord = SessionObservation & {
  name: string;
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
};

export function createSessionState(): SessionState {
  return { sessions: {}, bubbles: [] };
}

export function applyObservation(
  state: SessionState,
  observation: SessionObservation,
): SessionState {
  const name = getSessionName(observation);
  const sessions = {
    ...state.sessions,
    [observation.sessionId]: { ...observation, name },
  };

  const displayStatus = toDisplayStatus(observation.status);
  const bubbles = state.bubbles.filter(
    (bubble) => bubble.sessionId !== observation.sessionId,
  );

  if (!displayStatus) {
    return { sessions, bubbles };
  }

  return {
    sessions,
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
  return {
    sessions: state.sessions,
    bubbles: state.bubbles.filter((bubble) => bubble.sessionId !== sessionId || bubble.status === 'working'),
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
