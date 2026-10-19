import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { environment, runBounded, summarize, resolveEntry } from './cli-check.mjs';
async function fixture(fn) {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-pet-codex-fixture-'));
  try { await mkdir(path.join(root, 'work')); await fn(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
it('uses an explicit environment with no inherited tokens', () => {
  expect(environment('/isolated')).toEqual({ HOME: '/isolated/home', CODEX_HOME: '/isolated/config',
    XDG_CONFIG_HOME: '/isolated/config', XDG_CACHE_HOME: '/isolated/cache', TMPDIR: '/isolated/tmp',
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C', NO_COLOR: '1' });
});
it('projects only version and known option booleans', () => {
  expect(summarize('codex-cli 0.163.0\nSECRET', 'version')).toEqual({ version: '0.163.0' });
  expect(JSON.stringify(summarize('SECRET --config --help hooks', 'help'))).not.toContain('SECRET');
});
it('runs a self-owned fixture and never publishes arbitrary stdout/stderr', async () => fixture(async root => {
  expect(await runBounded(process.execPath, ['-e', 'console.log("codex-cli 0.163.0"); console.error("SECRET")'], root, 'version'))
    .toEqual({ status: 'ok', bytes: 25, version: '0.163.0' });
}));
it('bounds combined output and stops only its new child', async () => fixture(async root => {
  const result = await runBounded(process.execPath, ['-e', 'process.stdout.write("x".repeat(70000)); setInterval(()=>{},1000)'], root, 'help');
  expect(result.status).toBe('output-limit'); expect(result).not.toHaveProperty('flags');
}));
it('stops a stalled child on deadline', async () => fixture(async root => {
  expect((await runBounded(process.execPath, ['-e', 'setInterval(()=>{},1000)'], root, 'help', 100)).status).toBe('timeout');
}));
it('handles missing executable without exposing an error path', async () => fixture(async root => {
  expect(await runBounded(path.join(root, 'missing'), [], root, 'help')).toEqual({ status: 'spawn-failed', bytes: 0 });
}));
it('resolves bounded installation links and rejects escape/cycles', async () => fixture(async root => {
  // macOS tmpdir is already canonical (/var may be a link); resolve the fixture root first.
  const { realpath } = await import('node:fs/promises'); root = await realpath(root);
  const install = path.join(root, 'install'); await mkdir(install);
  const binary = path.join(install, 'codex'); await writeFile(binary, 'fixture', { mode: 0o700 });
  const entry = path.join(root, 'entry'); await symlink(binary, entry);
  expect((await resolveEntry(entry, install)).executable).toBe(binary);
  await rm(entry); await symlink('/bin/sh', entry);
  await expect(resolveEntry(entry, install)).rejects.toThrow('outside-installation');
  await rm(entry); await symlink(entry, entry);
  await expect(resolveEntry(entry, install)).rejects.toThrow('link-limit');
}));
