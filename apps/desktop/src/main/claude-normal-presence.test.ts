import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { ClaudeNormalPresence, type ClaudeNormalPresenceOptions } from './claude-normal-presence.js';
import { Configurations } from './configurations.js';
import { ClaudePresenceStore } from './claude-presence-store.js';
import { prepareClaudeUserHook, applyClaudeUserHook, CLAUDE_USER_HOOK_EVENTS } from './claude-user-hook.js';
import * as nativePresence from '../../../../integrations/claude-hooks/native-presence.js';

vi.mock('../../../../integrations/claude-hooks/native-presence.js', async original => {
  const module = await original<typeof import('../../../../integrations/claude-hooks/native-presence.js')>();
  return { ...module, startClaudeNativePresenceServer: (options: Parameters<typeof module.startClaudeNativePresenceServer>[0]) =>
    // Controller filesystem tests do not execute their placeholder native helper.
    // Real helper startup and ancestry stay covered by native-presence.test.ts.
    module.startClaudeNativePresenceServer({ ...options, probe: async () => null }) };
});
vi.mock('node:fs', async original => ({ ...await original<typeof import('node:fs')>() }));

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.restoreAllMocks(); });
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pet-claude-normal-'))); fs.chmodSync(root, 0o700);
  const directory = join(root, 'data'), targetDirectory = join(root, 'claude');
  fs.mkdirSync(directory, { mode: 0o700 }); fs.mkdirSync(targetDirectory, { mode: 0o700 });
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = join(targetDirectory, 'settings.json');
  const original = '{\n "unknown": 9007199254740993123456789, "hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"original-hook"}]}]}\n}\n';
  fs.writeFileSync(settings, original, { mode: 0o600 });
  const options: ClaudeNormalPresenceOptions = { directory, configurationId: randomUUID(), targetDirectory,
    nodeExecutable: process.execPath, observerExecutable: fs.realpathSync(process.execPath), probePath: '/owned/process-probe',
    runAsNode: false, runtimeAssets: async () => ({ nativeHook: '// isolated hook fixture' }),
    chooseExecutable: async () => '/owned/claude.exe', inspectExecutable: path => path };
  const controller = new ClaudeNormalPresence(options); cleanups.push(() => controller.stop());
  const owned = join(directory, `claude-normal-${options.configurationId}`);
  return { root, options, controller, owned, settings, original,
    async configure() { const preview = (await controller.preview()).preview!; expect(preview.settings?.canApply).toBe(true); return controller.confirm(preview.id); } };
}

it('previews exact additive settings change, then normal launch needs no public wrapper or credential', async () => {
  const f = fixture(), preview = (await f.controller.preview()).preview!;
  expect(preview.settings).toMatchObject({ path: f.settings, exists: true, canApply: true });
  expect(fs.readFileSync(f.settings, 'utf8')).toBe(f.original); expect(fs.existsSync(f.owned)).toBe(false);
  const state = await f.controller.confirm(preview.id);
  expect(state).toMatchObject({ mode: 'normal-start', status: 'waiting', configured: true, launchCommand: null, observedRuns: 0 });
  const changed = fs.readFileSync(f.settings, 'utf8');
  expect(changed).toContain('9007199254740993123456789'); expect(changed).toContain('original-hook');
  expect(fs.readFileSync(join(f.owned, 'settings-before.json'), 'utf8')).toBe(f.original);
  expect(fs.statSync(join(f.owned, 'settings-before.json')).mode & 0o777).toBe(0o600);
  expect(JSON.parse(changed).hooks.SessionStart).toHaveLength(2);
  expect(Object.keys(JSON.parse(changed).hooks)).toEqual(CLAUDE_USER_HOOK_EVENTS);
  expect(state.scope).toBe('task-events');
  const secret = JSON.parse(fs.readFileSync(join(f.owned, 'activation.json'), 'utf8'));
  expect(JSON.stringify(state)).not.toContain(secret.token); expect(changed).not.toContain(secret.token);
  expect(changed).not.toContain(secret.url); expect(JSON.stringify(state)).not.toContain('original-hook');
});

