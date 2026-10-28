import './test-support/mock-volume-queries.js';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { ClaudePresence, type ClaudePresenceOptions } from './claude-presence.js';
import { inspectClaudeExecutable } from './claude-executable.js';
import { connectClaudePresence } from '../../../../integrations/claude-hooks/presence-channel.js';
import { Configurations } from './configurations.js';
import { configurationOnline } from '../shared/configurations.js';
import { projectHomePets } from '../renderer/management/home-projection.js';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.restoreAllMocks(); });
function fixture(overrides: Partial<ClaudePresenceOptions> = {}) {
  const directory = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pet-claude-main-')));
  fs.chmodSync(directory, 0o700);
  cleanups.push(() => fs.rmSync(directory, { recursive: true, force: true }));
  const options: ClaudePresenceOptions = { directory, configurationId: randomUUID(), nodeExecutable: process.execPath, runAsNode: false,
    chooseExecutable: async () => '/owned/bin/claude.exe', inspectExecutable: path => path,
    runtimeAssets: async () => ({ hook: '// hook fixture', launcher: '// launcher fixture' }), ...overrides };
  const controller = new ClaudePresence(options);
  cleanups.push(() => controller.stop());
  const owned = join(directory, `claude-${options.configurationId}`);
  return { controller, options, directory, owned,
    activation: () => JSON.parse(fs.readFileSync(join(owned, 'activation.json'), 'utf8')) as {url: string; token: string},
    async configure() { const preview = (await controller.preview()).preview!; expect(preview).not.toBeNull(); return controller.confirm(preview.id); } };
}
async function observe(f: ReturnType<typeof fixture>) {
  const count = f.controller.snapshot().observedRuns + 1;
  const channel = await connectClaudePresence({ ...f.activation(), onLost: () => undefined });
  cleanups.push(() => channel.close());
  const runId = randomUUID(); channel.report({ runId, kind: 'child-started' }); channel.report({ runId, kind: 'hook-observed' });
  await vi.waitFor(() => expect(f.controller.snapshot().observedRuns).toBe(count));
  return { channel, runId };
}

it('requires explicit current consent, stores only owned material, and exposes no credentials', async () => {
  const f = fixture();
  const preview = (await f.controller.preview()).preview!;
  expect(fs.existsSync(f.owned)).toBe(false);
  expect(preview.files).toHaveLength(6);
  f.controller.invalidate();
  expect((await f.controller.confirm(preview.id)).notice).toBe('stale-preview');
  expect(fs.existsSync(f.owned)).toBe(false);
  expect(await f.configure()).toMatchObject({ status: 'waiting', configured: true, observedRuns: 0 });
  const activation = f.activation();
  expect(JSON.stringify(f.controller.snapshot())).not.toContain(activation.token);
  expect(JSON.stringify(f.controller.snapshot())).not.toContain(activation.url);
  expect(f.controller.snapshot().launchCommand).toContain('launcher.cjs');
  expect(fs.statSync(join(f.owned, 'activation.json')).mode & 0o777).toBe(0o600);
});

it('keeps independent runs online until the last observation ends; navigation does not retire a live run', async () => {
  const f = fixture(); await f.configure();
  const first = await observe(f), second = await observe(f);
  expect(f.controller.snapshot().observedRuns).toBe(2);
  f.controller.invalidate();
  first.channel.report({ runId: first.runId, kind: 'child-ended' });
  await vi.waitFor(() => expect(f.controller.snapshot().observedRuns).toBe(1));
  expect(f.controller.snapshot().status).toBe('observing');
  await second.channel.close();
  await vi.waitFor(() => expect(f.controller.snapshot()).toMatchObject({ observedRuns: 0, status: 'waiting' }));
});

it('persists pause, restores only on explicit resume, rotates credentials, and preserves files on removal', async () => {
  const f = fixture(); await f.configure(); await observe(f);
  const old = f.activation();
  expect((await f.controller.disable()).status).toBe('disabled');
  await expect(connectClaudePresence({ ...old, onLost: () => undefined })).rejects.toThrow();
  await f.controller.stop();
  const restored = new ClaudePresence(f.options); cleanups.push(() => restored.stop());
  expect(restored.snapshot()).toMatchObject({ status: 'disabled', canResume: true, launchers: 0 });
  expect((await restored.resume()).status).toBe('waiting');
  expect(f.activation().token).not.toBe(old.token);
  expect(await restored.remove()).toBe(true);
  expect(fs.existsSync(join(f.owned, 'plugin/runtime/hook.cjs'))).toBe(true);
  expect(new ClaudePresence(f.options).snapshot().status).toBe('disabled');
});

