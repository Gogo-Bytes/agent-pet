import * as fs from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PiConnectionStore } from './pi-connection-store.js';

vi.mock('node:fs', async original => ({ ...await original<typeof import('node:fs')>() }));
let root: string; let path: string; let directory: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pet-store-')));
  directory = join(root, 'pi-connection'); path = join(directory, 'connection.json');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
it('reads only fixed own metadata, creates nothing on load, saves private atomic records, restores second store', () => {
  const store = new PiConnectionStore(root);
  expect(fs.readdirSync(root)).toEqual([]); expect(store.error).toBe(false);
  expect(store.save(null)).toBe(true);
  expect(fs.statSync(directory).mode & 0o7777).toBe(0o700);
  expect(fs.statSync(path).mode & 0o7777).toBe(0o600);
  expect(new PiConnectionStore(root).error).toBe(false);
  const old = fs.openSync(path, 'r');
  try { expect(store.save(null)).toBe(true); expect(fs.fstatSync(old).ino).not.toBe(fs.statSync(path).ino); }
  finally { fs.closeSync(old); }
  expect(JSON.parse(fs.readFileSync(path, 'utf8')).host).toBe(hostname());
});
it.each(['corrupt', 'oversized', 'unknown-key', 'version', 'host', 'uid', 'directory-id', 'permissive-file', 'permissive-directory', 'symlink-file', 'symlink-directory', 'pending', 'missing-file'])('fails closed and preserves %s', kind => {
  expect(new PiConnectionStore(root).save(null)).toBe(true);
  if (kind === 'corrupt') fs.writeFileSync(path, '{');
  if (kind === 'oversized') fs.writeFileSync(path, ' '.repeat(16385));
  if (['unknown-key', 'version', 'host', 'uid', 'directory-id'].includes(kind)) {
    const value = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (kind === 'unknown-key') value.extra = true;
    if (kind === 'version') value.version = 2;
    if (kind === 'host') value.host = 'foreign-fixture';
    if (kind === 'uid') value.uid = -1;
    if (kind === 'directory-id') value.directory.ino++;
    fs.writeFileSync(path, JSON.stringify(value));
  }
  if (kind === 'permissive-file') fs.chmodSync(path, 0o644);
  if (kind === 'permissive-directory') fs.chmodSync(directory, 0o755);
  if (kind === 'symlink-file') { fs.renameSync(path, join(root, 'other')); fs.symlinkSync(join(root, 'other'), path); }
  if (kind === 'symlink-directory') { fs.renameSync(directory, join(root, 'other')); fs.symlinkSync(join(root, 'other'), directory); }
  if (kind === 'pending') fs.writeFileSync(join(directory, 'pending.json'), 'uncertain');
  if (kind === 'missing-file') fs.unlinkSync(path);
  const before = kind === 'missing-file' ? null : fs.readFileSync(path, 'utf8');
  const store = new PiConnectionStore(root);
  expect(store.error).toBe(true); expect(store.snapshot()).toBeNull(); expect(store.save(null)).toBe(false);
  if (before !== null) expect(fs.readFileSync(path, 'utf8')).toBe(before);
});
it.each(['writeFileSync', 'fsyncSync', 'closeSync', 'renameSync'] as const)('reports uncertain %s without wiping pending or committed data', operation => {
  const store = new PiConnectionStore(root); expect(store.save(null)).toBe(true);
  const before = fs.readFileSync(path, 'utf8');
  const original = fs[operation];
  vi.spyOn(fs, operation).mockImplementationOnce((...args: unknown[]) => {
    if (operation === 'renameSync') (original as (...args: unknown[]) => unknown)(...args); // outcome actually committed, caller saw failure
    throw new Error('private error must not escape');
  });
  expect(store.save(null)).toBe(false); expect(store.error).toBe(true);
  expect(store.snapshot()).toBeNull();
  if (operation !== 'renameSync') {
    expect(fs.readFileSync(path, 'utf8')).toBe(before);
    expect(fs.existsSync(join(directory, 'pending.json'))).toBe(true);
    expect(new PiConnectionStore(root).error).toBe(true);
  }
});
it('refuses substituted committed file or parent symlink rather than overwrite/adopt', () => {
  const store = new PiConnectionStore(root); expect(store.save(null)).toBe(true);
  const bytes = fs.readFileSync(path); fs.renameSync(path, join(root, 'old')); fs.writeFileSync(path, bytes, { mode: 0o600 });
  expect(store.save(null)).toBe(false); expect(fs.readFileSync(path)).toEqual(bytes);
  fs.symlinkSync(root, join(root, 'alias'));
  expect(new PiConnectionStore(join(root, 'alias')).error).toBe(true);
});
