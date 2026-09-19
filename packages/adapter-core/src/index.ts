import type { Provider, SessionObservation } from '@agent-pet/domain';

export type SessionRef = {
  provider: Provider;
  sessionId: string;
};

export type OpenSessionResult =
  | { status: 'success' }
  | { status: 'unsupported' }
  | { status: 'not-found' }
  | { status: 'permission-denied' };

export type AdapterConfig = Readonly<Record<string, unknown>>;

export type ObservationSink = {
  publish(observation: SessionObservation): void;
  connectionChanged(state: 'connected' | 'degraded' | 'disconnected'): void;
};

export type AdapterHandle = {
  stop(): Promise<void>;
};

export type SessionObservationAdapter = {
  provider: Provider;
  start(config: AdapterConfig, sink: ObservationSink): Promise<AdapterHandle>;
  openSession?(session: SessionRef): Promise<OpenSessionResult>;
};
