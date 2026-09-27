import { TextEncoder } from 'node:util';
import { validatePath } from '../path-policy.js';
import { validId } from '../protocol.js';
import { MAX_ENVELOPE_BYTES, MAX_OPERATION_BYTES, MAX_PATH_BYTES, WORKER_PROTOCOL, type ManagedWorkerErrorCode, type WireEnvelope } from './protocol.js';

const ERROR_CODES: ManagedWorkerErrorCode[] = ['unavailable', 'outcome-uncertain', 'limit-exceeded', 'path-changed', 'ownership-busy',
  'store-corrupt', 'durability-failed', 'unsupported-path', 'unsafe-type', 'unsafe-owner', 'unsafe-mode', 'unsupported-platform', 'protocol-failure'];
const fail = (): never => { throw new Error('protocol-failure'); };
const keys = (value: object, expected: string[]): void => {
  const actual = Object.getOwnPropertyNames(value);
  if (actual.length !== expected.length || actual.some(key => !expected.includes(key))) fail();
  if (Object.getOwnPropertySymbols(value).length) fail();
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) fail();
  }
};
function safeObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  if (Object.getPrototypeOf(object) !== Object.prototype && Object.getPrototypeOf(object) !== null) return false;
  if (Object.getOwnPropertySymbols(object).length) return false;
  for (const key of Object.getOwnPropertyNames(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return false;
  }
  return true;
}
export function validJson(value: unknown, depth = 0, nodes = { count: 0 }, seen = new WeakSet<object>()): value is import('../files-port.js').JsonValue {
  if (++nodes.count > 4096 || depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || !safeObjectOrArray(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    const names = Object.getOwnPropertyNames(value);
    if (!names.includes('length') || names.length !== value.length + 1 || names.some(name => name !== 'length' && (!/^(0|[1-9]\d*)$/.test(name) || Number(name) >= value.length))) return false;
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (!descriptor || !('value' in descriptor)) return false;
      if (name !== 'length' && (!descriptor.enumerable || !validJson(descriptor.value, depth + 1, nodes, seen))) return false;
    }
    seen.delete(value); return true;
  }
  const object = value as Record<string, unknown>;
  if (Object.hasOwn(object, 'toJSON') || Object.getOwnPropertySymbols(object).length) return false;
  for (const name of Object.getOwnPropertyNames(object)) { const descriptor = Object.getOwnPropertyDescriptor(object, name); if (!descriptor || !('value' in descriptor) || !validJson(descriptor.value, depth + 1, nodes, seen)) return false; }
  seen.delete(value); return true;
}
function safeObjectOrArray(value: object): boolean {
  if (Array.isArray(value)) return Object.getPrototypeOf(value) === Array.prototype && Object.getOwnPropertySymbols(value).length === 0;
  return safeObject(value);
}
const textBytes = (value: string): number => new TextEncoder().encode(value).byteLength;
function id(value: unknown): asserts value is string { if (!validId(value)) fail(); }
function string(value: unknown): asserts value is string { if (typeof value !== 'string') fail(); }
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) fail();
}
function path(value: unknown): asserts value is string { string(value); if (textBytes(value) > MAX_PATH_BYTES) fail(); validatePath(value); }
function ownerBody(value: Record<string, unknown>, expected: string[]): void { keys(value, expected); id(value.ownerCap); }
function requestBody(input: unknown): void {
  const value = input as any;
  if (!safeObject(value) || typeof value.type !== 'string') fail();
  switch (value.type) {
    case 'init': keys(value, ['type', 'backend', 'roots', 'initialize']);
      if (value.backend !== 'node-fixture' || typeof value.initialize !== 'boolean' || !safeObject(value.roots)) fail();
      keys(value.roots, ['storageRoot', 'runtimeRoot']); path(value.roots.storageRoot); path(value.roots.runtimeRoot); break;
    case 'read': ownerBody(value, ['type', 'ownerCap', 'path', 'maxBytes', 'operation']); path(value.path); integer(value.maxBytes, MAX_OPERATION_BYTES); if (!['authority-read', 'credential-read', 'discovery-read'].includes(value.operation as string)) fail(); break;
    case 'release': ownerBody(value, ['type', 'ownerCap', 'receiptCap']); id(value.receiptCap); break;
    case 'create-directory': ownerBody(value, ['type', 'ownerCap', 'path', 'operation']); path(value.path); if (!['authority-write', 'credential-write', 'discovery-write'].includes(value.operation as string)) fail(); break;
    case 'begin-write': ownerBody(value, ['type', 'ownerCap', 'path', 'maxBytes', 'operation']); path(value.path); integer(value.maxBytes, MAX_OPERATION_BYTES); if (!['authority-write', 'credential-write', 'discovery-write'].includes(value.operation as string)) fail(); break;
    case 'transaction-write': ownerBody(value, ['type', 'ownerCap', 'transactionCap', 'value']); id(value.transactionCap); if (!validJson(value.value)) fail(); if (textBytes(JSON.stringify(value.value)) > MAX_OPERATION_BYTES) fail(); break;
    case 'transaction-publish-new': ownerBody(value, ['type', 'ownerCap', 'transactionCap']); id(value.transactionCap); break;
    case 'transaction-publish-replace': ownerBody(value, ['type', 'ownerCap', 'transactionCap', 'receiptCap']); id(value.transactionCap); id(value.receiptCap); break;
    case 'transaction-abort': case 'transaction-close': ownerBody(value, ['type', 'ownerCap', 'transactionCap']); id(value.transactionCap); break;
    case 'remove': case 'remove-after-drain': ownerBody(value, ['type', 'ownerCap', 'receiptCap']); id(value.receiptCap); break;
    case 'drain': ownerBody(value, ['type', 'ownerCap']); break;
    case 'remove-owner': ownerBody(value, ['type', 'ownerCap']); break;
    default: fail();
  }
}
function replyBody(input: unknown): void {
  const value = input as any;
  if (!safeObject(value) || value.type !== 'reply') fail();
  if (value.ok === false) { keys(value, ['type', 'ok', 'error']); errorBody(value.error); return; }
  if (value.ok !== true || !safeObject(value.result) || typeof value.result.type !== 'string') fail();
  keys(value, ['type', 'ok', 'result']);
  const result = value.result;
  switch (result.type) {
    case 'initialized': keys(result, ['type', 'ownerCap']); id(result.ownerCap); break;
    case 'read': keys(result, ['type', 'value', 'receiptCap']); if (!validJson(result.value)) fail(); id(result.receiptCap); break;
    case 'released': case 'directory-created': case 'removed': case 'owner-finalized': keys(result, ['type']); break;
    case 'transaction-begun': keys(result, ['type', 'transactionCap', 'state']); id(result.transactionCap); if (result.state !== 'Prepared') fail(); break;
    case 'transaction-written': keys(result, ['type', 'state']); if (result.state !== 'Writing') fail(); break;
    case 'published': keys(result, ['type', 'receiptCap', 'state']); id(result.receiptCap); if (result.state !== 'Published') fail(); break;
    case 'transaction-aborted': keys(result, ['type', 'state']); if (result.state !== 'Aborted') fail(); break;
    case 'transaction-closed': keys(result, ['type', 'state']); if (!['Prepared', 'Writing', 'Published', 'Aborted', 'MutationUncertain', 'CloseUncertain'].includes(result.state as string)) fail(); break;
    case 'drained': keys(result, ['type', 'transactions']); if (result.transactions !== 0) fail(); break;
    case 'owner-removed': keys(result, ['type', 'parentSync']); if (result.parentSync !== 'complete') fail(); break;
    default: fail();
  }
}
function errorBody(input: unknown): void {
  if (!safeObject(input)) fail();
  const value = input as { code?: unknown; effect?: unknown };
  keys(value, ['code', 'effect']);
  if (typeof value.code !== 'string' || !ERROR_CODES.includes(value.code as ManagedWorkerErrorCode)) fail();
  if (typeof value.effect !== 'string' || !['none', 'committed', 'uncertain'].includes(value.effect)) fail();
}
function eventBody(input: unknown): void {
  const value = input as any;
  if (!safeObject(value) || typeof value.type !== 'string') fail();
  if (value.type === 'ready') keys(value, ['type']);
  else if (value.type === 'stopped') { keys(value, ['type', 'clean']); if (typeof value.clean !== 'boolean') fail(); }
  else if (value.type === 'failed') { keys(value, ['type', 'error']); errorBody(value.error); }
  else fail();
}
export function wireBytes(value: unknown): number {
  if (!validJson(value)) fail();
  let encoded = ''; try { encoded = JSON.stringify(value); } catch { fail(); }
  const bytes = textBytes(encoded);
  if (bytes > MAX_ENVELOPE_BYTES) fail();
  return bytes;
}
export function validateEnvelope(input: unknown): asserts input is WireEnvelope {
  const value = input as any;
  if (!safeObject(value)) fail();
  keys(value, ['protocolVersion', 'kind', 'workerGeneration', 'sequence', 'requestId', 'body']);
  if (value.protocolVersion !== WORKER_PROTOCOL || !['request', 'reply', 'event'].includes(value.kind as string)) fail();
  id(value.workerGeneration); integer(value.sequence); id(value.requestId);
  if (value.kind === 'request') requestBody(value.body); else if (value.kind === 'reply') replyBody(value.body); else eventBody(value.body);
  wireBytes(value);
}
export function validateRequestBody(value: unknown): asserts value is import('./protocol.js').RequestBody { requestBody(value); }
export function sanitizedWorkerError(error: unknown, fallback: import('./protocol.js').ManagedWorkerErrorCode = 'outcome-uncertain'): import('./protocol.js').ManagedWorkerError {
  const code = safeObject(error) && typeof error.code === 'string' && ERROR_CODES.includes(error.code as ManagedWorkerErrorCode) ? error.code as ManagedWorkerErrorCode : fallback;
  return { code, effect: code === 'outcome-uncertain' ? 'uncertain' : 'none' };
}
