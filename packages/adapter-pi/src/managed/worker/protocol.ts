import type { JsonValue } from '../files-port.js';

export const WORKER_PROTOCOL = 1 as const;
export const MAX_ENVELOPE_BYTES = 524_288;
export const MAX_OPERATION_BYTES = 262_144;
export const MAX_PATH_BYTES = 4_096;
export const MAX_PENDING = 128;
export const MAX_QUEUE = 127;
export const MAX_QUEUE_BYTES = 8 * 1024 * 1024;
export const MAX_TRANSACTIONS = 128;
export const MAX_RECEIPTS = 256;
export type OpaqueId = string;
export type ManagedWorkerErrorCode =
  | 'unavailable' | 'outcome-uncertain' | 'owner-unlink-committed' | 'limit-exceeded' | 'path-changed' | 'ownership-busy'
  | 'store-corrupt' | 'durability-failed' | 'unsupported-path' | 'unsafe-type' | 'unsafe-owner'
  | 'unsafe-mode' | 'unsupported-platform' | 'unsupported-mount' | 'acl-unverified' | 'protocol-failure';
export type ManagedWorkerError = { code: ManagedWorkerErrorCode; effect: 'none' | 'committed' | 'uncertain' };
export type TransactionState = 'Prepared' | 'Writing' | 'Published' | 'Aborted' | 'MutationUncertain' | 'CloseUncertain';
export type RequestBody =
  | { type: 'init'; backend: 'node-fixture' | 'darwin-addon'; roots: { storageRoot: string; runtimeRoot: string }; initialize: boolean }
  | { type: 'read'; ownerCap: OpaqueId; path: string; maxBytes: number; operation: 'authority-read' | 'credential-read' | 'discovery-read' }
  | { type: 'release'; ownerCap: OpaqueId; receiptCap: OpaqueId }
  | { type: 'create-directory'; ownerCap: OpaqueId; path: string; operation: 'authority-write' | 'credential-write' | 'discovery-write' }
  | { type: 'begin-write'; ownerCap: OpaqueId; path: string; maxBytes: number; operation: 'authority-write' | 'credential-write' | 'discovery-write' }
  | { type: 'transaction-write'; ownerCap: OpaqueId; transactionCap: OpaqueId; value: JsonValue }
  | { type: 'transaction-publish-new'; ownerCap: OpaqueId; transactionCap: OpaqueId }
  | { type: 'transaction-publish-replace'; ownerCap: OpaqueId; transactionCap: OpaqueId; receiptCap: OpaqueId }
  | { type: 'transaction-abort'; ownerCap: OpaqueId; transactionCap: OpaqueId }
  | { type: 'transaction-close'; ownerCap: OpaqueId; transactionCap: OpaqueId }
  | { type: 'remove'; ownerCap: OpaqueId; receiptCap: OpaqueId }
  | { type: 'drain'; ownerCap: OpaqueId }
  | { type: 'remove-after-drain'; ownerCap: OpaqueId; receiptCap: OpaqueId }
  | { type: 'remove-owner'; ownerCap: OpaqueId };
export type NativeAddonIdentity = { requestedPath: string; loadedPath: string; pathMatches: true };
export type ReplyResult =
  | { type: 'initialized'; ownerCap: OpaqueId; nativeAddonIdentity?: NativeAddonIdentity }
  | { type: 'read'; value: JsonValue; receiptCap: OpaqueId }
  | { type: 'released' } | { type: 'directory-created' }
  | { type: 'transaction-begun'; transactionCap: OpaqueId; state: 'Prepared' }
  | { type: 'transaction-written'; state: 'Writing' }
  | { type: 'published'; receiptCap: OpaqueId; state: 'Published' }
  | { type: 'transaction-aborted'; state: 'Aborted' }
  | { type: 'transaction-closed'; state: TransactionState }
  | { type: 'removed' } | { type: 'drained'; transactions: 0 }
  | { type: 'owner-removed'; parentSync: 'complete' } | { type: 'owner-finalized' };
export type ReplyBody = { type: 'reply'; ok: true; result: ReplyResult } | { type: 'reply'; ok: false; error: ManagedWorkerError };
export type EventBody = { type: 'ready' } | { type: 'failed'; error: ManagedWorkerError } | { type: 'stopped'; clean: boolean };
export type WireEnvelope = { protocolVersion: 1; kind: 'request' | 'reply' | 'event'; workerGeneration: OpaqueId; sequence: number; requestId: OpaqueId; body: RequestBody | ReplyBody | EventBody };
