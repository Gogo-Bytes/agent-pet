import './test-support/mock-volume-queries.js';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { applyObservation, createSessionState } from '@agent-pet/domain';
import { CodexRegistrationStore } from './codex-registration-store.js';
import { CodexConnection, type CodexConnectionOptions } from './codex-connection.js';
import { Configurations } from './configurations.js';
import { projectHomePets } from '../renderer/management/home-projection.js';
import * as native from '../../../../integrations/codex-hooks/native-presence.js';
vi.mock('../../../../integrations/codex-hooks/native-presence.js', async original => ({ ...await original<typeof import('../../../../integrations/codex-hooks/native-presence.js')>() }));
const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn(); vi.restoreAllMocks(); });
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pet-codex-config-'))); fs.chmodSync(root, 0o700);
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = join(root, 'data'), target = join(root, 'config'); for (const folder of [data,target]) fs.mkdirSync(folder, { mode: 0o700 });
  fs.writeFileSync(join(target, 'config.toml'), 'token = "PRIVATE"\n', { mode: 0o600 });
  fs.writeFileSync(join(target, 'hooks.json'), '{"existing":true}', { mode: 0o600 });
  const servers: Parameters<typeof native.startCodexNativePresence>[0][] = [];
  vi.spyOn(native, 'startCodexNativePresence').mockImplementation(async options => {
    servers.push(options); return { url: 'http://127.0.0.1:12345/codex-native-presence', stop: async () => { options.onRetire('owned-host'); } };
  });
  const options: CodexConnectionOptions = { directory: data, targetDirectory: target,
    configurationId: '12345678-1234-4234-8234-123456789012', nodeExecutable: process.execPath, observerExecutable: process.execPath,
    probePath: '/owned/probe', runAsNode: false, chooseExecutable: async () => '/owned/codex', inspectExecutable: value => value,
    runtimeAssets: async () => ({ nativeHook: '// own fixture only' }), name: () => 'Codex', publish: vi.fn() };
  return { root, data, target, options, servers };
}
it('previews without writes, confirms additively, persists pause, restores with rotation and selectively withdraws', async () => {
  const f = fixture(); let connection = new CodexConnection(f.options); cleanups.push(() => connection.stop());
  const before = fs.readFileSync(join(f.target, 'hooks.json'), 'utf8');
  const preview = (await connection.preview()).preview!;
  expect(preview.canApply).toBe(true); expect(fs.readFileSync(join(f.target, 'hooks.json'), 'utf8')).toBe(before);
  expect((await connection.confirm(preview.id)).status).toBe('waiting'); expect(f.servers).toHaveLength(1);
  expect(fs.readFileSync(join(f.target, 'config.toml'), 'utf8')).toBe('token = "PRIVATE"\n');
  const installed = fs.readFileSync(join(f.target, 'hooks.json'), 'utf8');
  await connection.disable(); await connection.stop(); connection = new CodexConnection(f.options); await connection.restore();
  expect(connection.snapshot().status).toBe('disabled'); expect(f.servers).toHaveLength(1);
  await connection.resume(); expect(connection.snapshot().status).toBe('waiting'); expect(f.servers).toHaveLength(2);
  expect(fs.readFileSync(join(f.target, 'hooks.json'), 'utf8')).toBe(installed);
  expect(JSON.stringify(connection.snapshot())).not.toMatch(/PRIVATE|activation|token|owned-host/);
  fs.writeFileSync(join(f.target, 'hooks.json'), installed.replace('"existing":true', '"existing":"LATER"'));
  expect(await connection.remove()).toBe(true);
  expect(JSON.parse(fs.readFileSync(join(f.target, 'hooks.json'), 'utf8'))).toEqual({ existing: 'LATER' });
});
it('feeds independent configuration identities through shared sessions/Home and clears them on pause', async () => {
  const f = fixture(); let sessions = createSessionState();
  const collection = new Configurations({ directory: f.data, adapter: () => ({ start: vi.fn() }),
    codex: f.options, publish: observation => { sessions = applyObservation(sessions, observation); } });
  cleanups.push(() => collection.stop()); const ids: string[] = [];
  for (let index = 0; index < 2; index++) {
    const targetPath = join(f.root, `codex-${index}`); fs.mkdirSync(targetPath, { mode: 0o700 });
    const created = await collection.create({ provider: 'codex', name: `Codex ${index}`, targetPath });
    const id = created.records.at(-1)!.id; ids.push(id);
    await collection.bindPet(id, { assetId: 'starter', name: '团子' });
    expect(projectHomePets(collection.snapshot(), sessions, '团子')).toHaveLength(index);
    const preview = (await collection.preview(id)).records.at(-1)!.codex!.preview!;
    await collection.confirm(id, preview.id); const server = f.servers[index]!;
    server.onFact({ runId: 'owned-host', fact: { kind: 'session-started', source: 'startup', providerSessionId: 'PRIVATE_SESSION' } });
    server.onChange?.({ observedHosts: 1, observedSessions: 1 });
    const cue = collection.snapshot().records[index]!.connectionCue;
    expect(cue).toEqual(expect.any(String));
    server.onChange?.({ observedHosts: 1, observedSessions: 2 });
    server.onChange?.({ observedHosts: 1, observedSessions: 1 });
    expect(collection.snapshot().records[index]!.connectionCue).toBe(cue);
  }
  expect(projectHomePets(collection.snapshot(), sessions, '团子').map(pet => pet.id)).toEqual(ids);
  expect(JSON.stringify(sessions)).not.toContain('PRIVATE_SESSION');
  expect(Object.values(collection.snapshot().sessionConfigurations)).toEqual(ids);
  const cues = collection.snapshot().records.map(record => record.connectionCue);
  expect(new Set(cues).size).toBe(2);
  await collection.disable(ids[0]!);
  expect(projectHomePets(collection.snapshot(), sessions, '团子').map(pet => pet.id)).toEqual([ids[1]]);
  await collection.rename(ids[1]!, '新名称'); expect(collection.snapshot().records[1]!.name).toBe('新名称');
  expect(collection.snapshot().records[0]!.connectionCue).toBeUndefined();
  expect(collection.snapshot().records[1]!.connectionCue).toBe(cues[1]);
});
it('invalidates a cancelled picker and refuses user-edited hooks on restart/remove', async () => {
  const f = fixture(); let select!: (path: string) => void;
  const deferred = new CodexConnection({ ...f.options, chooseExecutable: () => new Promise(done => { select = done; }) });
  const pending = deferred.preview(); deferred.invalidate(); select('/owned/codex'); await pending;
  expect(deferred.snapshot()).toMatchObject({ busy: false, preview: null, configured: false }); await deferred.stop();
  let connection = new CodexConnection(f.options); const preview = (await connection.preview()).preview!;
  await connection.confirm(preview.id); await connection.stop();
  const path = join(f.target, 'hooks.json'), changed = fs.readFileSync(path, 'utf8').replace('"timeout":2', '"timeout":99'); fs.writeFileSync(path, changed);
  connection = new CodexConnection(f.options); cleanups.push(() => connection.stop()); await connection.restore();
  expect(connection.snapshot()).toMatchObject({ status: 'failed', notice: 'saved-invalid' });
  expect(await connection.remove()).toBe(false); expect(fs.readFileSync(path, 'utf8')).toBe(changed);
});
it('preserves edited app-private registration evidence and refuses restoring an interrupted write', async () => {
  const f = fixture(); let connection = new CodexConnection(f.options); const preview = (await connection.preview()).preview!;
  await connection.confirm(preview.id); await connection.stop();
  const saved = join(f.data, `codex-registration-${f.options.configurationId}`), file = join(saved, 'state.json');
  const original = fs.readFileSync(file, 'utf8'), hooks = fs.readFileSync(join(f.target, 'hooks.json'), 'utf8');
  fs.writeFileSync(file, original.replace('"disabled":false', '"disabled":true'));
  connection = new CodexConnection(f.options); await connection.restore();
  expect(connection.snapshot()).toMatchObject({ status: 'failed', notice: 'saved-invalid', canConfigure: false, canResume: false });
  expect(await connection.remove()).toBe(false); await connection.stop();
  fs.writeFileSync(file, original); fs.writeFileSync(join(saved, '.pending'), '', { mode: 0o600 });
  connection = new CodexConnection(f.options); await connection.restore();
  expect(connection.snapshot().status).toBe('failed'); expect(fs.readFileSync(join(f.target, 'hooks.json'), 'utf8')).toBe(hooks);
  await connection.stop();
});

it('does not adopt a concurrent private state edit as the overwrite baseline', async () => {
  const f = fixture(); const connection = new CodexConnection(f.options);
  const plan = (await connection.preview()).preview!; await connection.confirm(plan.id); await connection.stop();
  const directory = join(f.data, `codex-registration-${f.options.configurationId}`), path = join(directory, 'state.json');
  const original = fs.readFileSync(path, 'utf8'), edited = original.replace('"removed":false', '"removed":true');
  const store = new CodexRegistrationStore(directory, f.options.configurationId, f.target), read = store.read.bind(store);
  vi.spyOn(store, 'read').mockImplementationOnce(() => { const validated = read(); fs.writeFileSync(path, edited); return validated; });
  expect(store.update(true)).toBe(false);
  expect(fs.readFileSync(path, 'utf8')).toBe(edited);
});
