import { activityKinds, occurrenceKinds, type CompanionFacts, type ObservationCapabilities, type SessionStatus } from '@agent-pet/domain';

export type PiBridgeStatus = Extract<SessionStatus, 'working' | 'completed' | 'error' | 'idle' | 'offline'>;

type Common = {
  type: 'hello' | 'lifecycle' | 'session_info_changed' | 'heartbeat' | 'companion';
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
      workId?: string;
      status: PiBridgeStatus;
      sessionName?: string;
      projectName?: string;
      capabilities?: ObservationCapabilities;
      facts?: CompanionFacts;
    })
  | (Common & { type: 'lifecycle'; status: PiBridgeStatus; workId?: string; facts?: CompanionFacts; capabilities?: ObservationCapabilities })
  | (Common & { type: 'session_info_changed'; sessionName?: string })
  | (Common & { type: 'heartbeat' })
  | (Common & { type: 'companion'; facts: CompanionFacts; capabilities?: ObservationCapabilities });

export type PiSessionMessage = PiBridgeMessage extends infer M ? M extends PiBridgeMessage ? Omit<M, 'token'> : never : never;

export type ParseResult =
  | { ok: true; value: PiBridgeMessage }
  | { ok: false; reason: string };

const commonFields = new Set([
  'type', 'schemaVersion', 'token', 'seq', 'processInstanceId',
  'providerSessionId', 'sentAt',
]);
const statuses = new Set<PiBridgeStatus>(['working', 'completed', 'error', 'idle', 'offline']);
const fieldsByType: Record<PiBridgeMessage['type'], readonly string[]> = {
  hello: ['status', 'sessionName', 'projectName', 'workId', 'capabilities', 'facts'],
  lifecycle: ['status', 'workId', 'facts', 'capabilities'],
  session_info_changed: ['sessionName'],
  heartbeat: [],
  companion: ['facts', 'capabilities'],
};

export function parsePiBridgeMessage(input: unknown): ParseResult {
  return parseMessage(input, true) as ParseResult;
}

/** Token-free payload validation for an already authenticated managed connection. */
export function parsePiSessionMessage(input: unknown): { ok: true; value: PiSessionMessage } | { ok: false; reason: string } {
  return parseMessage(input, false) as { ok: true; value: PiSessionMessage } | { ok: false; reason: string };
}

function parseMessage(input: unknown, withToken: boolean): ParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'message-must-be-object' };
  }
  const value = input as Record<string, unknown>;
  if (typeof value.type !== 'string' || !Object.hasOwn(fieldsByType, value.type)) {
    return { ok: false, reason: 'invalid-type' };
  }
  const type = value.type as PiBridgeMessage['type'];
  const allowed = new Set([...commonFields, ...fieldsByType[type]]);
  if (!withToken) allowed.delete('token');
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return { ok: false, reason: `unknown-field:${key}` };
  }
  if (value.schemaVersion !== 1) return { ok: false, reason: 'unsupported-schema-version' };
  if (withToken && (typeof value.token !== 'string' || value.token.length < 16 || value.token.length > 256)) {
    return { ok: false, reason: 'invalid-token' };
  }
  if (typeof value.seq !== 'number' || !Number.isSafeInteger(value.seq) || value.seq < 1 || value.seq > Math.floor(Number.MAX_SAFE_INTEGER / 2)) {
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
  if ('capabilities' in value && !validCapabilities(value.capabilities)) return { ok: false, reason: 'invalid-capabilities' };
  if (('facts' in value && !validFacts(value.facts)) || (type === 'companion' && !('facts' in value))) return { ok: false, reason: 'invalid-facts' };
  return { ok: true, value: value as PiBridgeMessage };
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function validCapabilities(value: unknown): boolean {
  const kinds: readonly string[] = [...activityKinds, ...occurrenceKinds, 'waiting_input'];
  return object(value) && Object.keys(value).every(key => kinds.includes(key) && typeof value[key] === 'string' && ['supported', 'unsupported', 'unknown'].includes(value[key]));
}
function validFacts(value: unknown): boolean {
  if (!object(value) || Object.keys(value).some(key => !['activities', 'waitingForInput', 'occurrence'].includes(key))) return false;
  if (typeof value.waitingForInput !== 'boolean' || !Array.isArray(value.activities) || value.activities.length > activityKinds.length ||
    !value.activities.every(kind => typeof kind === 'string' && (activityKinds as readonly string[]).includes(kind)) || new Set(value.activities).size !== value.activities.length) return false;
  if (value.occurrence !== undefined) {
    const event = value.occurrence;
    if (!object(event) || Object.keys(event).some(key => !['id', 'kind'].includes(key)) ||
      typeof event.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(event.id) ||
      typeof event.kind !== 'string' || !(occurrenceKinds as readonly string[]).includes(event.kind)) return false;
  }
  return true;
}
