import './test-support/mock-volume-queries.js';
import * as fs from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { PiExtensionUpdate } from './pi-extension-update.js';
import { PiTemporaryDeployment, saveStat } from './pi-temp-deployment.js';
import { PiConnectionStore } from './pi-connection-store.js';
vi.mock('node:fs/promises', async original => ({ ...await original<typeof import('node:fs/promises')>() }));
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'pet-update-')));
  const target = join(root, 'target'), data = join(root, 'data'), runtime = `/tmp/ap-${randomBytes(12).toString('hex')}`;
  await fs.mkdir(target, { mode: 0o700 }); await fs.mkdir(data, { mode: 0o700 }); await fs.mkdir(runtime, { mode: 0o700 });
  cleanups.push(async () => { await fs.rm(root, { recursive: true, force: true }); await fs.rm(runtime, { recursive: true, force: true }); });
  const settings = '{"packages":["kept-package"]}\n';
  await fs.writeFile(join(target, 'settings.json'), settings, { mode: 0o600 });
  const config = { endpoint: join(runtime, 'p.sock'), token: randomBytes(32).toString('hex') };
  const deployment = new PiTemporaryDeployment(target, config), applied = await deployment.apply(await deployment.preview());
  if (applied.status !== 'deployed') throw Error('fixture deployment');
  const path = applied.receipt.path, old = '// isolated previous extension\n';
  // Test-only older release receipt. No production adoption/repair path.
  await fs.writeFile(path, old, { mode: 0o600 });
  const saved = { target, config, runtime: saveStat(await fs.lstat(runtime)), disabled: false,
    ownership: { ...deployment.exportOwnership(applied.receipt), file: saveStat(await fs.lstat(path)), digest: createHash('sha256').update(old).digest('hex') } };
  const store = new PiConnectionStore(data); expect(store.save(saved)).toBe(true);
  await fs.writeFile(join(target, 'extensions', 'user.ts'), '// keep user extension\n', { mode: 0o600 });
  return { root, data, target, path, settings, saved, old, updater: new PiExtensionUpdate(data) };
}
it('updates only its owned artifact, keeps all configuration and restores via a fresh helper with valid ownership', async () => {
  const f = await fixture(), preview = await f.updater.preview();
  expect(preview.changed).toBe(true); expect(JSON.stringify(preview)).not.toContain(f.saved.config.token);
  expect(await f.updater.apply(preview)).toEqual({ status: 'updated', settingsUnchanged: true });
  const updated = new PiConnectionStore(f.data); expect(updated.error).toBe(false);
  const now = updated.snapshot()!;
  expect({ ...now, ownership: f.saved.ownership }).toEqual(f.saved);
  expect(now.ownership.digest).not.toBe(f.saved.ownership.digest);
  const deployment = new PiTemporaryDeployment(f.target, f.saved.config);
  expect(await deployment.matches(deployment.restoreOwnership(now.ownership))).toBe(true);
  expect(await fs.readFile(join(f.target, 'settings.json'), 'utf8')).toBe(f.settings);
  expect(await fs.readFile(join(f.target, 'extensions', 'user.ts'), 'utf8')).toBe('// keep user extension\n');
  expect(await fs.readFile(join(preview.backupDirectory, 'original.ts'), 'utf8')).toBe(f.old);
  expect((await fs.stat(preview.backupDirectory)).mode & 0o7777).toBe(0o700);
  expect((await fs.stat(join(preview.backupDirectory, 'original.ts'))).mode & 0o7777).toBe(0o600);
  expect(await f.updater.apply(preview)).toEqual({ status: 'refused' });
  const id = preview.backupDirectory.split('extension-update-').at(-1)!;
  expect(await new PiExtensionUpdate(f.data, id).restore()).toEqual({ status: 'restored', settingsUnchanged: true });
  expect(await fs.readFile(f.path, 'utf8')).toBe(f.old);
  const restored = new PiConnectionStore(f.data).snapshot()!;
  expect(await deployment.matches(deployment.restoreOwnership(restored.ownership))).toBe(true);
});
it.each(['artifact', 'settings', 'receipt'] as const)('refuses stale %s without changing the target', async kind => {
  const f = await fixture(), preview = await f.updater.preview();
  if (kind === 'artifact') await fs.writeFile(f.path, '// user changed');
  if (kind === 'settings') await fs.appendFile(join(f.target, 'settings.json'), ' ');
  if (kind === 'receipt') { const store = new PiConnectionStore(f.data); expect(store.save({ ...store.snapshot()!, disabled: true })).toBe(true); }
  const before = await fs.readFile(f.path);
  expect(await f.updater.apply(preview)).toEqual({ status: 'refused' });
  expect(await fs.readFile(f.path)).toEqual(before);
});
it('refuses an unowned artifact or an occupied receiver and never repairs or adopts it', async () => {
  const f = await fixture(); await fs.writeFile(f.saved.config.endpoint, 'unknown');
  await expect(f.updater.preview()).rejects.toThrow('Pi extension update preview refused');
  expect(await fs.readFile(f.path, 'utf8')).toBe(f.old);
  await fs.unlink(f.saved.config.endpoint); await fs.writeFile(f.path, '// edited');
  await expect(f.updater.preview()).rejects.toThrow('Pi extension update preview refused');
});
it('refuses symlink replacement and leaves the user file untouched', async () => {
  const f = await fixture(), preview = await f.updater.preview(), user = join(f.root, 'user.ts');
  await fs.writeFile(user, 'user file'); await fs.unlink(f.path); await fs.symlink(user, f.path);
  expect(await f.updater.apply(preview)).toEqual({ status: 'refused' });
  expect(await fs.readFile(user, 'utf8')).toBe('user file');
});
it('preserves backups and the original artifact on staging/rename failure', async () => {
  const f = await fixture(), preview = await f.updater.preview();
  vi.spyOn(fs, 'rename').mockRejectedValueOnce(Error('synthetic private error'));
  expect(await f.updater.apply(preview)).toEqual({ status: 'failed-preserved' });
  expect(await fs.readFile(f.path, 'utf8')).toBe(f.old);
  expect(await fs.readFile(join(preview.backupDirectory, 'original.ts'), 'utf8')).toBe(f.old);
});
it('preserves an uncertain publication without overwriting its receipt or silently rolling back', async () => {
  const f = await fixture(), preview = await f.updater.preview();
  vi.spyOn(PiConnectionStore.prototype, 'save').mockReturnValueOnce(false);
  expect(await f.updater.apply(preview)).toEqual({ status: 'failed-preserved' });
  expect(new PiConnectionStore(f.data).snapshot()).toEqual(f.saved);
  expect(await fs.readFile(f.path, 'utf8')).not.toBe(f.old);
  expect(await f.updater.restore()).toEqual({ status: 'refused' });
  expect(await fs.readFile(join(preview.backupDirectory, 'original.ts'), 'utf8')).toBe(f.old);
});
it.each(['original', 'current'] as const)('refuses rollback after %s is modified', async kind => {
  const f = await fixture(), preview = await f.updater.preview();
  expect((await f.updater.apply(preview)).status).toBe('updated');
  await fs.writeFile(kind === 'original' ? join(preview.backupDirectory, 'original.ts') : f.path, '// changed');
  const before = await fs.readFile(f.path);
  expect(await f.updater.restore()).toEqual({ status: 'refused' });
  expect(await fs.readFile(f.path)).toEqual(before);
});

