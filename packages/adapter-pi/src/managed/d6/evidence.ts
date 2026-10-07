// D6 test evidence only. No arbitrary strings, errors, paths, principals or credential material.
export const caseIds = ['public-entry', 'namespace', 'positive-handshake', 'malformed-discovery',
  'protected-path', 'stale-generation', 'native-acl', 'native-lease-owner', 'socket-native',
  'cross-user', 'native-fault', 'packaging', 'recovery', 'real-target', 'freshness-before-send'] as const;
export type CaseId = typeof caseIds[number];
export type Status = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT-RUN';
const codes = ['CHECKED', 'CHECK_FAILED', 'PREREQUISITE', 'UNAVAILABLE_API', 'NOT_AUTHORIZED', 'NO_FRESHNESS_AUTHORITY'] as const;
const factKeys = ['bytes', 'connections', 'observations', 'admissions', 'positive', 'denied', 'collisionPreserved',
  'localApfs', 'ownershipEnabled', 'noAcl', 'allowRejected', 'inheritedAllowRejected', 'denyRecognized',
  'leaseBusy', 'leaseReleased', 'ownerRetained', 'coreRefused', 'inputReads', 'ioCalls'] as const;
export type CaseEvidence = { id: CaseId; status: Status; code: typeof codes[number]; fixtureOnly: true;
  facts: Partial<Record<typeof factKeys[number], number | boolean>> };
export type Environment = { schema: 1; scope: 'synthetic-current-account'; productionAdmission: 'BLOCKED';
  platform: 'darwin' | 'linux' | 'other'; arch: 'arm64' | 'x64' | 'other'; node: string; commit: string; harnessDigest: string;
  nativeVersion: 1 | null; napi: 8 | null };
export type Cleanup = { schema: 1; status: Status; roots: { alias: 'core-root' | 'acl-root' | 'lease-root';
  verdict: 'REMOVED' | 'PRESERVED' | 'NOT-CREATED'; code: 'CLEAN' | 'BARRIER' | 'UNCERTAIN' | 'PREREQUISITE' }[] };
function bad(): never { throw new Error('D6_EVIDENCE_INVALID'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.getOwnPropertySymbols(value).length) bad();
  for (const d of Object.values(Object.getOwnPropertyDescriptors(value))) if (!('value' in d)) bad();
  return value as Record<string, unknown>;
}
function keys(value: unknown, allowed: readonly string[], required = allowed): Record<string, unknown> {
  const r = record(value);
  if (Object.getOwnPropertyNames(r).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(r, k))) bad();
  return r;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max ||
      Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).some(k => k !== 'length' && !/^(0|[1-9][0-9]*)$/.test(k))) bad();
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !('value' in descriptor)) bad();
  }
  return value;
}
function one(value: unknown, values: readonly unknown[]): void { if (!values.includes(value)) bad(); }
function bounded(value: unknown): string {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 8192) bad();
  return text + '\n';
}
export function serializeEnvironment(value: unknown): string {
  const r = keys(value, ['schema', 'scope', 'productionAdmission', 'platform', 'arch', 'node', 'commit', 'harnessDigest', 'nativeVersion', 'napi']);
  one(r.schema, [1]); one(r.scope, ['synthetic-current-account']); one(r.productionAdmission, ['BLOCKED']);
  one(r.platform, ['darwin', 'linux', 'other']); one(r.arch, ['arm64', 'x64', 'other']);
  if (typeof r.node !== 'string' || !/^v\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(r.node) ||
      typeof r.commit !== 'string' || !/^[a-f0-9]{40}$/.test(r.commit) ||
      typeof r.harnessDigest !== 'string' || !/^[a-f0-9]{64}$/.test(r.harnessDigest)) bad();
  one(r.nativeVersion, [1, null]); one(r.napi, [8, null]);
  return bounded(r);
}
export function serializeCases(value: unknown): string {
  const rows = array(value, caseIds.length);
  if (rows.length !== caseIds.length) bad();
  const seen = new Set<unknown>();
  for (const item of rows) {
    const r = keys(item, ['id', 'status', 'code', 'fixtureOnly', 'facts']);
    one(r.id, caseIds); if (seen.has(r.id)) bad(); seen.add(r.id);
    one(r.status, ['PASS', 'FAIL', 'BLOCKED', 'NOT-RUN']); one(r.code, codes); one(r.fixtureOnly, [true]);
    const f = keys(r.facts, factKeys, []);
    for (const [key, v] of Object.entries(f)) {
      if (['bytes', 'connections', 'observations', 'admissions', 'inputReads', 'ioCalls'].includes(key)) {
        if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > 1_000_000) bad();
      } else if (typeof v !== 'boolean') bad();
    }
  }
  const text = rows.map(v => bounded(v).trimEnd()).join('\n') + '\n';
  if (Buffer.byteLength(text) > 16384) bad();
  return text;
}
export function serializeCleanup(value: unknown): string {
  const r = keys(value, ['schema', 'status', 'roots']); one(r.schema, [1]); one(r.status, ['PASS', 'FAIL', 'BLOCKED', 'NOT-RUN']);
  const roots = array(r.roots, 3);
  const seen = new Set<unknown>();
  for (const root of roots) {
    const entry = keys(root, ['alias', 'verdict', 'code']); one(entry.alias, ['core-root', 'acl-root', 'lease-root']);
    if (seen.has(entry.alias)) bad(); seen.add(entry.alias);
    one(entry.verdict, ['REMOVED', 'PRESERVED', 'NOT-CREATED']); one(entry.code, ['CLEAN', 'BARRIER', 'UNCERTAIN', 'PREREQUISITE']);
  }
  return bounded(r);
}
// 0 is reserved for a hypothetical unblocked result, never produced by this D6.1 checkpoint.
export function exitCode(cases: CaseEvidence[], cleanup: Cleanup): 1 | 2 {
  return cases.some(c => c.status === 'FAIL') || cleanup.status === 'FAIL' ? 1 : 2;
}