it('preserves edited material and blocks restore/removal instead of replacing or deleting it', async () => {
  const f = fixture(); await f.configure(); await f.controller.stop();
  const path = join(f.owned, 'launcher.cjs'); fs.writeFileSync(path, 'user changed');
  const restored = new ClaudePresence(f.options); cleanups.push(() => restored.stop());
  expect(restored.snapshot()).toMatchObject({ status: 'failed', notice: 'saved-invalid', canResume: false });
  expect(await restored.remove()).toBe(false);
  expect(fs.readFileSync(path, 'utf8')).toBe('user changed');
});

it('invalidates late native chooser results and lets cancellation recover without a stuck busy button', async () => {
  let resolve!: (value: string | null) => void;
  const f = fixture({ chooseExecutable: () => new Promise(done => { resolve = done; }) });
  const pending = f.controller.preview(); f.controller.invalidate(); resolve('/owned/claude');
  await pending;
  expect(f.controller.snapshot()).toMatchObject({ busy: false, preview: null, canConfigure: true });
  expect(fs.existsSync(f.owned)).toBe(false);
});

it('handles native cancel, unsupported selection and unavailable compiled assets without writes', async () => {
  const chooseExecutable = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce(null).mockResolvedValue('/bad/program');
  const inspectExecutable = vi.fn().mockReturnValueOnce(null).mockReturnValue('/bad/program');
  const f = fixture({ chooseExecutable, inspectExecutable, runtimeAssets: async () => { throw new Error(); } });
  expect((await f.controller.preview()).notice).toBe('none');
  expect((await f.controller.preview()).notice).toBe('unsupported-installation');
  expect((await f.controller.preview()).notice).toBe('preview-failed');
  expect(f.controller.snapshot().busy).toBe(false); expect(fs.existsSync(f.owned)).toBe(false);
});

it('checks explicitly selected npm executable metadata without executing it; rejects unknown versions and unsafe files', () => {
  const f = fixture(), root = join(f.directory, 'package'), bin = join(root, 'bin'); fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  const executable = join(bin, 'claude.exe'), manifest = join(root, 'package.json');
  fs.writeFileSync(executable, 'do not execute', { mode: 0o700 });
  const json = (version: string) => JSON.stringify({ name: '@anthropic-ai/claude-code', version, bin: { claude: 'bin/claude.exe' } });
  fs.writeFileSync(manifest, json('2.1.301'), { mode: 0o600 });
  const link = join(f.directory, 'claude'); fs.symlinkSync(executable, link);
  expect(inspectClaudeExecutable(link)).toBe(executable);
  fs.writeFileSync(manifest, json('9.0.0')); expect(inspectClaudeExecutable(link)).toBeNull();
  fs.writeFileSync(manifest, json('2.1.301')); fs.chmodSync(executable, 0o777); expect(inspectClaudeExecutable(link)).toBeNull();
  expect(inspectClaudeExecutable('/missing')).toBeNull();
});

it('wires generic connection APIs to Claude and home identity without Pi deployment or task publication', async () => {
  const f = fixture(), start = vi.fn(), publish = vi.fn();
  const collection = new Configurations({ directory: f.directory, adapter: () => ({ start }), publish,
    claude: f.options }); cleanups.push(() => collection.stop());
  const created = await collection.create({ provider: 'claude', name: '我的 Claude', targetPath: join(f.directory, 'metadata-only') });
  const id = created.records[0]!.id;
  await collection.bindPet(id, { assetId: 'starter', name: '雪球' });
  expect(created.records[0]).toMatchObject({ connection: null, claude: { status: 'not-configured' } });
  const plan = (await collection.preview(id)).records[0]!.claude!.preview!;
  const waiting = await collection.confirm(id, plan.id);
  expect(configurationOnline(waiting.records[0]!)).toBe(false);
  const activation = JSON.parse(fs.readFileSync(join(f.directory, `claude-${id}`, 'activation.json'), 'utf8'));
  const channel = await connectClaudePresence({ url: activation.url, token: activation.token, onLost: () => undefined });
  cleanups.push(() => channel.close()); const runId = randomUUID();
  channel.report({ runId, kind: 'child-started' }); channel.report({ runId, kind: 'hook-observed' });
  await vi.waitFor(() => expect(configurationOnline(collection.snapshot().records[0]!)).toBe(true));
  expect(projectHomePets(collection.snapshot(), { sessions: {}, bubbles: [] }, '雪球')).toMatchObject([{ id, configuration: '我的 Claude', action: 'presence' }]);
  expect((await collection.rename(id, '新的名字')).records[0]!.name).toBe('新的名字');
  expect((await collection.changeTarget(id, '/other')).notice).toBe('withdraw-first');
  expect((await collection.remove(id)).records).toEqual([]);
  expect(fs.existsSync(join(f.directory, `claude-${id}`, 'launcher.cjs'))).toBe(true);
  expect(start).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
  expect(fs.existsSync(join(f.directory, 'metadata-only'))).toBe(false);
});
