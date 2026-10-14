import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { Configurations } from './configurations.js';
import { registerConfigurationIpc } from './configuration-ipc.js';
import { loadTrustedEntry } from './window-trust.js';
const native = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>(), pick: vi.fn(), approve: vi.fn(), open: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, callback: (...args: unknown[]) => unknown) => native.handlers.set(name, callback) }, dialog: { showOpenDialog: native.pick, showMessageBox: native.approve }, shell: { openExternal: native.open } }));
let directory: string;
let registry: Configurations;
let window: BrowserWindow;
let event: { sender: BrowserWindow['webContents']; senderFrame: BrowserWindow['webContents']['mainFrame'] };
let closed: boolean;
beforeEach(() => {
  native.handlers.clear(); native.pick.mockReset(); native.approve.mockReset(); native.open.mockReset();
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'agent-pet-ipc-')));
  const profile = join(directory, 'profile'); mkdirSync(profile, { mode: 0o700 });
  registry = new Configurations({ directory: profile, adapter: () => ({ start: vi.fn() }), publish: vi.fn() });
  const contents = { mainFrame: { url: 'file:///review.html' }, setWindowOpenHandler: vi.fn(), on: vi.fn() };
  window = { webContents: contents, isDestroyed: () => false, loadFile: vi.fn(), loadURL: vi.fn() } as unknown as BrowserWindow;
  loadTrustedEntry(window, '/review.html'); closed = false;
  event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  registerConfigurationIpc({ window: () => window, configurations: registry, sessions: () => ({ sessions: {}, bubbles: [] }), quitting: () => closed });
});
afterEach(async () => { await registry.stop(); rmSync(directory, { recursive: true, force: true }); });
const invoke = (action: string, ...args: unknown[]) => native.handlers.get(`management:${action}`)!(event, ...args);
describe('configuration host capability boundary', () => {
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
