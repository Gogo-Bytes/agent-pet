import './test-support/mock-volume-queries.js';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { createCodexNormalHookDocument, codexHookEvents } from '../../../../integrations/codex-hooks/hook-source.js';
import { prepareCodexUserHook, applyCodexUserHook, inspectCodexUserHook, withdrawCodexUserHook } from './codex-user-hook.js';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture(text?: string) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'codex-hooks-owned-'))); fs.chmodSync(root, 0o700); roots.push(root);
  const directory = join(root, 'config'); fs.mkdirSync(directory, { mode: 0o700 }); const path = join(directory, 'hooks.json');
  if (text !== undefined) fs.writeFileSync(path, text, { mode: 0o600 });
  const document = createCodexNormalHookDocument('/owned/node', '/owned/codex-normal-12345678-1234-4234-8234-123456789012/observer.cjs', '/owned/activation.json');
  return { root, directory, path, document };
}
it('adds all ten notifications, preserves unknown values/tokens and selectively removes without restoring the backup', () => {
  const original = '{\n "secret":"DO_NOT_SERIALIZE", "hooks": {"Stop":[{"hooks":[{"type":"command","command":"original","timeout":3}]}]} }';
  const f = fixture(original), plan = prepareCodexUserHook(f.directory, f.document);
  expect(plan.canApply).toBe(true); expect(JSON.stringify(plan)).not.toContain('DO_NOT_SERIALIZE');
  expect(applyCodexUserHook(plan)).toBe(true); expect(inspectCodexUserHook(plan.ownership!)).toBe(true);
  const installed = fs.readFileSync(f.path, 'utf8'); expect(installed).toContain('"secret":"DO_NOT_SERIALIZE"');
  expect(Object.keys(JSON.parse(installed).hooks)).toHaveLength(codexHookEvents.length);
  fs.writeFileSync(f.path, installed.replace('DO_NOT_SERIALIZE', 'LATER_EDIT'));
  expect(withdrawCodexUserHook(plan.ownership!)).toBe(true);
  expect(fs.readFileSync(f.path, 'utf8')).toContain('LATER_EDIT');
  expect(JSON.parse(fs.readFileSync(f.path, 'utf8')).hooks.Stop[0].hooks[0].command).toBe('original');
  expect(fs.readFileSync(f.path, 'utf8')).not.toContain('agent-pet');
});
it('rejects duplicates, partial or edited own registration, preserves files and blocks stale confirmation', () => {
  const f = fixture('{}'), plan = prepareCodexUserHook(f.directory, f.document);
  fs.writeFileSync(f.path, '{"later":true}'); expect(applyCodexUserHook(plan)).toBe(false);
  const current = prepareCodexUserHook(f.directory, f.document); expect(applyCodexUserHook(current)).toBe(true);
  expect(prepareCodexUserHook(f.directory, f.document).canApply).toBe(false);
  const edited = fs.readFileSync(f.path, 'utf8').replace('"timeout":2', '"timeout":9'); fs.writeFileSync(f.path, edited);
  expect(withdrawCodexUserHook(current.ownership!)).toBe(false); expect(fs.readFileSync(f.path, 'utf8')).toBe(edited);
});
it('rejects malformed JSON, duplicate keys, disable intent, links and pending writes without modifying targets', () => {
  for (const text of ['{"hooks":{},"hooks":{}}', '{"disableAllHooks":true}', '{bad', '{"hooks":[]}', '{"hooks":{"Stop":[7]}}']) {
    const f = fixture(text); expect(prepareCodexUserHook(f.directory, f.document).canApply).toBe(false); expect(fs.readFileSync(f.path, 'utf8')).toBe(text);
  }
  const f = fixture(); fs.writeFileSync(join(f.root, 'outside'), '{}', { mode: 0o600 }); fs.symlinkSync(join(f.root, 'outside'), f.path);
  expect(prepareCodexUserHook(f.directory, f.document).canApply).toBe(false);
  fs.unlinkSync(f.path); fs.writeFileSync(join(f.directory, 'hooks.agent-pet.pending.json'), 'preserve', { mode: 0o600 });
  expect(prepareCodexUserHook(f.directory, f.document).canApply).toBe(false);
});

it('withdraws only own registration even if the user subsequently disables all notifications', () => {
  const f = fixture('{}'), plan = prepareCodexUserHook(f.directory, f.document); expect(applyCodexUserHook(plan)).toBe(true);
  const data = JSON.parse(fs.readFileSync(f.path, 'utf8')); data.disableAllHooks = true; fs.writeFileSync(f.path, JSON.stringify(data));
  expect(inspectCodexUserHook(plan.ownership!)).toBe(false);
  expect(withdrawCodexUserHook(plan.ownership!)).toBe(true);
  expect(JSON.parse(fs.readFileSync(f.path, 'utf8'))).toEqual({ disableAllHooks: true });
});