async function legacyFixture() {
  const f = fixture(); await f.controller.stop();
  const command = `'${f.options.nodeExecutable}' '${join(f.owned, 'observer.cjs')}' '${join(f.owned, 'activation.json')}'`;
  const plan = prepareClaudeUserHook({ directory: f.options.targetDirectory, command });
  const store = new ClaudePresenceStore(f.owned, f.options.configurationId, 'normal');
  expect(store.initialize({ executable: '/owned/claude.exe', files: { 'observer.cjs': '// old installed source',
    'activation.json': '{}', 'hook.json': JSON.stringify(plan.ownership), 'settings-before.json': f.original } })).toBe(true);
  expect(applyClaudeUserHook(plan)?.schemaVersion).toBe(1);
  const controller = new ClaudeNormalPresence(f.options); cleanups.push(() => controller.stop());
  return { ...f, controller };
}

it('restores schema1 as presence only without replacing stored source or updating shared settings', async () => {
  const f = await legacyFixture(), before = fs.readFileSync(f.settings, 'utf8');
  const assets = vi.spyOn(f.options, 'runtimeAssets');
  await f.controller.restore();
  expect(f.controller.snapshot()).toMatchObject({ status: 'waiting', scope: 'presence-only', canUpgrade: true });
  expect(assets).not.toHaveBeenCalled(); expect(fs.readFileSync(join(f.owned, 'observer.cjs'), 'utf8')).toBe('// old installed source');
  expect(fs.readFileSync(f.settings, 'utf8')).toBe(before); expect(fs.existsSync(join(f.owned, 'upgrade-before.json'))).toBe(false);
});

it('previews a legacy task upgrade with exact files/events and cancels without mutating either source', async () => {
  const f = await legacyFixture(); await f.controller.restore();
  const settings = fs.readFileSync(f.settings, 'utf8'), observer = fs.readFileSync(join(f.owned, 'observer.cjs'), 'utf8');
  const choose = vi.spyOn(f.options, 'chooseExecutable'), preview = (await f.controller.preview()).preview!;
  expect(choose).not.toHaveBeenCalled(); expect(preview.operation).toBe('upgrade'); expect(preview.events).toEqual(CLAUDE_USER_HOOK_EVENTS);
  expect(preview.files).toContain(join(f.owned, 'upgrade-before.json')); expect(preview.files).not.toContain(join(f.owned, 'settings-before.json'));
  expect(preview.settings).toMatchObject({ path: f.settings, canApply: true });
  f.controller.invalidate(); expect((await f.controller.confirm(preview.id)).notice).toBe('stale-preview');
  expect(f.controller.snapshot()).toMatchObject({ scope: 'presence-only', status: 'waiting', canUpgrade: true });
  expect(fs.readFileSync(f.settings, 'utf8')).toBe(settings); expect(fs.readFileSync(join(f.owned, 'observer.cjs'), 'utf8')).toBe(observer);
  expect(fs.existsSync(join(f.owned, 'upgrade-before.json'))).toBe(false);
});

it('explicitly upgrades source and registration, preserves the original backup, restores tasks and withdraws only owned groups', async () => {
  const f = await legacyFixture(), before = fs.readFileSync(f.settings, 'utf8');
  await f.controller.restore(); const preview = (await f.controller.preview()).preview!;
  const state = await f.controller.confirm(preview.id);
  expect(state).toMatchObject({ status: 'waiting', scope: 'task-events', canUpgrade: false });
  expect(fs.readFileSync(join(f.owned, 'observer.cjs'), 'utf8')).toBe('// isolated hook fixture');
  expect(fs.readFileSync(join(f.owned, 'settings-before.json'), 'utf8')).toBe(f.original);
  const backup = JSON.parse(fs.readFileSync(join(f.owned, 'upgrade-before.json'), 'utf8'));
  expect(backup.materials['observer.cjs']).toBe('// old installed source');
  expect(JSON.parse(backup.materials['hook.json']).schemaVersion).toBe(1);
  expect(JSON.parse(fs.readFileSync(f.settings, 'utf8')).hooks.SessionStart).toEqual(JSON.parse(before).hooks.SessionStart);
  expect(JSON.parse(fs.readFileSync(join(f.owned, 'hook.json'), 'utf8')).schemaVersion).toBe(2);
  await f.controller.stop();
  const restored = new ClaudeNormalPresence(f.options); cleanups.push(() => restored.stop()); await restored.restore();
  expect(restored.snapshot()).toMatchObject({ scope: 'task-events', status: 'waiting', canUpgrade: false });
  const changed = fs.readFileSync(f.settings, 'utf8').replace('"unknown":', '"later":"user edit","unknown":'); fs.writeFileSync(f.settings, changed);
  expect(await restored.remove()).toBe(true);
  expect(fs.readFileSync(f.settings, 'utf8')).toBe(f.original.replace('"unknown":', '"later":"user edit","unknown":'));
  expect(fs.existsSync(join(f.owned, 'upgrade-before.json'))).toBe(true);
});

