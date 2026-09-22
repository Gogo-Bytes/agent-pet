import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectInstallations, identifyInstallation, inspectTarget, limits, ReadBudget, scanPaths } from './pi-preflight-files.js';

let root: string;
beforeEach(async () => { root = await realpath(await mkdtemp(join(tmpdir(), 'pet-p2a-files-'))); });
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
async function put(path: string, content: string) { await mkdir(join(path, '..'), { recursive: true, mode: 0o700 }); await writeFile(path, content, { mode: 0o600 }); }
async function packageFixture(version = '0.85.1', overrides: object = {}) {
  const path = join(root, 'lib/node_modules/@earendil-works/pi-coding-agent');
  await put(join(path, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version, bin: { pi: 'dist/bundle/cli.js' }, piConfig: { configDir: '.pi' }, ...overrides }));
  await put(join(path, 'dist/bundle/cli.js'), 'throw new Error("must not execute");');
  return path;
}
const inspect = () => inspectTarget({ path: root, source: 'chosen' });
async function tree(path: string): Promise<unknown> {
  const entries: unknown[] = [];
  for (const name of (await readdir(path)).sort()) {
    const child = join(path, name); const stat = await lstat(child);
    entries.push([name, stat.mode, stat.mtimeMs, stat.isDirectory() ? await tree(child) : (await readFile(child)).toString('hex')]);
  }
  return entries;
}

describe('bounded installation metadata identity on synthetic files', () => {
  it('recognizes only the standard metadata and bin, without executing the CLI', async () => {
    const path = await packageFixture();
    await mkdir(join(root, 'bin')); await symlink('../lib/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js', join(root, 'bin/pi'));
    expect(await identifyInstallation(join(root, 'bin/pi'), 'id')).toMatchObject({ compatibility: 'verified-0.85.1', version: '0.85.1' });
    expect(await identifyInstallation(path, 'manual', true)).toMatchObject({ compatibility: 'verified-0.85.1' });
    await put(join(root, 'wrapper'), '#!/bin/sh\npi "$@"');
    expect(await identifyInstallation(join(root, 'wrapper'), 'wrapper')).toMatchObject({ compatibility: 'unverified', version: null });
  });
  it.each(['0.85.0', '0.85.2', '1.0.0', '0.85.1-beta', 'secret\nversion'])('does not widen compatibility to %s', async version => {
    const path = await packageFixture(version);
    expect(await identifyInstallation(path, 'id', true)).toMatchObject({ compatibility: 'unverified', version: version.includes('\n') ? null : version });
  });
  it.each([{ name: '@mariozechner/pi-coding-agent' }, { bin: { pi: 'wrapper.js' } }, { piConfig: { configDir: '.fork' } }])('rejects nonstandard identity %j', async overrides => {
    expect(await identifyInstallation(await packageFixture('0.85.1', overrides), 'id', true)).toMatchObject({ compatibility: 'unverified', version: null });
  });
  it('leaves unsafe metadata, missing entry, symlink package roots and oversized metadata unverified', async () => {
    const path = await packageFixture();
    await chmod(join(path, 'package.json'), 0o666);
    expect((await identifyInstallation(path, 'wide', true))?.compatibility).toBe('unverified');
    await chmod(join(path, 'package.json'), 0o600);
    await rm(join(path, 'dist/bundle/cli.js'));
    expect((await identifyInstallation(path, 'missing-bin', true))?.compatibility).toBe('unverified');
    await symlink(path, join(root, 'package-alias'));
    expect((await identifyInstallation(join(root, 'package-alias'), 'alias', true))?.compatibility).toBe('unverified');
    await put(join(path, 'package.json'), ' '.repeat(limits.bytes + 1));
    expect((await identifyInstallation(path, 'oversize', true))?.compatibility).toBe('unverified');
  });
  it('bounds PATH entries, depths, symlink loops and elapsed budget', async () => {
    const paths = scanPaths(root, ['', '.', 'relative', ...Array.from({ length: 100 }, (_, n) => join(root, `bin-${n}`))].join(':'));
    expect(paths.length).toBeLessThanOrEqual(35); expect(paths.every(path => path.startsWith('/'))).toBe(true);
    expect(paths).not.toContain('pi');
    const budget = new ReadBudget(undefined, 10_000);
    for (let i = 0; i < limits.operations; i++) budget.check();
    expect(() => budget.check()).toThrow('budget');
    expect(() => new ReadBudget().validatePath('/' + '界'.repeat(1500))).toThrow('unsafe');
    await symlink('loop', join(root, 'loop'));
    expect(await identifyInstallation(join(root, 'loop'), 'id')).toMatchObject({ compatibility: 'unverified' });
    expect(await identifyInstallation('/' + 'a/'.repeat(40) + 'pi', 'long')).toMatchObject({ compatibility: 'unverified' });
    expect(await detectInstallations([join(root, 'loop')], new ReadBudget(undefined, 0))).toMatchObject({ scan: 'limited' });
    expect(await inspectTarget({ path: root, source: 'chosen' }, new ReadBudget(undefined, 0))).toMatchObject({ findings: ['budget'] });
  });
  it('only scans explicit finite paths; no sibling traversal', async () => {
    await put(join(root, 'pi'), 'not a pi package');
    await put(join(root, 'other/pi'), 'throw new Error("not traversed")');
    const result = await detectInstallations([join(root, 'pi'), join(root, 'absent')]);
    expect(result.installations.map(item => item.path)).toEqual([join(root, 'pi')]);
  });
});

