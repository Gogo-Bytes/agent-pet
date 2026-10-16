import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { applyObservation, createSessionState } from '@agent-pet/domain';
import { createDevObservationEvidence } from './dev-observation-evidence.js';
const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pet-evidence-')));
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  const log = createDevObservationEvidence(root); cleanups.push(log.close);
  const state = applyObservation(createSessionState(), { sessionId: 'PRIVATE-SESSION', provider: 'pi', status: 'working',
    agentName: 'PRIVATE-NAME', projectName: 'PRIVATE-PROJECT', observedAt: '2026-10-16T00:00:00Z',
    capabilities: { reading: 'supported' }, facts: { activities: ['reading'], waitingForInput: false } });
  return { root, log, state, path: join(root, 'states.ndjson') };
}
it('records only enums and salted aliases, deduplicates, and closes without affecting snapshots', () => {
  const f = fixture(); f.log.observe(f.state); f.log.observe(f.state);
  const text = fs.readFileSync(f.path, 'utf8');
  for (const secret of ['PRIVATE-SESSION', 'PRIVATE-NAME', 'PRIVATE-PROJECT']) expect(text).not.toContain(secret);
  expect(text.trim().split('\n')).toHaveLength(1);
  expect(JSON.parse(text).states[0]).toMatchObject({ status: 'working', activities: ['reading'], requestedAction: 'reading', capabilities: { reading: 'supported', thinking: 'unknown' } });
  expect(fs.statSync(f.path).mode & 0o7777).toBe(0o600);
  f.log.close(); f.log.observe(createSessionState()); expect(fs.readFileSync(f.path, 'utf8')).toBe(text);
});
it('never adopts existing evidence or follows a replaced path', () => {
  const f = fixture(); f.log.observe(f.state);
  const other = createDevObservationEvidence(f.root); expect(other.status()).toBe('failed-preserved');
  fs.renameSync(f.path, join(f.root, 'owned.ndjson')); fs.writeFileSync(f.path, 'unknown');
  f.log.observe(createSessionState()); expect(f.log.status()).toBe('failed-preserved');
  expect(fs.readFileSync(f.path, 'utf8')).toBe('unknown');
});
it('stops at a bounded size while leaving the application input intact', () => {
  const f = fixture();
  for (let index = 0; index < 1000; index++) {
    f.log.observe(index % 2 ? f.state : createSessionState());
  }
  expect(f.log.status()).toBe('limit-reached'); expect(fs.statSync(f.path).size).toBeLessThanOrEqual(128 * 1024);
  expect(f.state.sessions['PRIVATE-SESSION']?.name).toBe('PRIVATE-NAME');
});
it('refuses an unsafe directory without creating a file', () => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pet-unsafe-evidence-')));
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.chmodSync(root, 0o755);
  const log = createDevObservationEvidence(root); expect(log.status()).toBe('failed-preserved');
  expect(fs.readdirSync(root)).toEqual([]);
});
