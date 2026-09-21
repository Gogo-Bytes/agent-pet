import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { transpileModule, ModuleKind } from 'typescript';
import { PreferenceStore } from './preferences.js';
import { defaultPreferences } from '../shared/preferences.js';

// Keep real filesystem behavior; only individual failure points are substituted per test.
vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>() }));

let root: string;
let path: string;
beforeEach(() => { root = fs.mkdtempSync(join(tmpdir(), 'pet-preferences-')); path = join(root, 'preferences.json'); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
describe('PreferenceStore actual file boundary', () => {
  it('defaults without writing, then atomically replaces a private file and restores on restart', () => {
    const store = new PreferenceStore(path);
    expect(store.snapshot()).toEqual(defaultPreferences);
    expect(store.error).toBeNull();
    expect(fs.existsSync(path)).toBe(false);
    expect(store.update({ petVisible: false, petSize: 222 })).toBe(true);
    const old = fs.openSync(path, 'r');
    try {
      store.update({ petSize: 310 });
      expect(JSON.parse(fs.readFileSync(old, 'utf8')).petSize).toBe(222); // old inode stays complete
    } finally { fs.closeSync(old); }
    expect(new PreferenceStore(path).snapshot()).toEqual({ schemaVersion: 1, petVisible: false, petSize: 310 });
    expect(fs.readdirSync(root)).toEqual(['preferences.json']);
    if (process.platform !== 'win32') expect(fs.statSync(path).mode & 0o777).toBe(0o600);
    const copy = store.snapshot(); copy.petSize = 80;
    expect(store.snapshot().petSize).toBe(310);
  });
  it.each(['broken json', 'null', '{}', '{"schemaVersion":2,"petVisible":false,"petSize":140}',
    '{"schemaVersion":1,"petVisible":"false","petSize":140}',
    '{"schemaVersion":1,"petVisible":true,"petSize":601}', 'x'.repeat(4097)])('falls back visibly without overwriting invalid data %#', content => {
    fs.writeFileSync(path, content);
    const store = new PreferenceStore(path);
    expect(store.snapshot()).toEqual(defaultPreferences);
    expect(store.error).toContain('默认值');
    expect(fs.readFileSync(path, 'utf8')).toBe(content);
    expect(store.update({ petVisible: false })).toBe(true);
    expect(store.error).toBeNull();
  });
  it('does not follow a preference-file symlink or overwrite its target on save', () => {
    const target = join(root, 'other.json');
    const content = JSON.stringify({ ...defaultPreferences, petSize: 555 });
    fs.writeFileSync(target, content); fs.symlinkSync(target, path);
    const store = new PreferenceStore(path);
    expect(store.snapshot()).toEqual(defaultPreferences);
    expect(store.error).not.toBeNull();
    expect(store.update({ petSize: 200 })).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe(content);
    expect(fs.lstatSync(path).isSymbolicLink()).toBe(false);
  });
  it.skipIf(process.platform === 'win32')('rejects a FIFO without blocking startup or replacing it', () => {
    execFileSync('mkfifo', [path], { timeout: 2000 });
    // Run the actual store in a disposable process: a blocking regression must not hang Vitest.
    const compiled = join(root, 'compiled');
    fs.mkdirSync(join(compiled, 'main'), { recursive: true });
    fs.mkdirSync(join(compiled, 'shared'), { recursive: true });
    fs.writeFileSync(join(compiled, 'package.json'), '{"type":"commonjs"}');
    for (const part of ['main', 'shared']) {
      const source = new URL(part === 'main' ? './preferences.ts' : '../shared/preferences.ts', import.meta.url);
      fs.writeFileSync(join(compiled, part, 'preferences.js'), transpileModule(fs.readFileSync(source, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS },
      }).outputText);
    }
    const result = spawnSync(process.execPath, ['-e', `
      const { PreferenceStore } = require(process.argv[1]);
      const store = new PreferenceStore(process.argv[2]);
      console.log(JSON.stringify({ value: store.snapshot(), error: store.error }));
    `, join(compiled, 'main', 'preferences.js'), path], { timeout: 3000, encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const value = JSON.parse(result.stdout);
    expect(value.value).toEqual(defaultPreferences);
    expect(value.error).toContain('默认值');
    expect(fs.lstatSync(path).isFIFO()).toBe(true);
  });
  it('keeps disk and memory unchanged on publication failure and removes its temp file', () => {
    const store = new PreferenceStore(path);
    store.update({ petSize: 200 });
    const before = fs.readFileSync(path, 'utf8');
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('injected rename failure'); });
    expect(store.update({ petVisible: false })).toBe(false);
    expect(store.snapshot()).toEqual({ ...defaultPreferences, petSize: 200 });
    expect(fs.readFileSync(path, 'utf8')).toBe(before);
    expect(fs.readdirSync(root)).toEqual(['preferences.json']);
    expect(store.error).toContain('未应用');
    expect(store.update({ petVisible: false })).toBe(true);
    expect(store.error).toBeNull();
  });
  it.each(['openSync', 'writeFileSync', 'fsyncSync'] as const)('reports %s failure without applying changes', operation => {
    const store = new PreferenceStore(path);
    vi.spyOn(fs, operation).mockImplementationOnce(() => { throw new Error('injected failure'); });
    expect(store.update({ petSize: 200 })).toBe(false);
    expect(store.snapshot()).toEqual(defaultPreferences);
    expect(store.error).not.toBeNull();
    expect(fs.readdirSync(root)).toEqual([]);
  });
  it.each([null, [], { schemaVersion: 1 }, { token: 'no' }, { petVisible: 1 }, { petSize: NaN }, { petSize: Infinity },
    { petSize: 80.5 }, { petSize: 79 }, { petSize: 601 }])('rejects untrusted patches %# before touching disk', patch => {
    const store = new PreferenceStore(path);
    expect(() => store.update(patch)).toThrow(TypeError);
    expect(fs.readdirSync(root)).toEqual([]);
  });
});
