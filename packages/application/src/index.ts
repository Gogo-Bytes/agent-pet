import {
  acknowledgeBubble,
  applyObservation,
  createSessionState,
  type SessionObservation,
  type SessionState,
} from '@agent-pet/domain';
import type {
  OpenSessionResult,
  SessionObservationAdapter,
  SessionRef,
} from '@agent-pet/adapter-core';

export type AgentPetApplication = {
  observe(observation: SessionObservation): void;
  snapshot(): SessionState;
  subscribe(listener: (snapshot: SessionState) => void): () => void;
  acknowledgeAndOpen(session: SessionRef): Promise<OpenSessionResult>;
};

export function createApplication(
  adapters: readonly SessionObservationAdapter[],
): AgentPetApplication {
  const adaptersByProvider = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
  let state = createSessionState();
  const listeners = new Set<(snapshot: SessionState) => void>();
  function publish(): void {
    for (const listener of listeners) listener(state);
  }

  return {
    observe(observation) {
      state = applyObservation(state, observation);
      publish();
    },

    snapshot() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    async acknowledgeAndOpen(session) {
      const record = state.sessions[session.sessionId];
      if (!record || record.provider !== session.provider) return { status: 'not-found' };
      state = acknowledgeBubble(state, session.sessionId);
      publish();
      const adapter = adaptersByProvider.get(session.provider);

      if (!adapter?.openSession) {
        return { status: 'unsupported' };
      }

      return (await adapter.openSession(session)) ?? { status: 'unsupported' };
    },
  };
}