it('retains source recovery and prospective ownership when settings change after upgrade preview', async () => {
  const f = await legacyFixture(), preview = (await f.controller.preview()).preview!;
  const changed = fs.readFileSync(f.settings, 'utf8').replace('"unknown":', '"later":"user edit","unknown":'); fs.writeFileSync(f.settings, changed);
  expect(await f.controller.confirm(preview.id)).toMatchObject({ scope: 'presence-only', status: 'failed', notice: 'save-failed' });
  expect(fs.readFileSync(f.settings, 'utf8')).toBe(changed); expect(fs.readFileSync(join(f.owned, 'settings-before.json'), 'utf8')).toBe(f.original);
  expect(JSON.parse(fs.readFileSync(join(f.owned, 'hook.json'), 'utf8')).schemaVersion).toBe(2);
  expect(fs.existsSync(join(f.owned, 'upgrade-before.json'))).toBe(true);
  expect(await f.controller.remove()).toBe(false); expect(fs.readFileSync(f.settings, 'utf8')).toBe(changed);
});

it('preserves partial private upgrade writes and does not apply hooks or report task mode', async () => {
  const f = await legacyFixture(), preview = (await f.controller.preview()).preview!, before = fs.readFileSync(f.settings, 'utf8');
  const rename = fs.renameSync;
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => { if (to === join(f.owned, 'observer.cjs')) throw new Error('fixture'); rename(from, to); });
  expect(await f.controller.confirm(preview.id)).toMatchObject({ status: 'failed', scope: 'presence-only', notice: 'save-failed' });
  expect(fs.readFileSync(f.settings, 'utf8')).toBe(before);
  expect(fs.existsSync(join(f.owned, 'upgrade-before.json'))).toBe(true); expect(fs.existsSync(join(f.owned, 'observer.cjs.pending'))).toBe(true);
  expect(JSON.parse(fs.readFileSync(join(f.owned, 'hook.json'), 'utf8')).schemaVersion).toBe(2);
  await f.controller.stop(); const restored = new ClaudeNormalPresence(f.options); cleanups.push(() => restored.stop());
  await restored.restore(); expect(restored.snapshot()).toMatchObject({ status: 'failed', scope: 'presence-only', notice: 'saved-invalid' });
});

it('forwards task facts and retires every forwarded run after observation epoch invalidation', async () => {
  const onFact = vi.fn(), onRetire = vi.fn();
  let callbacks!: Parameters<typeof nativePresence.startClaudeNativePresenceServer>[0];
  vi.spyOn(nativePresence, 'startClaudeNativePresenceServer').mockImplementation(async options => {
    callbacks = options; return { url: 'http://127.0.0.1:1/claude-native-presence', stop: async () => {
      options.onRetire?.('run-a'); options.onRetire?.('run-b'); options.onChange({ observedRuns: 0, launchers: 0 }); } };
  });
  const f = fixture(); f.options.onFact = onFact; f.options.onRetire = onRetire;
  await f.configure();
  callbacks.onFact?.({ runId: 'run-a', fact: { kind: 'session-started', source: 'startup', providerSessionId: 'session-a' } });
  expect(onFact).toHaveBeenCalledTimes(1); f.controller.invalidate();
  await f.controller.disable(); expect(onRetire).toHaveBeenCalledExactlyOnceWith('run-a');
  callbacks.onFact?.({ runId: 'late', fact: { kind: 'turn-submitted', providerSessionId: 'session-a' } });
  expect(onFact).toHaveBeenCalledTimes(1);
  await f.controller.resume();
  callbacks.onFact?.({ runId: 'run-b', fact: { kind: 'session-started', source: 'startup', providerSessionId: 'session-b' } });
  await f.controller.stop(); expect(onRetire.mock.calls).toEqual([['run-a'], ['run-b']]);
});

