export type ManagedErrorCode =
  | 'unsupported-platform' | 'unsupported-path' | 'unsafe-owner' | 'unsafe-mode'
  | 'unsafe-type' | 'unsafe-link' | 'acl-unverified' | 'acl-denied' | 'mount-unverified'
  | 'unsupported-mount' | 'path-changed' | 'path-too-long' | 'store-corrupt'
  | 'ownership-busy' | 'stale-operation' | 'durability-failed' | 'outcome-uncertain'
  | 'limit-exceeded' | 'malformed-frame' | 'frame-too-large' | 'unauthorized'
  | 'handshake-timeout' | 'rate-limited' | 'backpressure' | 'unavailable';
/** Fixed codes only: never attach paths, input, credentials or native exception causes. */
export class ManagedError extends Error {
  constructor(readonly code: ManagedErrorCode) { super(code); this.name = 'ManagedError'; }
}
export function fail(code: ManagedErrorCode): never { throw new ManagedError(code); }
export function sanitized(error: unknown, fallback: ManagedErrorCode = 'unavailable'): ManagedError {
  return error instanceof ManagedError ? error : new ManagedError(fallback);
}
export const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
