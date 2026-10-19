import './test-support/mock-volume-queries.js';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import type { ObservationSink } from '@agent-pet/adapter-core';
import { Configurations } from './configurations.js';
import { ConfigurationsStore } from './configurations-store.js';
import { PiConnection } from './pi-connection.js';
import { PiConnectionStore } from './pi-connection-store.js';
import * as preflightFiles from './pi-preflight-files.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pet-configs-')));
  const directory = join(root, 'data'); await mkdir(directory, { mode: 0o700 });
  const target = join(root, 'target'); await mkdir(target, { mode: 0o700 });
  const other = join(root, 'other'); await mkdir(other, { mode: 0o700 });
  const sinks: ObservationSink[] = [], publish = vi.fn();
  const start = vi.fn(async (_config: unknown, sink: ObservationSink) => {
    sinks.push(sink); return { stop: vi.fn(async () => {}) };
  });
  const collection = new Configurations({ directory, adapter: () => ({ start }), publish });
  cleanups.push(async () => {
    await collection.stop();
    for (const [config] of start.mock.calls) {
      const endpoint = (config as { endpoint?: unknown }).endpoint;
      if (typeof endpoint === 'string' && /^\/tmp\/ap-[a-f0-9]{24}\/p\.sock$/.test(endpoint)) {
        await rm(dirname(endpoint), { recursive: true, force: true });
      }
    }
    await rm(root, { recursive: true, force: true });
  });
  return { root, directory, target, other, collection, sinks, publish, start,
    async create(name = '第一个 pi', targetPath = target) {
      const state = await collection.create({ name, provider: 'pi', targetPath }); expect(state.notice).toBe('none');
      return state.records.at(-1)!.id;
    },
  };
}

it('keeps distinct configurations, normalized duplicate blocking, and durable non-secret names and pet bindings', async () => {
  const f = await fixture(), first = await f.create(), second = await f.create('第二个 pi', f.other);
  expect(first).not.toBe(second); expect(f.start).not.toHaveBeenCalled();
  expect((await f.collection.create({ name: '重复', provider: 'pi', targetPath: join(f.target, '..', 'target') })).notice).toBe('duplicate');
  expect((await f.collection.rename(first, '   ')).notice).toBe('invalid');
  expect((await f.collection.rename(first, '长'.repeat(41))).notice).toBe('invalid');
  expect((await f.collection.rename(first, '  自定义 pi  ')).records[0]!.name).toBe('自定义 pi');
  expect((await f.collection.bindPet(first, { assetId: 'starter', name: '雪球' })).records[0]!.pet?.name).toBe('雪球');
  const saved = new ConfigurationsStore(f.directory).snapshot();
  expect(saved).toHaveLength(2); expect(saved[0]).toMatchObject({ id: first, name: '自定义 pi', pet: { assetId: 'starter', name: '雪球' } });
  expect(await readFile(join(f.directory, 'configurations.json'), 'utf8')).not.toMatch(/token|endpoint|transcript/);
});

it('honestly stores unsupported types without pretending to inspect, deploy or connect', async () => {
  const f = await fixture();
  const state = await f.collection.create({ name: 'Codex', provider: 'codex', targetPath: f.target });
  const id = state.records[0]!.id;
  expect(state.records[0]).toMatchObject({ availability: 'unsupported', connection: null, inspection: null });
  expect((await f.collection.inspect(id)).notice).toBe('unsupported');
  expect((await f.collection.preview(id)).notice).toBe('unsupported');
  expect((await f.collection.confirm(id, 'fake')).notice).toBe('unsupported');
  expect((await f.collection.remove(id)).records).toEqual([]); expect(f.start).not.toHaveBeenCalled();
});