it('waits for a pending observer startup on shutdown and never installs after closing', async () => {
  let release!: (server: Awaited<ReturnType<typeof nativePresence.startClaudeNativePresenceServer>>) => void;
  vi.spyOn(nativePresence, 'startClaudeNativePresenceServer').mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const f = fixture(), serverStop = vi.fn(async () => {});
  const preview = (await f.controller.preview()).preview!;
  const confirming = f.controller.confirm(preview.id);
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  let stopped = false;
  const stopping = f.controller.stop().then(() => { stopped = true; });
  try {
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(stopped).toBe(false);
  } finally {
    release({ url: 'http://127.0.0.1:1/claude-native-presence', stop: serverStop });
    await Promise.all([confirming, stopping]);
  }
  expect(serverStop).toHaveBeenCalled(); expect(fs.existsSync(f.owned)).toBe(false);
  expect(fs.readFileSync(f.settings, 'utf8')).toBe(f.original);
});

it('never forwards task facts for restored schema1 even if its observer sends normalized facts', async () => {
  const onFact = vi.fn(), onRetire = vi.fn();
  let callbacks!: Parameters<typeof nativePresence.startClaudeNativePresenceServer>[0];
  vi.spyOn(nativePresence, 'startClaudeNativePresenceServer').mockImplementation(async options => {
    callbacks = options; return { url: 'http://127.0.0.1:1/claude-native-presence', stop: async () => { options.onRetire?.('run-a'); } };
  });
  const f = await legacyFixture(); f.options.onFact = onFact; f.options.onRetire = onRetire;
  await f.controller.restore();
  callbacks.onFact?.({ runId: 'run-a', fact: { kind: 'session-started', source: 'startup', providerSessionId: 'session-a' } });
  expect(f.controller.snapshot().scope).toBe('presence-only'); expect(onFact).not.toHaveBeenCalled();
  await f.controller.stop(); expect(onRetire).not.toHaveBeenCalled();
});

it('cancels stale consent and detects user edits between preview and confirm without overwriting them', async () => {
  const f = fixture(), old = (await f.controller.preview()).preview!;
  f.controller.invalidate(); expect((await f.controller.confirm(old.id)).notice).toBe('stale-preview');
  expect(fs.existsSync(f.owned)).toBe(false);
  const next = (await f.controller.preview()).preview!;
  fs.writeFileSync(f.settings, '{"later":"user edit"}');
  expect((await f.controller.confirm(next.id)).notice).toBe('save-failed');
  expect(fs.readFileSync(f.settings, 'utf8')).toBe('{"later":"user edit"}');
  expect(f.controller.snapshot()).toMatchObject({ status: 'failed', observedRuns: 0 });
  expect(await f.controller.remove()).toBe(true);
});

it('honors disabled hooks and malformed/shared unknown files without installing anything', async () => {
  const f = fixture(); fs.writeFileSync(f.settings, '{"disableAllHooks":true,"hooks":{}}');
  const state = await f.controller.preview();
  expect(state.preview?.settings?.canApply).toBe(false);
  expect((await f.controller.confirm(state.preview!.id)).notice).toBe('stale-preview');
  expect(fs.existsSync(f.owned)).toBe(false);
  expect(fs.readFileSync(f.settings, 'utf8')).toBe('{"disableAllHooks":true,"hooks":{}}');
});