it.each(['directory', 'journal', 'original'] as const)('rejects widened private %s permissions on restore', async kind => {
  const f = await fixture(), preview = await f.updater.preview();
  expect((await f.updater.apply(preview)).status).toBe('updated');
  const path = kind === 'directory' ? preview.backupDirectory : join(preview.backupDirectory, kind === 'journal' ? 'recovery.json' : 'original.ts');
  await fs.chmod(path, kind === 'directory' ? 0o755 : 0o644);
  const before = await fs.readFile(f.path);
  expect(['refused', 'failed-preserved']).toContain((await f.updater.restore()).status);
  expect(await fs.readFile(f.path)).toEqual(before);
});
it.each(['apply', 'restore'] as const)('rechecks receipt after staging during %s', async operation => {
  const f = await fixture(), preview = await f.updater.preview();
  if (operation === 'restore') expect((await f.updater.apply(preview)).status).toBe('updated');
  const originalOpen = fs.open;
  vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
    const file = await originalOpen(path, flags, mode);
    if (String(path).endsWith(operation === 'apply' ? '/next.ts' : '/restore.ts')) {
      const store = new PiConnectionStore(f.data);
      expect(store.save({ ...store.snapshot()!, disabled: true })).toBe(true);
    }
    return file;
  });
  const before = await fs.readFile(f.path);
  expect(operation === 'apply' ? await f.updater.apply(preview) : await f.updater.restore()).toEqual({ status: 'refused' });
  expect(await fs.readFile(f.path)).toEqual(before);
});

it('refuses a changed target binding before reading or writing that target', async () => {
  const f = await fixture();
  const updater = new PiExtensionUpdate(f.data, undefined, join(f.root, 'not-approved'));
  await expect(updater.preview()).rejects.toThrow('Pi extension update preview refused');
  expect(await fs.readFile(f.path, 'utf8')).toBe(f.old);
});
