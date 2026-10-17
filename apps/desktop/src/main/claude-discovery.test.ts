import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClaudeDiscovery, inspectClaudeInstallation } from './claude-discovery.js';
import { ReadBudget, limits } from './pi-preflight-files.js';

let root: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pet-claude-discovery-')));
  fs.chmodSync(root, 0o700);
  // Do not read host installations, even when running these tests on a developer Mac.
  const stat = ReadBudget.prototype.stat;
  vi.spyOn(ReadBudget.prototype, 'stat').mockImplementation(function(this: ReadBudget, path) {
    if (path.startsWith('/opt') || path.startsWith('/usr/local')) return Promise.resolve(null);
    return stat.call(this, path);
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
function npm(version = '2.1.301', node = 'v22.18.0') {
  const prefix = join(root, '.nvm/versions/node', node);
  const pkg = join(prefix, 'lib/node_modules/@anthropic-ai/claude-code');
  fs.mkdirSync(join(pkg, 'bin'), { recursive: true, mode: 0o700 });
  const executable = join(pkg, 'bin/claude.exe');
  fs.writeFileSync(executable, 'throw new Error("DO NOT EXECUTE")', { mode: 0o700 });
  fs.writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-code', version, bin: { claude: 'bin/claude.exe' } }), { mode: 0o600 });
  fs.mkdirSync(join(prefix, 'bin')); const entry = join(prefix, 'bin/claude');
  fs.symlinkSync('../lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe', entry);
  return { executable, entry, pkg };
}
it('finds NVM without GUI PATH and collapses several entries pointing to the same program', async () => {
  const f = npm(); const bin = join(root, 'gui/bin'); fs.mkdirSync(bin, { recursive: true });
  fs.symlinkSync(f.entry, join(bin, 'claude'));
  const scanner = new ClaudeDiscovery({ home: root, guiPath: bin });
  const result = await scanner.detect();
  expect(result).toMatchObject({ notice: 'none', scan: 'complete', targetPath: join(root, '.claude') });
  expect(result.installations).toHaveLength(1);
  expect(result.installations[0]).toMatchObject({ entryPath: join(bin, 'claude'), executable: f.executable, kind: 'npm', version: '2.1.301', compatibility: 'verified' });
  expect(scanner.candidate(result.installations[0]!.id)?.executable).toBe(f.executable);
  scanner.invalidate(); expect(scanner.candidate(result.installations[0]!.id)).toBeNull();
  expect(fs.existsSync(join(root, '.claude'))).toBe(false);
});
it('retains different installations and marks unknown npm and official native layouts unverified', async () => {
  npm(); npm('2.1.302', 'v24.20.0');
  const native = join(root, '.local/share/claude/versions/2.1.301');
  fs.mkdirSync(dirname(native), { recursive: true }); fs.writeFileSync(native, 'DO NOT EXECUTE', { mode: 0o700 });
  fs.mkdirSync(join(root, '.local/bin'), { recursive: true }); fs.symlinkSync(native, join(root, '.local/bin/claude'));
  const scanner = new ClaudeDiscovery({ home: root, guiPath: '' }); const result = await scanner.detect();
  expect(result.installations).toHaveLength(3);
  const candidate = result.installations.find(value => value.kind === 'native')!;
  expect(candidate).toMatchObject({ executable: native, version: null, compatibility: 'unverified' });
  expect(scanner.candidate(candidate.id)).toBeNull();
  expect(result.installations.find(value => value.version === '2.1.302')?.compatibility).toBe('unverified');
});
it('rejects writable ancestors, looping links, directory executables, and oversized package metadata', async () => {
  const f = npm(); fs.chmodSync(f.pkg, 0o777);
  await expect(inspectClaudeInstallation(f.entry, root)).rejects.toThrow();
  fs.chmodSync(f.pkg, 0o700); fs.writeFileSync(join(f.pkg, 'package.json'), ' '.repeat(65537));
  await expect(inspectClaudeInstallation(f.entry, root)).rejects.toThrow();
  fs.symlinkSync('loop', join(root, 'loop'));
  await expect(inspectClaudeInstallation(join(root, 'loop'), root)).rejects.toThrow('Link budget');
  await expect(inspectClaudeInstallation(f.pkg, root)).rejects.toThrow('Not an executable');
});
it('recognizes Homebrew layout as a source hint without trusting its directory version or executing it', async () => {
  const binary = join(root, 'fake'); fs.writeFileSync(binary, 'DO NOT EXECUTE', { mode: 0o700 });
  const file = fs.lstatSync(binary), folder = fs.lstatSync(root);
  vi.mocked(ReadBudget.prototype.stat).mockImplementation(async path => path === '/opt/homebrew/Caskroom/claude-code/2.1.301/claude' ? file : folder);
  expect(await inspectClaudeInstallation('/opt/homebrew/Caskroom/claude-code/2.1.301/claude', root)).toMatchObject({ kind: 'homebrew', compatibility: 'unverified', version: null });
});
it('bounds NVM enumeration and reports partial PATH scans honestly', async () => {
  for (let n = 0; n < 18; n++) fs.mkdirSync(join(root, '.nvm/versions/node', 'v22.1.' + n), { recursive: true });
  const scanner = new ClaudeDiscovery({ home: root, guiPath: Array.from({ length: 40 }, (_, n) => join(root, 'p' + n)).join(':') });
  expect(await scanner.detect()).toMatchObject({ scan: 'limited' });
});
it('keeps a blocked read single flight, times out without accepting late candidates and supports retry after it settles', async () => {
  const f = npm(); const stat = ReadBudget.prototype.stat; const file = fs.lstatSync(f.entry);
  let finish!: () => void;
  vi.spyOn(ReadBudget.prototype, 'stat').mockImplementation(function(this: ReadBudget, path) {
    return path === f.entry ? new Promise(resolve => { finish = () => resolve(file); }) : stat.call(this, path);
  });
  const scanner = new ClaudeDiscovery({ home: root, guiPath: dirname(f.entry) });
  vi.useFakeTimers(); const pending = scanner.detect();
  // Let filesystem promises reach the blocked leaf before advancing the deadline.
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await vi.advanceTimersByTimeAsync(limits.milliseconds);
  expect(await pending).toMatchObject({ notice: 'failed', installations: [] });
  expect(await scanner.detect()).toMatchObject({ notice: 'busy' });
  vi.mocked(ReadBudget.prototype.stat).mockImplementation(stat);
  finish(); vi.useRealTimers();
  await new Promise(resolve => setImmediate(resolve));
  expect((await scanner.detect()).notice).toBe('none');
  expect(scanner.candidate('claude-1-0')).toBeNull();
});