it('restores an enabled configuration on app startup, rotates credentials, and retains explicit pause', async () => {
  const f = fixture(); await f.configure();
  const before = JSON.parse(fs.readFileSync(join(f.owned, 'activation.json'), 'utf8'));
  const settings = fs.readFileSync(f.settings, 'utf8'); await f.controller.stop();
  const restored = new ClaudeNormalPresence(f.options); cleanups.push(() => restored.stop());
  const restoring = restored.restore(); restored.invalidate(); await restoring;
  expect(restored.snapshot()).toMatchObject({ status: 'waiting', configured: true, launchCommand: null });
  expect(JSON.parse(fs.readFileSync(join(f.owned, 'activation.json'), 'utf8')).token).not.toBe(before.token);
  expect(fs.readFileSync(f.settings, 'utf8')).toBe(settings);
  await restored.disable(); await restored.stop();
  const paused = new ClaudeNormalPresence(f.options); cleanups.push(() => paused.stop()); await paused.restore();
  expect(paused.snapshot()).toMatchObject({ status: 'disabled', canResume: true, observedRuns: 0 });
});

it('withdraws only the product hook, preserves later changes and keeps runtime for loaded hooks', async () => {
  const f = fixture(); await f.configure();
  const withOwn = fs.readFileSync(f.settings, 'utf8');
  fs.writeFileSync(f.settings, withOwn.replace('"unknown":', '"later": "new value", "unknown":'));
  expect(await f.controller.remove()).toBe(true);
  const withdrawn = fs.readFileSync(f.settings, 'utf8');
  expect(withdrawn).toContain('"later": "new value"'); expect(withdrawn).toContain('original-hook');
  expect(JSON.parse(withdrawn).hooks.SessionStart).toHaveLength(1);
  expect(fs.existsSync(join(f.owned, 'observer.cjs'))).toBe(true);
});

it('keeps changed product hook and record on uncertain removal', async () => {
  const f = fixture(); await f.configure();
  const changed = fs.readFileSync(f.settings, 'utf8').replace('"timeout":2', '"timeout":3'); fs.writeFileSync(f.settings, changed);
  expect(await f.controller.remove()).toBe(false);
  expect(f.controller.snapshot()).toMatchObject({ status: 'failed', notice: 'retained', observedRuns: 0 });
  expect(fs.readFileSync(f.settings, 'utf8')).toBe(changed);
});

it('rejects private material substitution and never installs over a user-owned destination', async () => {
  const f = fixture(); fs.mkdirSync(f.owned, { mode: 0o700 }); fs.writeFileSync(join(f.owned, 'user.txt'), 'preserve');
  const state = await f.configure(); expect(state.notice).toBe('save-failed');
  expect(fs.readFileSync(f.settings, 'utf8')).toBe(f.original);
  expect(fs.readFileSync(join(f.owned, 'user.txt'), 'utf8')).toBe('preserve');
});

it('routes production configurations to one normal mode, preserves metadata, and removes only its hook', async () => {
  const f = fixture(), publish = vi.fn(), start = vi.fn();
  const collection = new Configurations({ directory: f.options.directory, adapter: () => ({ start }), publish,
    claude: { ...f.options, runtimeAssets: async () => ({ hook: '//old', launcher: '//old', nativeHook: '//normal' }),
      normal: { probePath: f.options.probePath, observerExecutable: f.options.observerExecutable } } });
  cleanups.push(() => collection.stop());
  const created = await collection.create({ provider: 'claude', name: 'Claude', targetPath: f.options.targetDirectory }), id = created.records[0]!.id;
  const oldPreview = (await collection.preview(id)).records[0]!.claude!.preview!;
  const other = join(f.root, 'other-claude'); fs.mkdirSync(other, { mode: 0o700 });
  expect((await collection.changeTarget(id, other)).notice).toBe('none');
  expect((await collection.confirm(id, oldPreview.id)).records[0]!.claude!.notice).toBe('stale-preview');
  const preview = (await collection.preview(id)).records[0]!.claude!.preview!;
  expect(preview.settings!.path).toBe(join(other, 'settings.json'));
  expect((await collection.confirm(id, preview.id)).records[0]!.claude).toMatchObject({ mode: 'normal-start', status: 'waiting', launchCommand: null });
  expect((await collection.rename(id, '我的 Claude')).records[0]!.name).toBe('我的 Claude');
  expect((await collection.changeTarget(id, '/other')).notice).toBe('withdraw-first');
  expect((await collection.remove(id)).records).toEqual([]);
  expect(fs.readFileSync(f.settings, 'utf8')).toBe(f.original);
  expect(JSON.parse(fs.readFileSync(join(other, 'settings.json'), 'utf8'))).toEqual({});
  expect(start).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
});
