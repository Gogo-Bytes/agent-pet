import type { SessionState } from '@agent-pet/domain';

/** Main-routed per-configuration presentation; not an Agent business fact. */
export type PetSnapshot = SessionState & { connectionCue?: string };
