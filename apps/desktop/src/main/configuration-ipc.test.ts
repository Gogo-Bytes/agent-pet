import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { Configurations } from './configurations.js';
import { registerConfigurationIpc } from './configuration-ipc.js';
import { loadTrustedEntry } from './window-trust.js';
import { PiPreflight } from './pi-preflight.js';
import { ClaudeDiscovery } from './claude-discovery.js';
import { PiConnectionStore } from './pi-connection-store.js';
import { ConfigurationsStore } from './configurations-store.js';
import { limits, ReadBudget } from './pi-preflight-files.js';
import { dirname } from 'node:path';
const native = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>(), pick: vi.fn(), approve: vi.fn(), open: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, callback: (...args: unknown[]) => unknown) => native.handlers.set(name, callback) }, dialog: { showOpenDialog: native.pick, showMessageBox: native.approve }, shell: { openExternal: native.open } }));
let directory: string;
let registry: Configurations;
let window: BrowserWindow;
let event: { sender: BrowserWindow['webContents']; senderFrame: BrowserWindow['webContents']['mainFrame'] };
let closed: boolean;
let preflight: PiPreflight;
let claudeDiscovery: ClaudeDiscovery;
let capabilities: ReturnType<typeof registerConfigurationIpc>;
let visible: boolean;
const start = vi.fn(async () => ({ stop: vi.fn(async () => {}) }));
const chooseClaude = vi.fn(async () => null);
beforeEach(() => {
  native.handlers.clear(); native.pick.mockReset(); native.approve.mockReset(); native.open.mockReset();
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'agent-pet-ipc-')));
  const profile = join(directory, 'profile'); mkdirSync(profile, { mode: 0o700 });
  start.mockClear();
  chooseClaude.mockClear();
  registry = new Configurations({ directory: profile, adapter: () => ({ start }), publish: vi.fn(),
    claude: { nodeExecutable: process.execPath, runAsNode: false, chooseExecutable: chooseClaude,
      runtimeAssets: async () => ({ hook: '// legacy fixture', launcher: '// legacy fixture', nativeHook: '// isolated observer fixture' }),
      normal: { probePath: '/isolated/probe', observerExecutable: process.execPath } } });
  preflight = new PiPreflight({ home: directory, guiPath: join(directory, 'bin'), pick: async () => null });
  claudeDiscovery = new ClaudeDiscovery({ home: directory, guiPath: join(directory, 'bin') });
  const contents = { mainFrame: { url: 'file:///review.html' }, setWindowOpenHandler: vi.fn(), on: vi.fn() };
  visible = true;
  window = { webContents: contents, isDestroyed: () => false, isVisible: () => visible, loadFile: vi.fn(), loadURL: vi.fn() } as unknown as BrowserWindow;
  loadTrustedEntry(window, '/review.html'); closed = false;
  event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  capabilities = registerConfigurationIpc({ window: () => window, configurations: registry, preflight, claudeDiscovery, sessions: () => ({ sessions: {}, bubbles: [] }), quitting: () => closed });
});
afterEach(async () => {
  vi.useRealTimers();
  preflight.close(); claudeDiscovery.invalidate(); await registry.stop();
  for (const record of registry.snapshot().records) {
    const saved = new PiConnectionStore(join(directory, 'profile', `configuration-${record.id}`)).snapshot();
    if (saved) rmSync(dirname(saved.config.endpoint), { recursive: true, force: true });
  }
  vi.restoreAllMocks(); rmSync(directory, { recursive: true, force: true });
});
const invoke = (action: string, ...args: unknown[]) => native.handlers.get(`management:${action}`)!(event, ...args);
const prepare = (id: string, requestId = 'test-request') => invoke('configurations-prepare-detected', id, requestId);
function delayInstallation(path: string) {
  const original = ReadBudget.prototype.stat;
  const stat = lstatSync(path); let finish!: () => void;
  const pending = new Promise<typeof stat>(resolve => { finish = () => resolve(stat); });
  vi.spyOn(ReadBudget.prototype, 'stat').mockImplementation(function(this: ReadBudget, value) { return value === path ? pending : original.call(this, value); });
  return finish;
}
const flushSetup = async () => { for (let n = 0; n < 16; n++) await Promise.resolve(); };
async function scanFixture() {
  const stat = ReadBudget.prototype.stat;
  vi.spyOn(ReadBudget.prototype, 'stat').mockImplementation(function(this: ReadBudget, path) {
    if (['/opt/homebrew/bin/pi', '/usr/local/bin/pi'].includes(path)) return Promise.resolve(null);
    return stat.call(this, path);
  });
  const node = join(directory, '.nvm/versions/node/v22.22.3');
  const pkg = join(node, 'lib/node_modules/@earendil-works/pi-coding-agent');
  mkdirSync(join(pkg, 'dist/bundle'), { recursive: true, mode: 0o700 });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '0.85.1', bin: { pi: 'dist/bundle/cli.js' }, piConfig: { configDir: '.pi' } }), { mode: 0o600 });
  writeFileSync(join(pkg, 'dist/bundle/cli.js'), 'throw new Error("MUST NOT EXECUTE")', { mode: 0o600 });
  mkdirSync(join(node, 'bin')); symlinkSync('../lib/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js', join(node, 'bin/pi'));
  mkdirSync(join(directory, '.pi/agent'), { recursive: true, mode: 0o700 });
  const state = await preflight.detect();
  const installation = state.installations.find(value => value.path === join(node, 'bin/pi'))!;
  return { id: installation.id, installationPath: installation.path, cli: join(pkg, 'package.json'), target: join(directory, '.pi/agent'), artifact: join(directory, '.pi/agent/extensions/agent-pet.ts') };
}
describe('configuration host capability boundary', () => {
  it('does not let late cancelled work revoke a newer preview on the same record', async () => {
    const f = await scanFixture(); const preview = registry.preview.bind(registry);
    let finish!: () => void; let ready!: () => void;
    const entered = new Promise<void>(resolve => { ready = resolve; });
    vi.spyOn(registry, 'preview').mockImplementationOnce(async id => {
      const state = await preview(id); ready(); await new Promise<void>(resolve => { finish = resolve; }); return state;
    });
    const pending = prepare(f.id, 'old-request'); await entered;
    const record = registry.snapshot().records[0]!;
    await invoke('configurations-cancel-detected', 'old-request'); await pending;
    const next = await registry.preview(record.id); const newPlan = next.records[0]!.connection!.preview!.id;
    finish(); await flushSetup();
    expect(registry.snapshot().records[0]!.connection!.preview!.id).toBe(newPlan);
    await invoke('configurations-cancel-detected', 'old-request');
    expect(registry.snapshot().records[0]!.connection!.preview!.id).toBe(newPlan);
    expect(start).not.toHaveBeenCalled(); expect(existsSync(f.artifact)).toBe(false);
  });
  it('times out blocked IO and prevents it from publishing a late configuration', async () => {
    const f = await scanFixture(); const finish = delayInstallation(f.installationPath);
    vi.useFakeTimers(); const pending = prepare(f.id, 'timeout-request');
    await vi.advanceTimersByTimeAsync(limits.milliseconds);
    expect(await pending).toMatchObject({ configurationId: null, reason: 'timeout' });
    finish(); await flushSetup();
    expect(registry.snapshot().records).toEqual([]); expect(start).not.toHaveBeenCalled();
  });
  it('late cancellation only revokes the matching completed request preview', async () => {
    const f = await scanFixture();
    const first = await prepare(f.id, 'first') as { configurationId: string };
    const second = await prepare(f.id, 'second');
    const plan = registry.snapshot().records[0]!.connection!.preview!.id;
    await invoke('configurations-cancel-detected', 'first');
    expect(registry.snapshot().records[0]!.connection!.preview!.id).toBe(plan);
    await invoke('configurations-cancel-detected', 'second');
    expect(registry.snapshot().records[0]!.connection!.preview).toBeNull();
    expect(first.configurationId).toBe((second as typeof first).configurationId);
  });
  it('settles invalidated preparation immediately even if underlying inspection never resolves', async () => {
    const f = await scanFixture(); const finish = delayInstallation(f.installationPath);
    let settled = false;
    const pending = Promise.resolve(prepare(f.id)).then(() => { settled = true; });
    capabilities.invalidate();
    for (let n = 0; n < 12; n++) await Promise.resolve();
    expect(settled).toBe(true);
    await pending; finish(); await flushSetup();
  });
  it('revokes a completed preview after window invalidation and keeps target files untouched', async () => {
    const f = await scanFixture(); native.approve.mockResolvedValue({ response: 1 });
    const preview = registry.preview.bind(registry);
    let finish!: () => void; let ready!: () => void;
    const entered = new Promise<void>(resolve => { ready = resolve; });
    vi.spyOn(registry, 'preview').mockImplementationOnce(async id => {
      const state = await preview(id); ready(); await new Promise<void>(resolve => { finish = resolve; }); return state;
    });
    const pending = prepare(f.id); await entered;
    capabilities.invalidate(); finish(); await flushSetup();
    expect(await pending).toMatchObject({ configurationId: null });
    expect(registry.snapshot().records[0]!.connection!.preview).toBeNull();
    expect(existsSync(f.artifact)).toBe(false); expect(start).not.toHaveBeenCalled();
  });
  it('preserves a blocked default and reports persistence failure without deploying', async () => {
    const f = await scanFixture(); native.approve.mockResolvedValue({ response: 1 });
    rmSync(join(directory, '.pi'), { recursive: true });
    const result = await prepare(f.id) as { state: ReturnType<Configurations['snapshot']>; configurationId: string };
    expect(result.state.records[0]!.connection!.preview?.action).toBe('blocked');
    expect(existsSync(join(directory, '.pi'))).toBe(false); expect(start).not.toHaveBeenCalled();
    await registry.remove(result.configurationId);
    vi.spyOn(ConfigurationsStore.prototype, 'save').mockReturnValueOnce(false);
    expect(await prepare(f.id)).toMatchObject({ state: { notice: 'save-failed', records: [] }, configurationId: null });
    expect(start).not.toHaveBeenCalled(); expect(existsSync(f.artifact)).toBe(false);
  });
  it('automatically prepares the detected default without a folder picker, but never deploys before confirmation', async () => {
    const f = await scanFixture(); native.approve.mockResolvedValue({ response: 1 });
    const result = await prepare(f.id) as { state: ReturnType<Configurations['snapshot']>; configurationId: string };
    expect(native.pick).not.toHaveBeenCalled();
    expect(native.approve).not.toHaveBeenCalled();
    const record = result.state.records[0]!;
    expect(record).toMatchObject({ name: 'pi 默认配置', provider: 'pi', targetPath: f.target, installation: { id: f.id, compatibility: 'verified-0.85.1' },
      connection: { status: 'not-configured', receiving: 'stopped', preview: { action: 'create', path: f.artifact } } });
    expect(start).not.toHaveBeenCalled(); expect(existsSync(f.artifact)).toBe(false);
    await invoke('configurations-cancel', result.configurationId);
    expect(existsSync(f.artifact)).toBe(false);
    const second = await prepare(f.id) as typeof result;
    expect(second.configurationId).toBe(result.configurationId); expect(registry.snapshot().records).toHaveLength(1);
    await invoke('configurations-confirm', second.configurationId, second.state.records[0]!.connection!.preview!.id);
    expect(start).toHaveBeenCalledTimes(1); expect(existsSync(f.artifact)).toBe(true);
    expect((await registry.remove(second.configurationId)).records).toEqual([]);
    expect(existsSync(f.artifact)).toBe(false);
  });
  it('cancels an in-flight request without adding a record and rejects arbitrary or stale candidates', async () => {
    const f = await scanFixture(); const finish = delayInstallation(f.installationPath);
    const pending = prepare(f.id);
    await invoke('configurations-cancel-detected', 'wrong-request');
    await invoke('configurations-cancel-detected', 'test-request');
    expect(await pending).toMatchObject({ configurationId: null, reason: 'cancelled' });
    expect(registry.snapshot().records).toEqual([]); expect(start).not.toHaveBeenCalled();
    finish(); await flushSetup();
    await expect(prepare('/arbitrary/path')).rejects.toThrow('重新扫描');
    await expect(invoke('configurations-prepare-detected', f.id, '/different')).rejects.toThrow('Invalid');
    await preflight.detect();
    await expect(prepare(f.id)).rejects.toThrow('重新扫描');
  });
  it('does not offer automatic setup for an unverified installation', async () => {
    const f = await scanFixture();
    const metadata = JSON.parse(readFileSync(f.cli, 'utf8')); metadata.version = '0.85.2'; writeFileSync(f.cli, JSON.stringify(metadata), { mode: 0o600 });
    const scanned = await preflight.detect(); const installation = scanned.installations.find(value => value.path.includes('/.nvm/'))!;
    expect(installation.compatibility).toBe('unverified');
    await expect(prepare(installation.id)).rejects.toThrow('重新扫描');
    expect(native.approve).not.toHaveBeenCalled(); expect(registry.snapshot().records).toEqual([]);
  });
  it.each(['close', 'hide', 'rescan', 'changed-installation'] as const)('does not prepare a stale default after %s during inspection', async change => {
    const f = await scanFixture(); const finish = delayInstallation(f.installationPath);
    const pending = prepare(f.id);
    await expect(prepare(f.id)).rejects.toThrow('正在结束');
    if (change === 'close') capabilities.invalidate();
    if (change === 'hide') visible = false;
    if (change === 'rescan') { const next = preflight.detect(); finish(); await next; }
    if (change === 'changed-installation') {
      const metadata = JSON.parse(readFileSync(f.cli, 'utf8')); metadata.version = '0.85.2'; writeFileSync(f.cli, JSON.stringify(metadata), { mode: 0o600 });
    }
    finish();
    if (change === 'changed-installation') await expect(pending).rejects.toThrow('安装已变化');
    else expect(await pending).toMatchObject({ configurationId: null });
    await flushSetup();
    expect(registry.snapshot().records).toEqual([]); expect(start).not.toHaveBeenCalled(); expect(existsSync(f.artifact)).toBe(false);
  });
  it('rejects every new channel from the pet window, subframes and foreign navigation', async () => {
    for (const handler of native.handlers.values()) {
      await expect(Promise.resolve().then(() => handler({ sender: {}, senderFrame: event.senderFrame }))).rejects.toThrow('Untrusted renderer');
      await expect(Promise.resolve().then(() => handler({ sender: event.sender, senderFrame: { url: event.senderFrame.url } }))).rejects.toThrow('Untrusted renderer');
    }
    Object.assign(event.senderFrame, { url: 'https://foreign.invalid' });
    expect(() => invoke('configurations-state')).toThrow('Untrusted renderer');
  });
  it('does not read or add arbitrary Renderer paths; native approval cancellation leaves no record', async () => {
    const path = join(directory, 'target'); mkdirSync(path);
    expect(() => invoke('configurations-create', { name: '项目', provider: 'pi', targetPath: path })).toThrow('approved');
    native.approve.mockResolvedValue({ response: 0 });
    expect(await invoke('location-authorize', path)).toBeNull();
    await expect(invoke('location-inspect', path, 'pi')).rejects.toThrow('approved');
    expect(registry.snapshot().records).toEqual([]);
  });
  it('canonicalizes approved macOS spelling before duplicate checks and preserves symbol-link refusal', async () => {
    const target = join(directory, 'Project'); mkdirSync(target);
    native.pick.mockResolvedValue({ canceled: false, filePaths: [target] });
    const path = await invoke('location-choose');
    expect(path).toBe(realpathSync(target));
    await invoke('configurations-create', { name: '一', provider: 'pi', targetPath: path });
    // On a case-insensitive volume this is the same directory. On case-sensitive volumes use its exact spelling.
    let alias = join(directory, 'project'); try { realpathSync(alias); } catch { alias = target; }
    native.approve.mockResolvedValue({ response: 1 });
    const canonical = await invoke('location-authorize', alias);
    const result = await invoke('configurations-create', { name: '二', provider: 'pi', targetPath: canonical });
    expect(result).toMatchObject({ notice: 'duplicate' }); expect(registry.snapshot().records).toHaveLength(1);
    const link = join(directory, 'link'); symlinkSync(target, link);
    native.pick.mockResolvedValue({ canceled: false, filePaths: [link] });
    await expect(invoke('location-choose')).rejects.toThrow('符号链接');
  });
  it('approves an exact read scope, inspects without writing targets, and routes only allowlisted project URL', async () => {
    const path = join(directory, 'target'); mkdirSync(path);
    native.approve.mockResolvedValue({ response: 1 });
    expect(await invoke('location-authorize', path)).toBe(path);
    expect(native.approve.mock.calls[0]?.[1]).toMatchObject({ message: path, buttons: ['取消', '允许检查'] });
    expect(await invoke('location-inspect', path, 'pi')).toMatchObject({ target: { path, source: 'chosen' } });
    await invoke('project', 'https://untrusted.invalid');
    expect(native.open).toHaveBeenCalledExactlyOnceWith('https://github.com/Gogo-Bytes/agent-pet');
    closed = true; expect(() => invoke('configurations-state')).toThrow('quitting');
  });
});

