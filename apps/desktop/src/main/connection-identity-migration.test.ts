import * as fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { saveStat } from './pi-temp-deployment.js';
import { preparePiIdentityMigration, applyIdentityMigration, prepareClaudeIdentityMigration } from './connection-identity-migration.js';
import { ClaudePresenceStore } from './claude-presence-store.js';
import { prepareClaudeUserHook, applyClaudeUserHook } from './claude-user-hook.js';
vi.mock('./durable-file-identity.js', async original => ({ ...await original<typeof import('./durable-file-identity.js')>(),
  samePersistedIdentity: (a: Record<string, unknown>, b: Record<string, unknown>) => ['ino', 'birthtimeMs', 'mode', 'uid', 'gid'].every(k => a[k] === b[k]) && (a.volumeId === '11111111-1111-1111-1111-111111111111' || a.dev === b.dev),
  readVolumeIdentity: () => '11111111-1111-1111-1111-111111111111',
  withVolumeIdentity: (_p: string, stat: object) => ({ ...stat }),
}));
let root: string, path: string, extension: string;
beforeEach(() => { root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'migration-'))); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
function pi() {
  const directory = join(root, 'pi-connection'), target = join(root, 'target');
  fs.mkdirSync(directory, { mode: 0o700 }); fs.mkdirSync(target, { mode: 0o700 });
  fs.mkdirSync(join(target, 'extensions'), { mode: 0o700 });
  extension = join(target, 'extensions/agent-pet.ts'); fs.writeFileSync(extension, 'owned fixture', { mode: 0o600 });
  const old = (p: string) => ({ ...saveStat(fs.lstatSync(p)), dev: 123 });
  const record = { version: 1, host: hostname(), uid: process.getuid!(), directory: old(directory), connection: {
    target, config: { endpoint: '/tmp/ap-000000000000000000000000/p.sock', token: 'a'.repeat(64) },
    runtime: old(target), disabled: true, ownership: { digest: createHash('sha256').update('owned fixture').digest('hex'),
      file: old(extension), directories: [[target, old(target)], [join(target, 'extensions'), old(join(target, 'extensions'))]] },
  } };
  path = join(directory, 'connection.json'); fs.writeFileSync(path, JSON.stringify(record), { mode: 0o600 }); return record;
}
it('prepares without mutation, preserves token/disabled and missing runtime, backs up exact bytes, consumes once', () => {
  const record = pi(), before = fs.readFileSync(path), tree = fs.readdirSync(root);
  const plan = preparePiIdentityMigration(root);
  expect(plan.runtimeMissing).toBe(true); expect(fs.readFileSync(path)).toEqual(before); expect(fs.readdirSync(root)).toEqual(tree);
  expect(JSON.stringify(plan)).not.toContain(record.connection.config.token);
  const result = applyIdentityMigration(plan); expect(result.applied).toBe(true);
  const after = JSON.parse(fs.readFileSync(path, 'utf8'));
  expect(after.connection.config).toEqual(record.connection.config); expect(after.connection.disabled).toBe(true);
  expect(after.connection.runtime).toEqual(record.connection.runtime);
  expect(Buffer.from(JSON.parse(fs.readFileSync(result.backupPath!, 'utf8')).files[0].base64, 'base64')).toEqual(before);
  expect(applyIdentityMigration(plan).applied).toBe(false);
});
it.each(['content', 'inode', 'mode'])('rejects %s changes without metadata writes', change => {
  pi(); const before = fs.readFileSync(path), plan = preparePiIdentityMigration(root);
  if (change === 'content') fs.writeFileSync(extension, 'edited');
  if (change === 'inode') { fs.renameSync(extension, extension + '.old'); fs.writeFileSync(extension, 'owned fixture', { mode: 0o600 }); }
  if (change === 'mode') fs.chmodSync(extension, 0o644);
  expect(applyIdentityMigration(plan).applied).toBe(false); expect(fs.readFileSync(path)).toEqual(before);
});
it('migrates Claude ownership only with unchanged shared hooks and activation', () => {
  const config = join(root, 'config'); fs.mkdirSync(config, { mode: 0o700 });
  const hook = applyClaudeUserHook(prepareClaudeUserHook({ directory: config, command: '"/fixture/node" "/fixture/observer.cjs"' }));
  expect(hook).not.toBeNull();
  for (const [, stat] of hook!.directories) { stat.dev = 123; delete stat.volumeId; }
  const id = randomUUID(), directory = join(root, `claude-normal-${id}`);
  const store = new ClaudePresenceStore(directory, id, 'normal');
  expect(store.initialize({ executable: '/fixture/claude', files: { 'hook.json': JSON.stringify(hook), 'observer.cjs': 'fixture',
    'activation.json': '{"token":"keep-me"}', 'settings-before.json': '{}' } })).toBe(true);
  const settings = fs.readFileSync(join(config, 'settings.json')), activation = fs.readFileSync(join(directory, 'activation.json'));
  const plan = prepareClaudeIdentityMigration(directory, id);
  expect(applyIdentityMigration(plan).applied).toBe(true);
  expect(fs.readFileSync(join(config, 'settings.json'))).toEqual(settings);
  expect(fs.readFileSync(join(directory, 'activation.json'))).toEqual(activation);
  expect(new ClaudePresenceStore(directory, id, 'normal').verify()).toBe(true);
});
it('adds volume identity even when legacy device numbers still match and rejects stale metadata', () => {
  const record = pi();
  record.directory.dev = fs.lstatSync(join(root, 'pi-connection')).dev;
  record.connection.ownership.file.dev = fs.lstatSync(extension).dev;
  fs.writeFileSync(path, JSON.stringify(record));
  const plan = preparePiIdentityMigration(root);
  fs.writeFileSync(path, JSON.stringify({ ...record, host: 'edited' }));
  const edited = fs.readFileSync(path);
  expect(applyIdentityMigration(plan).applied).toBe(false); expect(fs.readFileSync(path)).toEqual(edited);
  fs.writeFileSync(path, JSON.stringify(record));
  expect(applyIdentityMigration(preparePiIdentityMigration(root)).applied).toBe(true);
  expect(JSON.parse(fs.readFileSync(path, 'utf8')).directory.volumeId).toBe('11111111-1111-1111-1111-111111111111');
});
it('migrates an empty legacy tombstone without reading target or runtime', () => {
  const record = pi();
  fs.rmSync(record.connection.target, { recursive: true });
  fs.writeFileSync(path, JSON.stringify({ ...record, connection: null }));
  const plan = preparePiIdentityMigration(root);
  expect(plan.runtimeMissing).toBe(false); expect(applyIdentityMigration(plan).applied).toBe(true);
  const migrated = JSON.parse(fs.readFileSync(path, 'utf8'));
  expect(migrated.connection).toBeNull(); expect(migrated.directory.volumeId).toBe('11111111-1111-1111-1111-111111111111');
});
it('rejects dangling pending symlinks without modifying metadata', () => {
  pi(); const before = fs.readFileSync(path);
  fs.symlinkSync(join(root, 'absent'), join(root, 'pi-connection/pending.json'));
  expect(() => preparePiIdentityMigration(root)).toThrow('migration-pending');
  expect(fs.readFileSync(path)).toEqual(before);
});
it('rejects an existing runtime symlink even when its destination has matching identity', () => {
  const record = pi(), runtime = `/tmp/ap-${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  fs.symlinkSync(record.connection.target, runtime);
  try {
    record.connection.config.endpoint = `${runtime}/p.sock`;
    fs.writeFileSync(path, JSON.stringify(record));
    expect(() => preparePiIdentityMigration(root)).toThrow('migration-runtime-directory');
  } finally { fs.unlinkSync(runtime); }
});
