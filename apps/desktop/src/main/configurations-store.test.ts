import { mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { ConfigurationsStore, configurationName } from './configurations-store.js';
import type { ConfigurationMetadata } from '../shared/configurations.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pet-meta-'))); roots.push(root);
  const record: ConfigurationMetadata = { id: '7016d7c4-5a27-4d49-b780-676cfd361cef', provider: 'pi', name: 'pi', targetPath: join(root, 'target'),
    installation: null, pet: { assetId: 'starter', name: '雪球' } };
  return { root, record, path: join(root, 'configurations.json') };
}
it('writes private bounded versioned metadata and supports a clean restart', async () => {
  const { root, record, path } = await fixture();
  const store = new ConfigurationsStore(root);
  expect(store.error).toBe(false); expect(store.save([record])).toBe(true);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect(new ConfigurationsStore(root).snapshot()).toEqual([record]);
  expect(configurationName('  雪球  ')).toBe('雪球');
  expect(configurationName('坏\n名称')).toBeNull();
  expect(configurationName('😺'.repeat(40))).not.toBeNull();
});
it('preserves externally edited records and exposes an invalid store instead of overwriting it', async () => {
  const { root, record, path } = await fixture();
  const store = new ConfigurationsStore(root); expect(store.save([record])).toBe(true);
  await writeFile(path, 'user edit');
  expect(store.save([])).toBe(false); expect(store.error).toBe(true);
  expect(await readFile(path, 'utf8')).toBe('user edit');
  expect(new ConfigurationsStore(root).error).toBe(true);
});
it('rejects symlinks, uncertain pending data and invalid/duplicate persisted records', async () => {
  const { root, record, path } = await fixture();
  const external = join(root, 'external'); await writeFile(external, 'retain'); await symlink(external, path);
  expect(new ConfigurationsStore(root).error).toBe(true); expect(await readFile(external, 'utf8')).toBe('retain');
  const other = await fixture(); await writeFile(join(other.root, 'configurations.pending.json'), 'unknown');
  expect(new ConfigurationsStore(other.root).error).toBe(true);
  const duplicate = await fixture();
  expect(new ConfigurationsStore(duplicate.root).save([record, record])).toBe(false);
  const secret = await fixture();
  await writeFile(secret.path, JSON.stringify({ version: 1, records: [{ ...secret.record, token: 'secret' }] }), { mode: 0o600 });
  expect(new ConfigurationsStore(secret.root).error).toBe(true);
});

it('rejects a legacy id with a different provider so it cannot reuse pi withdrawal capability', async () => {
  const { root, record, path } = await fixture();
  await writeFile(path, JSON.stringify({ version: 1, records: [{ ...record, id: 'legacy-pi', provider: 'codex' }] }), { mode: 0o600 });
  const before = await readFile(path, 'utf8');
  const store = new ConfigurationsStore(root);
  expect(store.error).toBe(true); expect(store.save([])).toBe(false);
  expect(await readFile(path, 'utf8')).toBe(before);
});
