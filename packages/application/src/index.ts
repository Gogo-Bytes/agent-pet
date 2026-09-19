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
  acknowledgeAndOpen(session: SessionRef): Promise<OpenSessionResult>;
};

export function createApplication(
  adapters: readonly SessionObservationAdapter[],
): AgentPetApplication {
  const adaptersByProvider = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
  let state = createSessionState();

  return {
    observe(observation) {
      state = applyObservation(state, observation);
    },

    snapshot() {
      return state;
    },

    async acknowledgeAndOpen(session) {
      state = acknowledgeBubble(state, session.sessionId);
      const adapter = adaptersByProvider.get(session.provider);

      if (!adapter?.openSession) {
        return { status: 'unsupported' };
      }

      return (await adapter.openSession(session)) ?? { status: 'unsupported' };
    },
  };
}
