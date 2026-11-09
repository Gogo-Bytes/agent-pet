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
import * as protectedJson from './protected-json-file.js';
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
    probePath: '/owned/probe', runAsNode: false, inspectExecutable: value => value,
    runtimeAssets: async () => ({ nativeHook: '// own fixture only' }), name: () => 'Codex', publish: vi.fn() };
  return { root, data, target, options, servers, discover: async () => '/owned/codex' };
}
it('previews without writes, confirms additively, persists pause, restores with rotation and selectively withdraws', async () => {
  const f = fixture(); let connection = new CodexConnection(f.options); cleanups.push(() => connection.stop());
  fs.writeFileSync(join(f.target, 'hooks.json'), '{"existing":true,"hooks":{"Stop":[{"hooks":[{"type":"command","command":"PRIVATE_EXISTING_COMMAND"}]}]}}');
  const before = fs.readFileSync(join(f.target, 'hooks.json'), 'utf8');
  const preview = (await connection.preview(f.discover)).preview!;
  expect(preview.addition).toEqual({ hooks: [{ type: 'command', command: '[Agent Pet 私有观察程序与参数（已隐藏）]', timeout: 2 }] });
  expect(JSON.stringify(preview)).not.toMatch(/PRIVATE|activation|token|observer\.cjs|codex-normal-/);
  expect(fs.readdirSync(f.data)).toEqual([]);
  expect(preview.canApply).toBe(true); expect(fs.readFileSync(join(f.target, 'hooks.json'), 'utf8')).toBe(before);
  expect((await connection.confirm(preview.id)).status).toBe('waiting'); expect(f.servers).toHaveLength(1);
  expect(fs.readFileSync(join(f.target, 'config.toml'), 'utf8')).toBe('token = "PRIVATE"\n');
  const installed = fs.readFileSync(join(f.target, 'hooks.json'), 'utf8');
  const hooks = JSON.parse(installed).hooks;
  expect(Object.keys(hooks).sort()).toEqual([...preview.events].sort());
  for (const event of preview.events) expect({ ...hooks[event].at(-1).hooks[0], command: preview.addition!.hooks[0]!.command }).toEqual(preview.addition!.hooks[0]);
  await connection.disable(); await connection.stop(); connection = new CodexConnection(f.options); await connection.restore();
  expect(connection.snapshot().status).toBe('disabled'); expect(f.servers).toHaveLength(1);
  await connection.resume(); expect(connection.snapshot().status).toBe('waiting'); expect(f.servers).toHaveLength(2);
  expect(fs.readFileSync(join(f.target, 'hooks.json'), 'utf8')).toBe(installed);
  expect(JSON.stringify(connection.snapshot())).not.toMatch(/PRIVATE|activation|token|owned-host/);
  fs.writeFileSync(join(f.target, 'hooks.json'), installed.replace('"existing":true', '"existing":"LATER"'));
  expect(await connection.remove()).toBe(true);
  expect(fs.readFileSync(join(f.target, 'hooks.json'), 'utf8')).toBe(before.replace('"existing":true', '"existing":"LATER"'));
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
    const preview = (await collection.previewDetectedCodex(id, f.discover)).records.at(-1)!.codex!.preview!;
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
it('invalidates cancelled discovery and refuses user-edited hooks on restart/remove', async () => {
  const f = fixture(); let select!: (path: string) => void;
  const deferred = new CodexConnection(f.options);
  const pending = deferred.preview(() => new Promise(done => { select = done; })); deferred.invalidate(); select('/owned/codex'); await pending;
  expect(deferred.snapshot()).toMatchObject({ busy: false, preview: null, configured: false }); await deferred.stop();
  let connection = new CodexConnection(f.options); const preview = (await connection.preview(f.discover)).preview!;
  await connection.confirm(preview.id); await connection.stop();
  const path = join(f.target, 'hooks.json'), changed = fs.readFileSync(path, 'utf8').replace('"timeout":2', '"timeout":99'); fs.writeFileSync(path, changed);
  connection = new CodexConnection(f.options); cleanups.push(() => connection.stop()); await connection.restore();
  expect(connection.snapshot()).toMatchObject({ status: 'failed', notice: 'saved-invalid' });
  expect(await connection.remove()).toBe(false); expect(fs.readFileSync(path, 'utf8')).toBe(changed);
});
it('preserves edited app-private registration evidence and refuses restoring an interrupted write', async () => {
  const f = fixture(); let connection = new CodexConnection(f.options); const preview = (await connection.preview(f.discover)).preview!;
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
  const plan = (await connection.preview(f.discover)).preview!; await connection.confirm(plan.id); await connection.stop();
  const directory = join(f.data, `codex-registration-${f.options.configurationId}`), path = join(directory, 'state.json');
  const original = fs.readFileSync(path, 'utf8'), edited = original.replace('"removed":false', '"removed":true');
  const store = new CodexRegistrationStore(directory, f.options.configurationId, f.target), read = store.read.bind(store);
  vi.spyOn(store, 'read').mockImplementationOnce(() => { const validated = read(); fs.writeFileSync(path, edited); return validated; });
  expect(store.update(true)).toBe(false);
  expect(fs.readFileSync(path, 'utf8')).toBe(edited);
});
it('rejects unsupported discovered executables and changed host selection without writing', async () => {
  const f = fixture();
  const unsupported = new CodexConnection({ ...f.options, inspectExecutable: () => null });
  expect(await unsupported.preview(f.discover)).toMatchObject({ notice: 'unsupported-installation', preview: null });
  await unsupported.stop();
  const connection = new CodexConnection(f.options); cleanups.push(() => connection.stop());
  const plan = (await connection.preview(f.discover)).preview!;
  const daemon = join(f.target, 'packages/app-server-daemon/current');
  fs.mkdirSync(daemon, { recursive: true, mode: 0o700 });
  expect(await connection.confirm(plan.id)).toMatchObject({ notice: 'rescan-required', configured: false, preview: null });
  expect(fs.existsSync(join(f.data, `codex-registration-${f.options.configurationId}`))).toBe(false);
  expect(fs.readFileSync(join(f.target, 'hooks.json'), 'utf8')).toBe('{"existing":true}');
});

it.each(['target', 'hooks', 'same-bytes', 'during-read'] as const)('requires rescan before private writes when preview %s evidence changes', async change => {
  const f = fixture(), connection = new CodexConnection(f.options); cleanups.push(() => connection.stop());
  const path = join(f.target, 'hooks.json'), original = fs.readFileSync(path, 'utf8');
  const plan = (await connection.preview(f.discover)).preview!;
  if (change === 'target') {
    fs.renameSync(f.target, join(f.root, 'original-target')); fs.mkdirSync(f.target, { mode: 0o700 });
    fs.writeFileSync(path, original, { mode: 0o600 });
  } else if (change === 'hooks') fs.writeFileSync(path, '{"concurrent":"PRIVATE"}');
  else if (change === 'during-read') {
    const read = protectedJson.readSource;
    vi.spyOn(protectedJson, 'readSource').mockImplementationOnce(context => {
      fs.renameSync(path, join(f.target, 'original-hooks')); fs.writeFileSync(path, original, { mode: 0o600 });
      return read(context);
    });
  } else { fs.renameSync(path, join(f.target, 'original-hooks')); fs.writeFileSync(path, original, { mode: 0o600 }); }
  const before = fs.readFileSync(path, 'utf8');
  expect(await connection.confirm(plan.id)).toMatchObject({ notice: 'rescan-required', configured: false, preview: null, canConfigure: true });
  expect(fs.readFileSync(path, 'utf8')).toBe(before);
  expect(fs.readdirSync(f.data)).toEqual([]); expect(f.servers).toHaveLength(0);
  if (change === 'target') expect(fs.readFileSync(join(f.root, 'original-target/hooks.json'), 'utf8')).toBe(original);
  expect(await connection.preview()).toMatchObject({ notice: 'rescan-required', preview: null });
  expect((await connection.preview(f.discover)).preview?.canApply).toBe(true);
  expect(fs.readdirSync(f.data)).toEqual([]);
});

it('rejects target changes during asynchronous preview without writing private material', async () => {
  const f = fixture();
  f.options.runtimeAssets = async () => {
    fs.renameSync(f.target, join(f.root, 'original-target')); fs.mkdirSync(f.target, { mode: 0o700 });
    fs.writeFileSync(join(f.target, 'hooks.json'), '{"new":true}', { mode: 0o600 });
    return { nativeHook: '// fixture only' };
  };
  const connection = new CodexConnection(f.options); cleanups.push(() => connection.stop());
  expect(await connection.preview(f.discover)).toMatchObject({ notice: 'rescan-required', preview: null, configured: false });
  expect(fs.readFileSync(join(f.target, 'hooks.json'), 'utf8')).toBe('{"new":true}');
  expect(fs.readdirSync(f.data)).toEqual([]);
});

it('preserves private material and concurrent hooks when evidence changes during observer initialization', async () => {
  const f = fixture(), stopped = vi.fn(async () => {});
  f.options.startBridge = async () => {
    fs.renameSync(f.target, join(f.root, 'original-target')); fs.mkdirSync(f.target, { mode: 0o700 });
    fs.writeFileSync(join(f.target, 'hooks.json'), '{"concurrent":true}', { mode: 0o600 });
    return { activation: '{"synthetic":"PRIVATE"}', stop: stopped };
  };
  const connection = new CodexConnection(f.options); cleanups.push(() => connection.stop());
  const plan = (await connection.preview(f.discover)).preview!;
  expect(await connection.confirm(plan.id)).toMatchObject({ notice: 'rescan-required', configured: true, status: 'failed', preview: null });
  expect(stopped).toHaveBeenCalled();
  expect(fs.readFileSync(join(f.target, 'hooks.json'), 'utf8')).toBe('{"concurrent":true}');
  expect(fs.readFileSync(join(f.root, 'original-target/hooks.json'), 'utf8')).toBe('{"existing":true}');
  const registration = join(f.data, `codex-registration-${f.options.configurationId}`);
  expect(JSON.parse(fs.readFileSync(join(registration, 'state.json'), 'utf8')).disabled).toBe(true);
  expect(fs.readdirSync(join(f.data, `codex-normal-${f.options.configurationId}`)).sort()).toEqual(['activation.json', 'hook.json', 'observer.cjs', 'receipt.json']);
  expect(JSON.stringify(connection.snapshot())).not.toMatch(/PRIVATE|activation|token|observer\.cjs/);
});

it.each(['pending', 'io'] as const)('does not label an uncertain %s failure stale or write private materials', async failure => {
  const f = fixture(), connection = new CodexConnection(f.options); cleanups.push(() => connection.stop());
  const plan = (await connection.preview(f.discover)).preview!;
  const pending = join(f.target, 'hooks.agent-pet.pending.json');
  if (failure === 'pending') fs.writeFileSync(pending, 'UNKNOWN_PENDING', { mode: 0o600 });
  else vi.spyOn(protectedJson, 'readSource').mockImplementationOnce(() => { throw Object.assign(new Error(), { code: 'EIO' }); });
  expect(await connection.confirm(plan.id)).toMatchObject({ notice: 'save-failed', configured: false, preview: null });
  expect(fs.readFileSync(join(f.target, 'hooks.json'), 'utf8')).toBe('{"existing":true}');
  expect(fs.readdirSync(f.data)).toEqual([]); expect(f.servers).toHaveLength(0);
  if (failure === 'pending') expect(fs.readFileSync(pending, 'utf8')).toBe('UNKNOWN_PENDING');
});

it('retains unknown runtime files and disabled registration on an initialization failure, not a rescan', async () => {
  const f = fixture(), connection = new CodexConnection(f.options); cleanups.push(() => connection.stop());
  const plan = (await connection.preview(f.discover)).preview!;
  const runtime = join(f.data, `codex-normal-${f.options.configurationId}`);
  fs.mkdirSync(runtime, { mode: 0o700 }); fs.writeFileSync(join(runtime, 'unknown'), 'UNKNOWN_PRIVATE', { mode: 0o600 });
  expect(await connection.confirm(plan.id)).toMatchObject({ notice: 'save-failed', configured: true, status: 'failed' });
  expect(fs.readdirSync(runtime)).toEqual(['unknown']);
  expect(fs.readFileSync(join(runtime, 'unknown'), 'utf8')).toBe('UNKNOWN_PRIVATE');
  const registration = join(f.data, `codex-registration-${f.options.configurationId}`);
  expect(JSON.parse(fs.readFileSync(join(registration, 'state.json'), 'utf8')).disabled).toBe(true);
  expect(fs.readFileSync(join(f.target, 'hooks.json'), 'utf8')).toBe('{"existing":true}');
  expect(f.servers).toHaveLength(0);
});
