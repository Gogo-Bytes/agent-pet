import { randomBytes } from 'node:crypto';
import { parsePiSessionMessage, type PiSessionMessage } from '../protocol.js';
import { fail } from './errors.js';
export const PROTOCOL = 2 as const;
export const opaqueId = (): string => randomBytes(16).toString('hex');
export const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
export const validToken = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;
export function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export type AuthContext = { protocolVersion: 2; authSetId: string; targetId: string; epoch: number; generation: string };
export type AuthHello = AuthContext & { type: 'auth'; token: string };
export type AuthAck = AuthContext & { type: 'auth_ok' };
const contextKeys = ['type', 'protocolVersion', 'authSetId', 'targetId', 'epoch', 'generation'];
export function authContext(value: unknown, type: 'auth' | 'auth_ok'): value is AuthHello | AuthAck {
  return exact(value, [...contextKeys, ...(type === 'auth' ? ['token'] : [])]) && value.type === type &&
    value.protocolVersion === PROTOCOL && validId(value.authSetId) && validId(value.targetId) &&
    positive(value.epoch) && validId(value.generation) && (type !== 'auth' || validToken(value.token));
}
export function parseAuth(value: unknown): AuthHello {
  if (!authContext(value, 'auth')) fail('unauthorized');
  return value as AuthHello;
}
export function ackFor(auth: AuthHello): AuthAck {
  return { type: 'auth_ok', protocolVersion: PROTOCOL, authSetId: auth.authSetId, targetId: auth.targetId, epoch: auth.epoch, generation: auth.generation };
}
export function matchesAck(value: unknown, auth: AuthHello): value is AuthAck {
  return authContext(value, 'auth_ok') && value.authSetId === auth.authSetId && value.targetId === auth.targetId && value.epoch === auth.epoch && value.generation === auth.generation;
}
export function parseEvent(value: unknown): PiSessionMessage {
  const result = parsePiSessionMessage(value);
  if (!result.ok) fail('malformed-frame');
  return result.value;
}
export type ManagedSessionEvent = PiSessionMessage;