describe('read-only target inspection on actual temporary filesystem', () => {
  it('does not change file content, modes, mtimes or directory entries, and projects no secrets', async () => {
    await put(join(root, 'settings.json'), JSON.stringify({ apiKey: 'SYNTHETIC_SECRET', extensions: [], unrelated: { endpoint: 'SECRET_ENDPOINT' } }));
    await put(join(root, 'sessions/private.jsonl'), 'SYNTHETIC_SESSION');
    const reads = vi.spyOn(ReadBudget.prototype, 'json');
    const before = await tree(root); const result = await inspect();
    expect(reads.mock.calls.map(([path]) => path)).toEqual([join(root, 'extensions/package.json'), join(root, 'settings.json')]);
    expect(result.findings).toEqual([]); expect(await tree(root)).toEqual(before);
    expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC|SECRET|apiKey|endpoint/);
  });
  it.each(['index.ts', 'index.js', 'agent-pet.ts'])('reports %s without claiming installed', async name => {
    await put(join(root, 'extensions', name), 'throw new Error("DO NOT EXECUTE")');
    expect((await inspect()).findings).toContain(name === 'agent-pet.ts' ? 'existing-extension' : 'root-entry');
  });
  it('distinguishes root manifest from unknown manifest semantics', async () => {
    await put(join(root, 'extensions/package.json'), JSON.stringify({ pi: { extensions: ['entry.js'] } }));
    expect((await inspect()).findings).toContain('root-manifest');
    await put(join(root, 'extensions/package.json'), '{}');
    expect((await inspect()).findings).toContain('manifest-unknown');
  });
  it.each(['.gitignore', '.ignore', '.fdignore'])('marks %s unknown rather than approximating glob/negation semantics', async name => {
    await put(join(root, 'extensions', name), '**/*.ts\n!agent-pet.ts\n');
    expect((await inspect()).findings).toContain('ignore-unknown');
  });
  it.each([{ extensions: ['!extensions/*.ts', '+extensions/agent-pet.ts'] }, { extensions: ['-extensions/agent-pet.ts'] }, { extensions: false }, { packages: ['npm:must-not-install'] }, []])('marks unsupported/excluded settings unknown: %j', async settings => {
    await put(join(root, 'settings.json'), JSON.stringify(settings));
    expect((await inspect()).findings).toContain('settings-unknown');
  });
  it('reports missing targets, malformed/oversize JSON, and broad permission modes', async () => {
    expect((await inspectTarget({ path: join(root, 'missing'), source: 'default' })).findings).toEqual(['missing-target']);
    await put(join(root, 'settings.json'), '{SYNTHETIC_SECRET');
    expect((await inspect()).findings).toEqual(['unreadable']);
    await put(join(root, 'settings.json'), ' '.repeat(limits.bytes + 1));
    expect((await inspect()).findings).toEqual(['unsafe']);
    await put(join(root, 'settings.json'), '{}'); await chmod(join(root, 'settings.json'), 0o666);
    expect((await inspect()).findings).toEqual(['unsafe']);
  });
  it('rejects non-writable target and extension directories without repairing permissions', async () => {
    await chmod(root, 0o500);
    expect((await inspect()).findings).toEqual(['unsafe']);
    expect((await lstat(root)).mode & 0o777).toBe(0o500);
    await chmod(root, 0o700);
    await mkdir(join(root, 'extensions'), { mode: 0o500 });
    expect((await inspect()).findings).toEqual(['unsafe']);
    await chmod(join(root, 'extensions'), 0o700);
  });
  it('rejects a leaf symlink swapped between metadata inspection and open', async () => {
    await put(join(root, 'settings.json'), '{}');
    await put(join(root, 'secret-decoy'), 'NOT_JSON_SECRET');
    class SwappingBudget extends ReadBudget {
      override async regular(path: string) {
        const stat = await super.regular(path);
        if (path === join(root, 'settings.json')) { await rm(path); await symlink('secret-decoy', path); }
        return stat;
      }
    }
    const result = await inspectTarget({ path: root, source: 'chosen' }, new SwappingBudget());
    expect(result.findings).toEqual(['unreadable']);
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(await readFile(join(root, 'secret-decoy'), 'utf8')).toBe('NOT_JSON_SECRET');
  });
  it('rejects symlink leaves, directories, ancestors, hardlinks, and nonregular files', async () => {
    await put(join(root, 'outside'), '{"apiKey":"SYNTHETIC_SECRET"}');
    await symlink('outside', join(root, 'settings.json'));
    expect((await inspect()).findings).toEqual(['unsafe']);
    await rm(join(root, 'settings.json')); await link(join(root, 'outside'), join(root, 'settings.json'));
    expect((await inspect()).findings).toEqual(['unsafe']);
    await rm(join(root, 'settings.json')); await mkdir(join(root, 'settings.json'));
    expect((await inspect()).findings).toEqual(['unsafe']);
    await rm(join(root, 'settings.json'), { recursive: true });
    await symlink(root, join(root, 'alias'));
    expect((await inspectTarget({ path: join(root, 'alias'), source: 'chosen' })).findings).toEqual(['unsafe']);
    // Only a synthetic FIFO fixture is created by this test utility, never a product subprocess.
    execFileSync('mkfifo', [join(root, 'settings.json')], { timeout: 2000 });
    expect((await inspect()).findings).toEqual(['unsafe']);
  }, 3000);
});