async function claudeFixture() {
  const stat = ReadBudget.prototype.stat;
  vi.spyOn(ReadBudget.prototype, 'stat').mockImplementation(function(this: ReadBudget, path) {
    if (path.startsWith('/opt') || path.startsWith('/usr/local')) return Promise.resolve(null);
    return stat.call(this, path);
  });
  const pkg = join(directory, '.nvm/versions/node/v22.18.0/lib/node_modules/@anthropic-ai/claude-code');
  mkdirSync(join(pkg, 'bin'), { recursive: true, mode: 0o700 });
  const executable = join(pkg, 'bin/claude.exe'), manifest = join(pkg, 'package.json');
  writeFileSync(executable, 'throw new Error("DO NOT EXECUTE")', { mode: 0o700 });
  writeFileSync(manifest, JSON.stringify({ name: '@anthropic-ai/claude-code', version: '2.1.301', bin: { claude: 'bin/claude.exe' } }), { mode: 0o600 });
  mkdirSync(join(directory, 'bin')); const entry = join(directory, 'bin/claude'); symlinkSync(executable, entry);
  const target = join(directory, '.claude'); mkdirSync(target, { mode: 0o700 });
  const settings = join(target, 'settings.json'), original = '{"hooks":{},"keep":"original"}\n';
  writeFileSync(settings, original, { mode: 0o600 });
  native.approve.mockResolvedValue({ response: 1 });
  const detected = await invoke('configurations-detect-claude', 'scan-request') as Awaited<ReturnType<ClaudeDiscovery['detect']>>;
  return { id: detected.installations[0]!.id, executable, entry, manifest, target, settings, original };
}
it('discovers Claude only after explicit scope approval and never inspects after cancellation or window invalidation', async () => {
  const detect = vi.spyOn(claudeDiscovery, 'detect');
  native.approve.mockResolvedValueOnce({ response: 0 });
  expect(await invoke('configurations-detect-claude', 'scan-request')).toMatchObject({ notice: 'cancelled' });
  expect(detect).not.toHaveBeenCalled();
  native.approve.mockImplementationOnce(async () => { capabilities.invalidate(); return { response: 1 }; });
  expect(await invoke('configurations-detect-claude', 'scan-request')).toMatchObject({ notice: 'cancelled' });
  expect(detect).not.toHaveBeenCalled();
});
it('prepares the discovered Claude default with no picker and keeps both settings and runtime untouched until confirmation', async () => {
  const f = await claudeFixture();
  const result = await invoke('configurations-prepare-detected-claude', f.id, 'claude-first') as { state: ReturnType<Configurations['snapshot']>; configurationId: string };
  expect(result.state.records[0]).toMatchObject({ name: 'Claude Code', provider: 'claude', targetPath: f.target,
    claude: { configured: false, status: 'not-configured', preview: { executable: f.executable, settings: { path: f.settings, canApply: true } } } });
  expect(chooseClaude).not.toHaveBeenCalled(); expect(native.pick).not.toHaveBeenCalled();
  expect(readFileSync(f.settings, 'utf8')).toBe(f.original);
  expect(existsSync(join(directory, 'profile', 'claude-normal-' + result.configurationId))).toBe(false);
  const second = await invoke('configurations-prepare-detected-claude', f.id, 'claude-next') as typeof result;
  expect(second.configurationId).toBe(result.configurationId); expect(second.state.records).toHaveLength(1);
  const plan = second.state.records[0]!.claude!.preview!.id;
  await invoke('configurations-cancel-detected', 'claude-first');
  expect(registry.snapshot().records[0]!.claude!.preview?.id).toBe(plan);
  await invoke('configurations-cancel-detected', 'claude-next');
  expect(registry.snapshot().records[0]!.claude!.preview).toBeNull();
  expect(readFileSync(f.settings, 'utf8')).toBe(f.original); expect(start).not.toHaveBeenCalled();
});
it('rejects stale Claude candidates, changed installation and arbitrary executable paths', async () => {
  const f = await claudeFixture();
  await expect(invoke('configurations-prepare-detected-claude', '/arbitrary/claude', 'request')).rejects.toThrow('重新扫描');
  writeFileSync(f.manifest, JSON.stringify({ name: '@anthropic-ai/claude-code', version: '9.0.0', bin: { claude: 'bin/claude.exe' } }));
  await expect(invoke('configurations-prepare-detected-claude', f.id, 'request')).rejects.toThrow('已变化');
  expect(registry.snapshot().records).toEqual([]);
  claudeDiscovery.invalidate();
  await expect(invoke('configurations-prepare-detected-claude', f.id, 'request')).rejects.toThrow('重新扫描');
  expect(readFileSync(f.settings, 'utf8')).toBe(f.original);
});
it('cancels a pending Claude preparation without creating a late record and releases the visible request', async () => {
  const f = await claudeFixture(), finish = delayInstallation(f.entry);
  const pending = invoke('configurations-prepare-detected-claude', f.id, 'cancel-claude');
  await invoke('configurations-cancel-detected', 'cancel-claude');
  expect(await pending).toMatchObject({ configurationId: null, reason: 'cancelled' });
  finish(); await new Promise(resolve => setImmediate(resolve)); await flushSetup();
  expect(registry.snapshot().records).toEqual([]);
  expect(readFileSync(f.settings, 'utf8')).toBe(f.original);
});
it('cancels a Claude scan in Main before further reads and rejects old cancellation against a newer scan', async () => {
  const f = await claudeFixture();
  // A completed scan can be canceled while the combined UI still waits for pi.
  await invoke('configurations-cancel-claude-scan', 'scan-request');
  expect(claudeDiscovery.candidate(f.id)).toBeNull();
  const stat = ReadBudget.prototype.stat;
  const finish = delayInstallation(f.entry);
  let manifestReads = 0;
  const json = ReadBudget.prototype.json;
  vi.spyOn(ReadBudget.prototype, 'json').mockImplementation(function(this: ReadBudget, path) {
    if (path === f.manifest) manifestReads++;
    return json.call(this, path);
  });
  const pending = invoke('configurations-detect-claude', 'pending-scan');
  await flushSetup();
  await invoke('configurations-cancel-claude-scan', 'pending-scan');
  finish();
  expect(await pending).toMatchObject({ notice: 'cancelled', installations: [] });
  expect(manifestReads).toBe(0); expect(claudeDiscovery.candidate(f.id)).toBeNull();
  vi.mocked(ReadBudget.prototype.stat).mockImplementation(stat);
  const next = await invoke('configurations-detect-claude', 'new-scan') as Awaited<ReturnType<ClaudeDiscovery['detect']>>;
  await invoke('configurations-cancel-claude-scan', 'pending-scan');
  expect(claudeDiscovery.candidate(next.installations[0]!.id)).not.toBeNull();
});
