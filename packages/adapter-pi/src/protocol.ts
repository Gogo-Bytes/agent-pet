import type { SessionStatus } from '@agent-pet/domain';

export type PiBridgeStatus = Extract<SessionStatus, 'working' | 'completed' | 'error' | 'idle' | 'offline'>;

type Common = {
  type: 'hello' | 'lifecycle' | 'session_info_changed' | 'heartbeat';
  schemaVersion: 1;
  token: string;
  seq: number;
  processInstanceId: string;
  providerSessionId: string;
  sentAt: string;
};

export type PiBridgeMessage =
  | (Common & {
      type: 'hello';
      status: PiBridgeStatus;
      sessionName?: string;
      projectName?: string;
    })
  | (Common & { type: 'lifecycle'; status: PiBridgeStatus; workId?: string })
  | (Common & { type: 'session_info_changed'; sessionName?: string })
  | (Common & { type: 'heartbeat' });

export type ParseResult =
  | { ok: true; value: PiBridgeMessage }
  | { ok: false; reason: string };

const commonFields = new Set([
  'type', 'schemaVersion', 'token', 'seq', 'processInstanceId',
  'providerSessionId', 'sentAt',
]);
const statuses = new Set<PiBridgeStatus>(['working', 'completed', 'error', 'idle', 'offline']);
const fieldsByType: Record<PiBridgeMessage['type'], readonly string[]> = {
  hello: ['status', 'sessionName', 'projectName'],
  lifecycle: ['status', 'workId'],
  session_info_changed: ['sessionName'],
  heartbeat: [],
};

export function parsePiBridgeMessage(input: unknown): ParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'message-must-be-object' };
  }
  const value = input as Record<string, unknown>;
  if (typeof value.type !== 'string' || !fieldsByType[value.type as PiBridgeMessage['type']]) {
    return { ok: false, reason: 'invalid-type' };
  }
  const type = value.type as PiBridgeMessage['type'];
  const allowed = new Set([...commonFields, ...fieldsByType[type]]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return { ok: false, reason: `unknown-field:${key}` };
  }
  if (value.schemaVersion !== 1) return { ok: false, reason: 'unsupported-schema-version' };
  if (typeof value.token !== 'string' || value.token.length < 16 || value.token.length > 256) {
    return { ok: false, reason: 'invalid-token' };
  }
  if (typeof value.seq !== 'number' || !Number.isSafeInteger(value.seq) || value.seq < 1) {
    return { ok: false, reason: 'invalid-sequence' };
  }
  for (const field of ['processInstanceId', 'providerSessionId'] as const) {
    if (typeof value[field] !== 'string' || value[field].length < 1 || value[field].length > 256) {
      return { ok: false, reason: `invalid-${field}` };
    }
  }
  if (
    typeof value.sentAt !== 'string' ||
    !Number.isFinite(Date.parse(value.sentAt))
  ) return { ok: false, reason: 'invalid-sent-at' };
  if ('status' in value && (typeof value.status !== 'string' || !statuses.has(value.status as PiBridgeStatus))) {
    return { ok: false, reason: 'invalid-status' };
  }
  for (const field of ['sessionName', 'projectName', 'workId'] as const) {
    if (field in value && value[field] !== undefined &&
        (typeof value[field] !== 'string' || value[field].length > 256)) {
      return { ok: false, reason: `invalid-${field}` };
    }
  }
  if ((type === 'hello' || type === 'lifecycle') && typeof value.status !== 'string') {
    return { ok: false, reason: 'status-required' };
  }
  return { ok: true, value: value as PiBridgeMessage };
}