it('separates inspection, explicit preview and connection state; namespaces identical pi sessions per configuration', async () => {
  const f = await fixture(), first = await f.create(), second = await f.create('第二个', f.other);
  expect((await f.collection.inspect(first)).records[0]).toMatchObject({ availability: 'available', connection: { status: 'not-configured' } });
  for (const id of [first, second]) {
    const preview = (await f.collection.preview(id)).records.find(record => record.id === id)!.connection!.preview!;
    expect(preview.action).toBe('create');
    const applied = await f.collection.confirm(id, preview.id);
    expect(applied.records.find(record => record.id === id)!.connection!.status).toBe('configured-waiting');
  }
  f.sinks.forEach(sink => {
    sink.connectionChanged('connected');
    sink.publish({ sessionId: 'identical-session', provider: 'pi', status: 'working', observedAt: '2026-10-14T00:00:00Z' });
  });
  expect(f.collection.snapshot().sessionConfigurations).toEqual({ [`${first}:identical-session`]: first, [`${second}:identical-session`]: second });
  expect(f.publish.mock.calls.map(call => call[0].sessionId)).toEqual([`${first}:identical-session`, `${second}:identical-session`]);
  expect((await f.collection.changeTarget(first, f.other)).notice).toBe('withdraw-first');
  // PiConnection state includes only opaque plans/paths; exact source has credentials, collection never does.
  const deployed = f.collection.snapshot().records[0]!.connection!.deployedPath!;
  const source = await readFile(deployed, 'utf8');
  const token = source.match(/[a-f0-9]{64}/)![0];
  expect(JSON.stringify(f.collection.snapshot())).not.toContain(token);
  for (const id of [first, second]) expect((await f.collection.remove(id)).notice).toBe('none');
  expect(f.collection.snapshot().records).toEqual([]);
});

it('removes only product metadata for undeployed records and preserves edited deployed files and the retry record', async () => {
  const f = await fixture();
  await writeFile(join(f.target, 'user.txt'), 'untouched');
  const undeployed = await f.create();
  expect((await f.collection.remove(undeployed)).busy).toBe(false);
  expect(await readFile(join(f.target, 'user.txt'), 'utf8')).toBe('untouched');
  const id = await f.create();
  const preview = (await f.collection.preview(id)).records[0]!.connection!.preview!;
  const applied = await f.collection.confirm(id, preview.id);
  const path = applied.records[0]!.connection!.deployedPath!;
  await writeFile(path, 'user edited extension');
  const retained = await f.collection.remove(id);
  expect(retained).toMatchObject({ notice: 'retained', busy: false });
  expect(retained.records).toHaveLength(1);
  expect(retained.records[0]!.connection).toMatchObject({ notice: 'retained-changed', saved: 'disabled', receiving: 'stopped' });
  expect(await readFile(path, 'utf8')).toBe('user edited extension');
  expect(new ConfigurationsStore(f.directory).snapshot()[0]!.id).toBe(id);
});

it('restores records and deployed ownership without starting listeners or automatically inspecting targets', async () => {
  const f = await fixture(), id = await f.create();
  const preview = (await f.collection.preview(id)).records[0]!.connection!.preview!;
  await f.collection.confirm(id, preview.id); await f.collection.stop();
  const start = vi.fn(async () => ({ stop: async () => {} }));
  const restored = new Configurations({ directory: f.directory, adapter: () => ({ start }), publish: vi.fn() });
  cleanups.push(async () => { await restored.stop(); });
  expect(restored.snapshot().records[0]).toMatchObject({ id, availability: 'unchecked', inspection: null,
    connection: { canResume: true, receiving: 'stopped', notice: 'resume-required' } });
  expect(start).not.toHaveBeenCalled();
  expect((await restored.remove(id)).records).toEqual([]);
});

it('cancels stale preview after a target change and blocks duplicate positions', async () => {
  const f = await fixture(), id = await f.create();
  const old = (await f.collection.preview(id)).records[0]!.connection!.preview!;
  expect((await f.collection.changeTarget(id, f.other)).notice).toBe('none');
  expect((await f.collection.confirm(id, old.id)).records[0]!.connection).toMatchObject({ notice: 'invalid-plan', deployedPath: null });
  expect(f.start).not.toHaveBeenCalled();
  await f.create('第二个', f.target);
  expect((await f.collection.changeTarget(id, f.target)).notice).toBe('duplicate');
});

it('returns save failure without optimistically renaming and blocks subsequent metadata writes', async () => {
  const f = await fixture(), id = await f.create();
  vi.spyOn(ConfigurationsStore.prototype, 'save').mockReturnValueOnce(false);
  expect((await f.collection.rename(id, '新名称')).notice).toBe('save-failed');
  expect(f.collection.snapshot().records[0]!.name).toBe('第一个 pi');
});

