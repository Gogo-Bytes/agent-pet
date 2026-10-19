import { randomUUID } from 'node:crypto';
import { startHookReceiver, deliverHookBody, validHookEndpoint } from '../hook-runtime/transport.js';
import { claudeFailureKinds, normalizeClaudeHook, type ClaudeHookFact } from './normalize.js';

export const MAX_CLAUDE_DELIVERY_BYTES = 8192;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type ClaudeHookDelivery = { schemaVersion: 1; runId: string; eventId: string; fact: ClaudeHookFact };
export type ClaudeDeliveryResult = 'delivered' | 'ignored' | 'invalid' | 'unavailable';
const fields: Record<ClaudeHookFact['kind'], readonly string[]> = {
  'session-started': ['source'], 'session-ended': [], 'turn-submitted': [],
  'tool-requested': ['toolCallId', 'activity'], 'tool-succeeded': ['toolCallId', 'activity'],
  'approval-check': ['activity'], 'tool-failed': ['toolCallId', 'activity', 'interrupted'],
  'permission-prompt': [], 'response-stopped': ['continuedByHook', 'backgroundWork'],
  'turn-failed': ['failure'], 'compact-started': [], 'compact-finished': [],
};
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function id(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function nullableBoolean(value: unknown): boolean { return value === null || typeof value === 'boolean'; }
export function validClaudeHookFact(value: unknown): value is ClaudeHookFact {
  if (!object(value) || typeof value.kind !== 'string' || !Object.hasOwn(fields, value.kind)) return false;
  const kind = value.kind as ClaudeHookFact['kind'];
  const allowed = new Set(['kind', 'providerSessionId', 'promptId', 'childId', ...fields[kind]]);
  if (Object.keys(value).some(key => !allowed.has(key)) || !id(value.providerSessionId)) return false;
  if (('promptId' in value && !id(value.promptId)) || ('childId' in value && !id(value.childId))) return false;
  if (fields[kind].includes('toolCallId') && !id(value.toolCallId)) return false;
  if (fields[kind].includes('activity') && (typeof value.activity !== 'string' || !['reading', 'writing', 'searching', 'executing', 'other'].includes(value.activity))) return false;
  if (kind === 'session-started' && (typeof value.source !== 'string' || !['startup', 'resume', 'clear', 'compact'].includes(value.source))) return false;
  if (kind === 'tool-failed' && !nullableBoolean(value.interrupted)) return false;
  if (kind === 'response-stopped' && (typeof value.continuedByHook !== 'boolean' || !nullableBoolean(value.backgroundWork))) return false;
  if (kind === 'turn-failed' && !(claudeFailureKinds as readonly unknown[]).includes(value.failure)) return false;
  return true;
}
/** Strict normalized wire schema: native raw fields have no place in this protocol. */
export function parseClaudeDelivery(input: string): ClaudeHookDelivery | undefined {
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > MAX_CLAUDE_DELIVERY_BYTES) return;
  let value: unknown;
  try { value = JSON.parse(input); } catch { return; }
  if (!object(value) || Object.keys(value).some(key => !['schemaVersion', 'runId', 'eventId', 'fact'].includes(key)) ||
      value.schemaVersion !== 1 || typeof value.runId !== 'string' || !uuid.test(value.runId) ||
      typeof value.eventId !== 'string' || !uuid.test(value.eventId) || !validClaudeHookFact(value.fact)) return;
  return value as ClaudeHookDelivery;
}

/** Claude protocol over the shared, provider-scoped local transport. */
export function startClaudeHookReceiver(options: {
  token: string; acceptRun(runId: string): boolean; onFact(delivery: ClaudeHookDelivery): undefined;
}) {
  return startHookReceiver({ ...options, route: '/claude-hooks', maxBytes: MAX_CLAUDE_DELIVERY_BYTES, parse: parseClaudeDelivery });
}
export async function deliverClaudeHook(options: {
  url: string; token: string; runId: string; input: string; eventId?: string;
}): Promise<ClaudeDeliveryResult> {
  if (!validHookEndpoint(options.url, options.token, '/claude-hooks') || !uuid.test(options.runId)) return 'invalid';
  const normalized = normalizeClaudeHook(options.input);
  if (normalized.status !== 'accepted') return normalized.status === 'ignored' ? 'ignored' : 'invalid';
  const delivery: ClaudeHookDelivery = { schemaVersion: 1, runId: options.runId,
    eventId: options.eventId ?? randomUUID(), fact: normalized.fact };
  const body = JSON.stringify(delivery);
  if (!parseClaudeDelivery(body)) return 'invalid';
  return deliverHookBody({ url: options.url, token: options.token, route: '/claude-hooks', body });
}
