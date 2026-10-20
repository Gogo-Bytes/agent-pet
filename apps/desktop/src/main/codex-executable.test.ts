import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { inspectCodexExecutable, resolveCodexHostExecutable } from './codex-executable.js';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
it('resolves only owned supported release layouts, rejects writable programs and other versions without executing', () => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'codex-install-fixture-'))); fs.chmodSync(root, 0o700); roots.push(root);
  const path = join(root, 'packages/standalone/releases/0.163.0-aarch64-apple-darwin/bin/codex'); fs.mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path, 'fixture never executed', { mode: 0o700 }); const entry = join(root, 'codex'); fs.symlinkSync(path, entry);
  expect(inspectCodexExecutable(entry)).toBe(path); fs.chmodSync(path, 0o722); expect(inspectCodexExecutable(entry)).toBeNull();
  fs.chmodSync(path, 0o700); const other = path.replace('0.163.0-', '0.164.0-'); fs.mkdirSync(join(other, '..'), { recursive: true, mode: 0o700 }); fs.writeFileSync(other, 'fixture', { mode: 0o700 });
  expect(inspectCodexExecutable(other)).toBeNull();
});
it('uses the fixed dedicated daemon entry when present, never the CLI path as a substitute for invalid daemon', () => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'codex-host-fixture-'))); fs.chmodSync(root, 0o700); roots.push(root);
  expect(resolveCodexHostExecutable('/known/cli', root, value => value)).toBe('/known/cli');
  const current = join(root, 'packages/app-server-daemon/current'); fs.mkdirSync(current, { recursive: true, mode: 0o700 });
  expect(resolveCodexHostExecutable('/known/cli', root, value => value)).toBe(join(current, 'bin/codex'));
  expect(resolveCodexHostExecutable('/known/cli', root, () => null)).toBeNull();
});