it('removes an obsolete restored legacy entry whose target is absent, and does not recreate it after restart', async () => {
  const f = await fixture();
  const store = new PiConnectionStore(f.directory);
  const target = () => ({ revision: 1, installations: [], selectedInstallation: null,
    target: { path: f.target, source: 'chosen' as const }, inspection: null, scan: 'not-run' as const, notice: 'none' as const });
  const connection = new PiConnection({ target, adapter: { start: f.start }, publish: f.publish, developmentEnvironment: false, store });
  const preview = await connection.preview(); await connection.confirm(preview.preview!.id); await connection.stop();
  const restored = new PiConnection({ target, adapter: { start: f.start }, publish: f.publish, developmentEnvironment: false,
    store: new PiConnectionStore(f.directory) });
  const legacy = new Configurations({ directory: f.directory, adapter: () => ({ start: f.start }), publish: f.publish,
    legacy: { connection: restored, targetPath: f.target } });
  cleanups.push(async () => legacy.stop());
  await legacy.rename('legacy-pi', '旧测试配置');
  await rm(f.target, { recursive: true });
  expect((await legacy.remove('legacy-pi')).records).toEqual([]);
  expect(new PiConnectionStore(f.directory).snapshot()).toBeNull();
  const restart = new Configurations({ directory: f.directory, adapter: () => ({ start: f.start }), publish: f.publish });
  cleanups.push(async () => restart.stop());
  expect(restart.snapshot().records).toEqual([]);
  expect((await readFile(join(f.directory, 'configurations.json'), 'utf8'))).not.toContain('legacy-pi');
});

