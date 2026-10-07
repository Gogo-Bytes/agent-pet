import { expect, test } from 'vitest';
import { caseIds, exitCode, serializeCases, serializeCleanup, serializeEnvironment, type CaseEvidence, type Cleanup, type Environment } from './evidence.js';
const environment: Environment = { schema: 1, scope: 'synthetic-current-account', productionAdmission: 'BLOCKED', platform: 'darwin', arch: 'arm64', node: 'v22.22.3', commit: 'a'.repeat(40), harnessDigest: 'b'.repeat(64), nativeVersion: 1, napi: 8 };
const cases = (): CaseEvidence[] => caseIds.map(id => ({ id, status: 'NOT-RUN', code: 'PREREQUISITE', fixtureOnly: true, facts: {} }));
const cleanup: Cleanup = { schema: 1, status: 'BLOCKED', roots: [{ alias: 'lease-root', verdict: 'PRESERVED', code: 'BARRIER' }] };
const fakeSecrets = ['FAKE-TOKEN-DO-NOT-EMIT', '/Users/fake-account/private/production', 'fake-principal', 'f'.repeat(64), 'RAW-ERROR-SECRET'];

test('D6 evidence serializes only fixed aliases, counters, statuses and version/source provenance', () => {
  const evidence = serializeEnvironment(environment) + serializeCases(cases()) + serializeCleanup(cleanup);
  for (const secret of fakeSecrets) expect(evidence).not.toContain(secret);
  expect(Buffer.byteLength(evidence)).toBeLessThan(32768);
  expect(JSON.parse(serializeEnvironment(environment)).productionAdmission).toBe('BLOCKED');
});
for (const secret of fakeSecrets) test('D6 strict schema rejects secret-bearing fields and values without echoing their contents', () => {
  const variants: (() => string)[] = [
    () => serializeEnvironment({ ...environment, token: secret }),
    () => serializeEnvironment({ ...environment, platform: secret }),
    () => serializeCleanup({ ...cleanup, error: secret }),
    () => serializeCleanup({ ...cleanup, roots: [{ alias: secret, verdict: 'PRESERVED', code: 'BARRIER' }] }),
    () => serializeCases(cases().map((c, i) => i ? c : { ...c, tokenHash: secret })),
    () => serializeCases(cases().map((c, i) => i ? c : { ...c, code: secret })),
    () => serializeCases(cases().map((c, i) => i ? c : { ...c, facts: { bytes: secret } })),
    () => serializeCases(cases().map((c, i) => i ? c : { ...c, facts: { principal: secret } })),
  ];
  for (const serialize of variants) {
    let rendered = '';
    try { rendered = serialize(); } catch (error) { rendered = (error as Error).message; }
    expect(rendered).toBe('D6_EVIDENCE_INVALID'); expect(rendered).not.toContain(secret);
  }
});
test('D6 rejects unknown/missing/duplicate keys, oversized arrays/strings/counters and serialization hooks', () => {
  for (const value of [{ ...environment, node: 'x'.repeat(10000) }, { ...environment, productionAdmission: 'PASS' },
    { ...environment, schema: undefined }, Object.assign(Object.create({ secret: 'hidden' }), environment),
    { ...environment, toJSON() { return { secret: 'leak' }; } }]) expect(() => serializeEnvironment(value)).toThrow('D6_EVIDENCE_INVALID');
  expect(() => serializeCases([...cases(), ...cases()])).toThrow('D6_EVIDENCE_INVALID');
  expect(() => serializeCases(cases().map(c => ({ ...c, id: 'public-entry' })))).toThrow('D6_EVIDENCE_INVALID');
  for (const bytes of [-1, Infinity, NaN, 0.1, 1_000_001]) expect(() => serializeCases(cases().map(c => ({ ...c, facts: { bytes } })))).toThrow('D6_EVIDENCE_INVALID');
  expect(() => serializeCleanup({ ...cleanup, roots: Array(4).fill(cleanup.roots[0]) })).toThrow('D6_EVIDENCE_INVALID');
  const getter = { ...environment }; Object.defineProperty(getter, 'node', { get() { throw new Error('secret'); }, enumerable: true });
  expect(() => serializeEnvironment(getter)).toThrow('D6_EVIDENCE_INVALID');
  const hiddenHook = { ...environment }; Object.defineProperty(hiddenHook, 'toJSON', { value: () => ({ token: fakeSecrets[0] }) });
  expect(() => serializeEnvironment(hiddenHook)).toThrow('D6_EVIDENCE_INVALID');
  const hookedRoots = Object.assign([...cleanup.roots], { toJSON: () => ({ token: fakeSecrets[0] }) });
  expect(() => serializeCleanup({ ...cleanup, roots: hookedRoots })).toThrow('D6_EVIDENCE_INVALID');
  const sparse = cases(); delete sparse[0];
  expect(() => serializeCases(sparse)).toThrow('D6_EVIDENCE_INVALID');
});
test('D6 failure exits 1; blocked/missing gates exit 2, never admission success', () => {
  expect(exitCode(cases(), cleanup)).toBe(2);
  const failure = cases(); failure[0]!.status = 'FAIL'; expect(exitCode(failure, cleanup)).toBe(1);
  expect(exitCode(cases(), { ...cleanup, status: 'FAIL' })).toBe(1);
});
