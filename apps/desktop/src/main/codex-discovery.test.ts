import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CodexDiscovery, inspectCodexInstallation } from './codex-discovery.js';
import { ReadBudget, limits } from './pi-preflight-files.js';

const nativeStat = ReadBudget.prototype.stat;
function isolatedStat(this: ReadBudget, path: string) {
  if (path.startsWith('/opt') || path.startsWith('/usr/local')) return Promise.resolve(null);
  return nativeStat.call(this, path);
}
let root: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pet-codex-discovery-')));
  fs.chmodSync(root, 0o700);
  vi.spyOn(ReadBudget.prototype, 'stat').mockImplementation(isolatedStat);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
function standalone(version = '0.163.0', home = join(root, '.codex')) {
  const packages = join(home, 'packages/standalone');
  const release = join(packages, 'releases', `${version}-aarch64-apple-darwin`);
  fs.mkdirSync(join(release, 'bin'), { recursive: true, mode: 0o700 });
  const executable = join(release, 'bin/codex');
  fs.writeFileSync(executable, 'DO NOT EXECUTE', { mode: 0o700 });
  fs.symlinkSync(release, join(packages, 'current'));
  return { executable, home };
}
it('finds the fixed standalone entry without PATH, collapses aliases, and never reads configuration content', async () => {
  const f = standalone(); const bin = join(root, '.local/bin'); fs.mkdirSync(bin, { recursive: true });
  fs.symlinkSync(f.executable, join(bin, 'codex'));
  const read = vi.spyOn(ReadBudget.prototype, 'json');
  const scanner = new CodexDiscovery({ home: root, guiPath: bin }); const result = await scanner.detect();
  expect(result).toMatchObject({ scan: 'complete', notice: 'none', targetPath: f.home });
  expect(result.installations).toHaveLength(1);
  expect(result.installations[0]).toMatchObject({ executable: f.executable, kind: 'standalone', version: null, compatibility: 'verified' });
  expect(read).not.toHaveBeenCalled();
  expect(scanner.candidate(result.installations[0]!.id)?.executable).toBe(f.executable);
  scanner.invalidate(); expect(scanner.candidate(result.installations[0]!.id)).toBeNull();
});
it('honors an explicit custom CODEX_HOME and leaves future versions unverified', async () => {
  const f = standalone('0.164.0', join(root, 'custom'));
  const scanner = new CodexDiscovery({ home: root, guiPath: '', codexHome: f.home }); const result = await scanner.detect();
  expect(result.targetPath).toBe(f.home);
  expect(result.installations[0]).toMatchObject({ kind: 'standalone', version: null, compatibility: 'unverified' });
  expect(scanner.candidate(result.installations[0]!.id)).toBeNull();
  expect(fs.existsSync(join(root, '.codex'))).toBe(false);
});
it('shows npm metadata as an unverified source, not as native compatibility or execution evidence', async () => {
  const pkg = join(root, '.nvm/versions/node/v22.18.0/lib/node_modules/@openai/codex');
  fs.mkdirSync(join(pkg, 'bin'), { recursive: true, mode: 0o700 });
  const executable = join(pkg, 'bin/codex.js'); fs.writeFileSync(executable, 'DO NOT EXECUTE', { mode: 0o700 });
  fs.writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@openai/codex', version: '0.163.0' }), { mode: 0o600 });
  fs.mkdirSync(join(root, '.nvm/versions/node/v22.18.0/bin')); fs.symlinkSync(executable, join(root, '.nvm/versions/node/v22.18.0/bin/codex'));
  const result = await new CodexDiscovery({ home: root, guiPath: '' }).detect();
  expect(result.installations).toHaveLength(1);
  expect(result.installations[0]).toMatchObject({ kind: 'npm', version: '0.163.0', compatibility: 'unverified' });
});
it('does not mistake a daemon binary for a supported CLI', async () => {
  const executable = join(root, 'packages/app-server-daemon/releases/0.163.0/bin/codex');
  fs.mkdirSync(dirname(executable), { recursive: true }); fs.writeFileSync(executable, 'DO NOT EXECUTE', { mode: 0o700 });
  expect(await inspectCodexInstallation(executable)).toMatchObject({ compatibility: 'unverified' });
});
it('rejects unsafe ancestors, looping links and directory programs', async () => {
  const f = standalone(); fs.chmodSync(dirname(f.executable), 0o777);
  await expect(inspectCodexInstallation(f.executable)).rejects.toThrow();
  fs.chmodSync(dirname(f.executable), 0o700);
  fs.symlinkSync('loop', join(root, 'loop'));
  await expect(inspectCodexInstallation(join(root, 'loop'))).rejects.toThrow('Link budget');
  await expect(inspectCodexInstallation(dirname(f.executable))).rejects.toThrow('Not an executable');
});
it('reports bounded PATH scans and rejects an invalid custom target rather than using the daily default', async () => {
  expect(await new CodexDiscovery({ home: root, guiPath: Array.from({ length: 40 }, (_, n) => join(root, `p${n}`)).join(':') }).detect()).toMatchObject({ scan: 'limited' });
  expect(await new CodexDiscovery({ home: root, guiPath: '', codexHome: 'relative-home' }).detect()).toMatchObject({ notice: 'failed', installations: [] });
});
it('cancels and times out a blocked scan without admitting late results or overlapping reads', async () => {
  const f = standalone(); const original = isolatedStat; const file = fs.lstatSync(f.executable);
  let finish!: () => void;
  vi.mocked(ReadBudget.prototype.stat).mockImplementation(function(this: ReadBudget, path) {
    if (path === f.executable) return new Promise(resolve => { finish = () => resolve(file); });
    return original.call(this, path);
  });
  const scanner = new CodexDiscovery({ home: root, guiPath: '' });
  vi.useFakeTimers(); const pending = scanner.detect();
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  scanner.invalidate(); await vi.advanceTimersByTimeAsync(limits.milliseconds);
  expect(await pending).toMatchObject({ notice: 'cancelled', installations: [] });
  expect(await scanner.detect()).toMatchObject({ notice: 'busy' });
  vi.mocked(ReadBudget.prototype.stat).mockImplementation(original); finish();
  vi.useRealTimers(); await new Promise(resolve => setImmediate(resolve));
  expect((await scanner.detect()).notice).toBe('none');
  expect(scanner.candidate('codex-1-0')).toBeNull();
});