it('represents the old connection by stable id, persists a binding, and never rewrites its credential store', async () => {
  const f = await fixture();
  const connection = new PiConnection({ target: () => ({ revision: 1, installations: [], selectedInstallation: null,
    target: { path: f.target, source: 'chosen' }, inspection: null, scan: 'not-run', notice: 'none' }),
    adapter: { start: f.start }, publish: f.publish, developmentEnvironment: true });
  const legacy = new Configurations({ directory: f.directory, adapter: () => ({ start: f.start }), publish: f.publish,
    legacy: { connection, targetPath: f.target } });
  cleanups.push(async () => { await legacy.stop(); });
  expect(legacy.snapshot().records[0]!.id).toBe('legacy-pi');
  legacy.registerLegacySession('previous-unprefixed-session');
  expect(legacy.snapshot().sessionConfigurations).toEqual({ 'previous-unprefixed-session': 'legacy-pi' });
  expect((await legacy.bindPet('legacy-pi', { assetId: 'starter', name: '已绑定' })).records[0]!.pet?.name).toBe('已绑定');
  expect((await legacy.bindPet('legacy-pi', null)).records[0]!.pet).toBeNull();
  expect((await legacy.changeTarget('legacy-pi', f.other)).notice).toBe('withdraw-first');
  expect((await legacy.remove('legacy-pi')).notice).toBe('retained');
  await expect(readFile(join(f.directory, 'pi-connection', 'connection.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('invalidates pending consent on window teardown and removes subscription callbacks', async () => {
  const f = await fixture(), id = await f.create();
  const listener = vi.fn(), unsubscribe = f.collection.subscribe(listener);
  const preview = (await f.collection.preview(id)).records[0]!.connection!.preview!;
  f.collection.invalidateAll();
  expect((await f.collection.confirm(id, preview.id)).records[0]!.connection!.notice).toBe('invalid-plan');
  expect(f.start).not.toHaveBeenCalled();
  unsubscribe(); const count = listener.mock.calls.length;
  await f.collection.rename(id, '之后'); expect(listener).toHaveBeenCalledTimes(count);
});

it('fails closed when restored configuration target disagrees with durable deployment ownership', async () => {
  const f = await fixture(), id = await f.create();
  const preview = (await f.collection.preview(id)).records[0]!.connection!.preview!;
  const deployed = (await f.collection.confirm(id, preview.id)).records[0]!.connection!.deployedPath!;
  await f.collection.stop();
  const metadataPath = join(f.directory, 'configurations.json');
  const ownershipPath = join(f.directory, `configuration-${id}`, 'pi-connection', 'connection.json');
  const record = JSON.parse(await readFile(metadataPath, 'utf8'));
  record.records[0].targetPath = f.other;
  await writeFile(metadataPath, JSON.stringify(record));
  const metadataBefore = await readFile(metadataPath, 'utf8'), ownershipBefore = await readFile(ownershipPath, 'utf8');
  const sourceBefore = await readFile(deployed, 'utf8');
  const inspect = vi.spyOn(preflightFiles, 'inspectTarget');
  const start = vi.fn(async () => ({ stop: async () => {} }));
  const restored = new Configurations({ directory: f.directory, adapter: () => ({ start }), publish: vi.fn() });
  cleanups.push(async () => { await restored.stop(); });
  expect(restored.snapshot()).toMatchObject({ notice: 'saved-invalid', records: [{ id, targetPath: f.other, availability: 'attention',
    connection: { status: 'failed', notice: 'saved-invalid', saved: 'invalid', deployedPath: null,
      canConfigure: false, canResume: false, canRemove: false, receiving: 'stopped' } }] });
  for (const operation of [restored.inspect(id), restored.preview(id), restored.confirm(id, preview.id),
    restored.resume(id), restored.remove(id), restored.changeTarget(id, f.target)]) {
    expect((await operation).notice).toBe('saved-invalid');
  }
  expect(start).not.toHaveBeenCalled(); expect(inspect).not.toHaveBeenCalled();
  expect(await readFile(metadataPath, 'utf8')).toBe(metadataBefore);
  expect(await readFile(ownershipPath, 'utf8')).toBe(ownershipBefore);
  expect(await readFile(deployed, 'utf8')).toBe(sourceBefore);
});

it('blocks same-record metadata changes, inspection and removal while consented deployment is pending', async () => {
  const f = await fixture(), id = await f.create();
  const preview = (await f.collection.preview(id)).records[0]!.connection!.preview!;
  let release!: () => void;
  f.start.mockImplementationOnce(async (_config, sink) => {
    f.sinks.push(sink); await new Promise<void>(resolve => { release = resolve; });
    return { stop: vi.fn(async () => {}) };
  });
  const confirming = f.collection.confirm(id, preview.id);
  await vi.waitFor(() => expect(f.start).toHaveBeenCalledOnce());
  const inspection = vi.spyOn(preflightFiles, 'inspectTarget');
  try {
    for (const operation of [f.collection.rename(id, '覆盖名称'), f.collection.changeTarget(id, f.other),
      f.collection.bindPet(id, { assetId: 'starter', name: '覆盖宠物' }), f.collection.remove(id), f.collection.inspect(id)]) {
      expect((await operation).notice).toBe('busy');
    }
    expect(inspection).not.toHaveBeenCalled();
    const otherId = await f.create('独立配置', f.other);
    expect(otherId).not.toBe(id);
    expect(f.collection.snapshot().records[0]).toMatchObject({ id, name: '第一个 pi', targetPath: f.target, pet: null });
  } finally { release(); await confirming; }
  expect((await f.collection.remove(id)).notice).toBe('none');
});

it('treats an exact owned deployment as available on refresh but preserves other findings and edited-file protection', async () => {
  const f = await fixture(), id = await f.create();
  const preview = (await f.collection.preview(id)).records[0]!.connection!.preview!;
  const deployed = (await f.collection.confirm(id, preview.id)).records[0]!.connection!.deployedPath!;
  const source = await readFile(deployed, 'utf8');
  expect((await f.collection.inspect(id)).records[0]).toMatchObject({ availability: 'available', inspection: { findings: [] } });
  expect(await readFile(deployed, 'utf8')).toBe(source);
  await writeFile(join(f.target, 'settings.json'), JSON.stringify({ extensions: ['disabled'] }));
  expect((await f.collection.inspect(id)).records[0]).toMatchObject({ availability: 'attention', inspection: { findings: ['settings-unknown'] } });
  await rm(join(f.target, 'settings.json'));
  await writeFile(deployed, 'user edit');
  expect((await f.collection.inspect(id)).records[0]).toMatchObject({ availability: 'attention', inspection: { findings: ['existing-extension'] } });
  expect((await f.collection.remove(id)).records[0]!.connection!.notice).toBe('retained-changed');
  expect(await readFile(deployed, 'utf8')).toBe('user edit');
});
