import { fail } from './errors.js';
import type { Roots } from './path-policy.js';
import type { SessionObservation } from '@agent-pet/domain';
import type { ManagedCore } from './service.js';
import type { ClientOptions, ManagedClient } from './client.js';
export { ManagedError } from './errors.js';
export type { ManagedErrorCode } from './errors.js';
export type { ClientOptions, ManagedClient } from './client.js';
export type { ManagedSessionEvent } from './protocol.js';
export type ManagedServiceOptions = { roots: Roots; initialize: boolean; publish(observation: SessionObservation): void };

/** P2b.2 ACL/mount/recovery backend is mandatory. No input inspection, FS or sockets in this entry. */
export async function createManagedPiService(_options: ManagedServiceOptions): Promise<ManagedCore> {
  return fail('acl-unverified');
}
/** ACK is not server authentication: sending credentials requires verified path protection first. */
export async function connectManagedPiClient(_options: ClientOptions): Promise<ManagedClient> {
  return fail('acl-unverified');
}
