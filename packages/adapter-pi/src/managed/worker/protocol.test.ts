import { test, expect } from 'vitest';
import { validateEnvelope, wireBytes } from './validation.js';
import { MAX_ENVELOPE_BYTES } from './protocol.js';

const envelope = (body: any) => ({ protocolVersion: 1, kind: 'request', workerGeneration: 'a'.repeat(32), sequence: 1, requestId: 'b'.repeat(32), body });
const init = () => ({ type: 'init', backend: 'node-fixture', roots: { storageRoot: '/tmp/a', runtimeRoot: '/tmp/b' }, initialize: true });
test('Worker protocol rejects darwin backend and unknown fields', () => {
  expect(() => validateEnvelope(envelope({ ...init(), backend: 'darwin' }))).toThrow('protocol-failure');
  expect(() => validateEnvelope(envelope({ ...init(), extra: true }))).toThrow('protocol-failure');
});
test('Worker protocol rejects accessors, non-enumerable fields, prototypes and overlarge UTF-8 envelopes', () => {
  const body = init(); Object.defineProperty(body, 'initialize', { get: () => true });
  expect(() => validateEnvelope(envelope(body))).toThrow('protocol-failure');
  const extra = init(); Object.defineProperty(extra, 'unknown', { value: true });
  expect(() => validateEnvelope(envelope(extra))).toThrow('protocol-failure');
  const polluted = { ...init() }; Object.setPrototypeOf(polluted, { polluted: true });
  expect(() => validateEnvelope(envelope(polluted))).toThrow('protocol-failure');
  expect(() => wireBytes(envelope({ ...init(), roots: { storageRoot: `/tmp/${'é'.repeat(MAX_ENVELOPE_BYTES)}`, runtimeRoot: '/tmp/b' } }))).toThrow('protocol-failure');
});
test('Worker protocol validates failed-event error unions', () => {
  const failed = { type: 'failed', error: { code: 'not-a-worker-code', effect: 'none' } };
  expect(() => validateEnvelope({ ...envelope(failed), kind: 'event' })).toThrow('protocol-failure');
  const accessor = { type: 'failed', error: { code: 'unavailable', effect: 'none' } };
  Object.defineProperty(accessor.error, 'effect', { get: () => 'none' });
  expect(() => validateEnvelope({ ...envelope(accessor), kind: 'event' })).toThrow('protocol-failure');
});
