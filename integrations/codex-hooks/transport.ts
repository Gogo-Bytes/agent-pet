import { randomUUID } from 'node:crypto';
import { startHookReceiver, deliverHookBody, validHookEndpoint, type HookDelivery, type HookDeliveryResult } from '../hook-runtime/transport.js';
import { normalizeCodexHook, type CodexHookFact } from './normalize.js';

export const MAX_CODEX_DELIVERY_BYTES = 8192;
export type CodexHookDelivery = HookDelivery<CodexHookFact>;
export type CodexDeliveryResult = HookDeliveryResult;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fields: Record<CodexHookFact['kind'], readonly string[]> = {
  'session-started': ['source'], 'session-ended': [], 'turn-submitted': [], 'turn-interrupted': [],
  'tool-requested': ['toolCallId', 'activity'], 'tool-returned': ['toolCallId', 'activity'],
  'approval-check': ['activity'], 'stop-requested': ['alreadyContinued'],
  'compact-requested': ['trigger'], 'compact-finished': ['trigger'],
};
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function id(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
export function validCodexHookFact(value: unknown): value is CodexHookFact {
  if (!object(value) || typeof value.kind !== 'string' || !Object.hasOwn(fields, value.kind)) return false;
  const kind = value.kind as CodexHookFact['kind'];
  const allowed = new Set(['kind', 'providerSessionId', 'turnId', 'childId', ...fields[kind]]);
  if (Object.keys(value).some(key => !allowed.has(key)) || !id(value.providerSessionId)) return false;
  if (('turnId' in value && !id(value.turnId)) || ('childId' in value && !id(value.childId))) return false;
  if (kind !== 'session-started' && kind !== 'session-ended' && !id(value.turnId)) return false;
  if (fields[kind].includes('toolCallId') && !id(value.toolCallId)) return false;
  if (fields[kind].includes('activity') && !['writing', 'executing', 'other'].some(activity => value.activity === activity)) return false;
  if (kind === 'session-started' && !['startup', 'resume', 'clear', 'compact', 'fork'].some(source => value.source === source)) return false;
  if (kind === 'stop-requested' && typeof value.alreadyContinued !== 'boolean') return false;
  if (fields[kind].includes('trigger') && value.trigger !== 'manual' && value.trigger !== 'auto') return false;
  return true;
}
export function parseCodexDelivery(input: string): CodexHookDelivery | undefined {
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > MAX_CODEX_DELIVERY_BYTES) return;
  let value: unknown;
  try { value = JSON.parse(input); } catch { return; }
  if (!object(value) || Object.keys(value).some(key => !['schemaVersion', 'runId', 'eventId', 'fact'].includes(key)) ||
      value.schemaVersion !== 1 || typeof value.runId !== 'string' || !uuid.test(value.runId) ||
      typeof value.eventId !== 'string' || !uuid.test(value.eventId) || !validCodexHookFact(value.fact)) return;
  return value as CodexHookDelivery;
}
/** The caller must independently bind a verified host run. A request UUID is not proof of presence. */
export function startCodexHookReceiver(options: {
  token: string; acceptRun(runId: string): boolean; onFact(delivery: CodexHookDelivery): undefined;
}) {
  return startHookReceiver({ ...options, route: '/codex-hooks', maxBytes: MAX_CODEX_DELIVERY_BYTES, parse: parseCodexDelivery });
}
export async function deliverCodexHook(options: {
  url: string; token: string; runId: string; input: string; eventId?: string;
}): Promise<CodexDeliveryResult> {
  if (!validHookEndpoint(options.url, options.token, '/codex-hooks') || !uuid.test(options.runId)) return 'invalid';
  const normalized = normalizeCodexHook(options.input);
  if (normalized.status !== 'accepted') return normalized.status === 'ignored' ? 'ignored' : 'invalid';
  const delivery: CodexHookDelivery = { schemaVersion: 1, runId: options.runId,
    eventId: options.eventId ?? randomUUID(), fact: normalized.fact };
  const body = JSON.stringify(delivery);
  if (!parseCodexDelivery(body)) return 'invalid';
  return deliverHookBody({ url: options.url, token: options.token, route: '/codex-hooks', body });
}
