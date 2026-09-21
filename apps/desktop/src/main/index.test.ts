import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SessionObservation } from '@agent-pet/domain';
import type { OverlayLayout, Rect } from '../shared/overlay-layout.js';
import { piObservation } from '../renderer/test-support/pi-fixtures.js';

const native = vi.hoisted(() => {
  const frame = { url: '' };
  const webContents = { mainFrame: frame, send: vi.fn(), setWindowOpenHandler: vi.fn(), on: vi.fn() };
  const window = {
    webContents, setBounds: vi.fn(), isDestroyed: () => false,
    setAlwaysOnTop: vi.fn(), setVisibleOnAllWorkspaces: vi.fn(), setResizable: vi.fn(),
    loadFile: vi.fn(), loadURL: vi.fn(), once: vi.fn(), show: vi.fn(), hide: vi.fn(),
    setIgnoreMouseEvents: vi.fn(), on: vi.fn(), focus: vi.fn(), isMinimized: () => false, restore: vi.fn(),
  };
  return {
    handlers: new Map<string, (event: unknown, value?: unknown) => unknown>(),
    appEvents: new Map<string, (event?: { preventDefault(): void }) => void>(),
    path: '', lock: true, quit: vi.fn(), stop: vi.fn(), start: vi.fn(), loginSet: vi.fn(), loginGet: vi.fn(() => ({ openAtLogin: false })),
    management: undefined as typeof window | undefined,
    tray: { setContextMenu: vi.fn(), setToolTip: vi.fn(), on: vi.fn(), destroy: vi.fn() },
    window, webContents, options: vi.fn(), isPackaged: true,
    area: { x: 0, y: 25, width: 1440, height: 875 }, cursor: { x: 0, y: 0 },
    publish: undefined as ((value: SessionObservation) => void) | undefined,
  };
});
vi.mock('electron', () => ({
  app: {
    requestSingleInstanceLock: () => native.lock, getPath: () => native.path,
    getLoginItemSettings: native.loginGet, setLoginItemSettings: native.loginSet,
    whenReady: () => Promise.resolve(), get isPackaged() { return native.isPackaged; },
    on: (name: string, callback: (event?: { preventDefault(): void }) => void) => native.appEvents.set(name, callback),
    once: (name: string, callback: (event?: { preventDefault(): void }) => void) => native.appEvents.set(name, callback), quit: native.quit,
  },
  BrowserWindow: class {
    constructor(options: unknown) {
      native.options(options);
      const management = String((options as { title?: string }).title) === 'Agent Pet';
      const target = management ? { ...native.window,
        webContents: { ...native.webContents, mainFrame: { url: '' }, send: vi.fn(), on: vi.fn(), setWindowOpenHandler: vi.fn() },
        on: vi.fn(), once: vi.fn(), show: vi.fn(), hide: vi.fn(), focus: vi.fn(), loadFile: vi.fn(), loadURL: vi.fn(),
      } : native.window;
      target.loadFile.mockImplementation((file: string) => { target.webContents.mainFrame.url = pathToFileURL(file).href; });
      target.loadURL.mockImplementation((url: string) => { target.webContents.mainFrame.url = url; });
      if (management) native.management = target;
      return target;
    }
    static getAllWindows() { return [native.window]; }
  },
  ipcMain: { handle: (channel: string, handler: (event: unknown, value?: unknown) => unknown) => native.handlers.set(channel, handler) },
  nativeImage: { createFromBitmap: () => ({ setTemplateImage: vi.fn() }) },
  Tray: class { constructor() { return native.tray; } },
  Menu: { buildFromTemplate: vi.fn(template => template), setApplicationMenu: vi.fn() },
  screen: {
    getDisplayMatching: () => ({ workArea: native.area }),
    getCursorScreenPoint: () => native.cursor, on: vi.fn(),
  },
}));
vi.mock('./pi-config.js', () => ({ readPiBridgeConfig: () => ({ endpoint: 'test-only', token: 'test-only' }) }));
vi.mock('@agent-pet/adapter-pi', () => ({ PiBridgeAdapter: class {
  readonly provider = 'pi';
  async openSession() { return { status: 'unsupported' }; }
  async start(_config: unknown, sink: { publish(value: SessionObservation): void }) {
    await native.start(); native.publish = sink.publish;
    return { stop: native.stop };
  }
} }));

function invoke(channel: string, value?: unknown, event: unknown = {
  sender: native.webContents, senderFrame: native.webContents.mainFrame,
}) {
  const handler = native.handlers.get(channel);
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
  return handler(event, value);
}
function latestLayout(): OverlayLayout {
  const call = native.webContents.send.mock.calls.filter(([channel]) => channel === 'pet:layout').at(-1);
  if (!call) throw new Error('No layout delivered');
  return call[1] as OverlayLayout;
}
function pointAt(rect: Rect) {
  const { bounds } = latestLayout();
  native.cursor = { x: bounds.x + rect.x + rect.width / 2, y: bounds.y + rect.y + rect.height / 2 };
}
function expectHit(hit: boolean) {
  vi.advanceTimersByTime(50);
  expect(native.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(!hit, { forward: true });
}

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  native.handlers.clear(); native.appEvents.clear(); native.publish = undefined;
  native.isPackaged = true; native.lock = true;
  native.path = mkdtempSync(join(tmpdir(), 'pet-p1-main-'));
  native.stop.mockResolvedValue(undefined); native.start.mockResolvedValue(undefined);
  native.loginGet.mockReturnValue({ openAtLogin: false });
  native.area = { x: 0, y: 25, width: 1440, height: 875 };
  native.cursor = { x: 0, y: 0 };
  await import('./index.js');
});
afterEach(() => { native.appEvents.get('will-quit')?.(); vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(native.path, { recursive: true, force: true }); });

describe('Main public IPC layout/hit baseline (mock Electron, not native acceptance)', () => {
  it.each(['packaged', 'development'])('allows only exact entry reload in %s, not other navigation', async mode => {
    if (mode === 'development') {
      native.appEvents.get('will-quit')?.();
      vi.resetModules(); vi.clearAllMocks();
      native.isPackaged = false;
      vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5174');
      await import('./index.js');
    }
    const entry = mode === 'development' ? 'http://localhost:5174/'
      : pathToFileURL(native.window.loadFile.mock.calls[0]![0]).href;
    const handler = native.webContents.on.mock.calls.find(([name]) => name === 'will-navigate')![1];
    const preventDefault = vi.fn();
    handler({ url: entry, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    for (const url of [entry + '?other=1', entry + '#other', entry + '/other',
      'https://example.com/', 'file:///tmp/not-renderer.html', 'javascript:alert(1)', 'about:blank']) {
      preventDefault.mockClear();
      handler({ url, preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
    }
  });

  it('starts at 140 and clamps square resizing to 80..600', () => {
    expect(native.options).toHaveBeenCalledWith(expect.objectContaining({ width: 140, height: 140, minWidth: 80, minHeight: 80 }));
    expect(latestLayout().anchor).toEqual({ x: 100, y: 300, width: 140, height: 140 });
    invoke('pet:resize-window-by', { x: -1000, y: -1000 });
    expect(latestLayout().pet).toMatchObject({ width: 80, height: 80 });
    invoke('pet:resize-window-by', { x: 20, y: 40 });
    expect(latestLayout().pet).toMatchObject({ width: 110, height: 110 });
    invoke('pet:resize-window-by', { x: 10000, y: 10000 });
    expect(latestLayout().pet).toMatchObject({ width: 600, height: 600 });
  });

  it('uses the last clamped anchor on the next move, including negative-coordinate displays', () => {
    native.area = { x: -1280, y: -200, width: 1280, height: 900 };
    invoke('pet:move-window-by', { x: -9999, y: -9999 });
    const edge = latestLayout();
    // The mock records references; Electron IPC would structured-clone this value.
    const edgeAnchor = { ...edge.anchor };
    expect(edge.bounds.x).toBeGreaterThanOrEqual(-1280);
    expect(edge.bounds.y).toBeGreaterThanOrEqual(-200);
    expect(edge.bounds.x + edge.bounds.width).toBeLessThanOrEqual(0);
    expect(edge.bubbles.y).toBeGreaterThanOrEqual(edge.pet.y + edge.pet.height);
    invoke('pet:move-window-by', { x: 10, y: 10 });
    expect(latestLayout().anchor.x).toBe(edgeAnchor.x + 10);
    expect(latestLayout().anchor.y).toBe(edgeAnchor.y + 10);
    expect(native.window.setBounds).toHaveBeenLastCalledWith(latestLayout().bounds);
  });

  it('returns snapshot and authoritative layout through request-snapshot', () => {
    native.publish!(piObservation());
    native.webContents.send.mockClear();
    invoke('pet:request-snapshot');
    expect(native.webContents.send.mock.calls.map(([channel]) => channel)).toEqual(['pet:snapshot', 'pet:layout']);
    expect(native.webContents.send.mock.calls[0]?.[1].bubbles[0]).toMatchObject({ status: 'working' });
  });

  it('hits pet/toolbar, only visible populated bubbles, and reserves the expanded region', async () => {
    const layout = latestLayout();
    pointAt(layout.pet); expectHit(true);
    pointAt(layout.toolbar); expectHit(true);
    pointAt(layout.bubbles); expectHit(false); // no session bubbles
    native.publish!(piObservation({ status: 'completed' }));
    invoke('pet:bubbles-visible', true); // renderer has prepared presentation
    const bottomStrip = { ...layout.bubbles, y: layout.bubbles.y + layout.bubbles.height - 40, height: 20 };
    const topStrip = { ...layout.bubbles, height: 20 };
    pointAt(bottomStrip); expectHit(true);
    pointAt(topStrip); expectHit(false);
    invoke('pet:bubbles-expanded', true); expectHit(true);
    invoke('pet:bubbles-visible', false); expectHit(false);
    pointAt(layout.pet); expectHit(true); // hiding bubbles does not hide pet
    invoke('pet:bubbles-visible', true);
    await invoke('pet:acknowledge-and-open', { provider: 'pi', sessionId: 'pi:baseline:working' });
    pointAt(bottomStrip); expectHit(true); // snapshot removal alone must not drop visible DOM
    invoke('pet:bubbles-visible', false); // renderer committed removal
    expectHit(false);
    invoke('pet:interaction', true); expectHit(true);
    invoke('pet:interaction', false); expectHit(false);
  });

  it('anchors the collapsed hit strip to the top when bubbles are below the pet', () => {
    invoke('pet:move-window-by', { x: 0, y: -9999 });
    const layout = latestLayout();
    expect(layout.bubbles.y).toBeGreaterThan(layout.pet.y);
    native.publish!(piObservation());
    invoke('pet:bubbles-visible', true);
    pointAt({ ...layout.bubbles, height: 20 }); expectHit(true);
    pointAt({ ...layout.bubbles, y: layout.bubbles.y + 100, height: 20 }); expectHit(false);
    invoke('pet:bubbles-expanded', true); expectHit(true);
  });

  it('installs hit policy synchronously before control IPC returns, without waiting for the 50ms poll', () => {
    const layout = latestLayout();
    pointAt({ ...layout.bubbles, height: 20 });
    invoke('pet:bubbles-visible', true);
    expect(native.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    invoke('pet:bubbles-expanded', true);
    expect(native.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    invoke('pet:bubbles-visible', false);
    expect(native.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    invoke('pet:interaction', true);
    expect(native.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    invoke('pet:interaction', false);
    expect(native.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
  });

  it.each(['did-start-loading', 'render-process-gone'])('resets stale presentation and interaction on %s without relying on React cleanup', event => {
    const layout = latestLayout();
    pointAt({ ...layout.bubbles, height: 20 });
    invoke('pet:bubbles-visible', true);
    invoke('pet:bubbles-expanded', true);
    invoke('pet:interaction', true);
    const listener = native.webContents.on.mock.calls.find(([name]) => name === event)?.[1];
    expect(listener).toBeTypeOf('function');
    listener();
    expect(native.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    invoke('pet:bubbles-visible', true);
    expectHit(false); // expansion was reset too
  });

  it('rejects foreign senders/subframes and malformed control payloads without changing layout', () => {
    const layout = latestLayout();
    for (const event of [{ sender: {}, senderFrame: native.webContents.mainFrame },
      { sender: native.webContents, senderFrame: {} }]) {
      expect(() => invoke('pet:move-window-by', { x: 1, y: 1 }, event)).toThrow('Untrusted renderer');
      for (const channel of ['pet:bubbles-visible', 'pet:bubbles-expanded', 'pet:interaction']) {
        expect(() => invoke(channel, true, event)).toThrow('Untrusted renderer');
      }
    }
    for (const channel of ['pet:move-window-by', 'pet:resize-window-by']) {
      for (const value of [null, { x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: '1', y: 0 }]) {
        expect(() => invoke(channel, value)).toThrow('Invalid delta');
      }
    }
    for (const channel of ['pet:bubbles-expanded', 'pet:bubbles-visible', 'pet:interaction']) {
      expect(() => invoke(channel, 'true')).toThrow(TypeError);
    }
    expect(latestLayout()).toBe(layout);
  });
});

describe('P1 actual Main entry with isolated Electron boundary', () => {
  function managementEvent() {
    return { sender: native.management!.webContents, senderFrame: native.management!.webContents.mainFrame };
  }
  it.runIf(process.platform === 'darwin')('keeps all-workspaces pet setup from changing the entire app into a Dock-less UI element', () => {
    expect(native.window.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true, skipTransformProcessType: true,
    });
  });
  it('creates distinct sandboxed entries and denies cross-window, subframe and navigated-frame capabilities', () => {
    expect(native.management).toBeDefined();
    expect(native.management!.webContents).not.toBe(native.webContents);
    expect(native.options).toHaveBeenCalledWith(expect.objectContaining({ title: 'Agent Pet', webPreferences: expect.objectContaining({ sandbox: true, contextIsolation: true, nodeIntegration: false }) }));
    for (const channel of ['pet:request-snapshot', 'pet:interaction', 'pet:resize-window-by']) {
      expect(() => invoke(channel, true, managementEvent())).toThrow('Untrusted renderer');
    }
    for (const channel of ['management:get-state', 'management:update-preferences', 'management:set-login']) {
      expect(() => invoke(channel, true)).toThrow('Untrusted renderer');
      expect(() => invoke(channel, true, { sender: native.management!.webContents, senderFrame: {} })).toThrow('Untrusted renderer');
    }
    const saved = native.management!.webContents.mainFrame.url;
    native.management!.webContents.mainFrame.url = 'file:///tmp/hostile.html';
    expect(() => invoke('management:get-state', undefined, managementEvent())).toThrow('Untrusted renderer');
    native.management!.webContents.mainFrame.url = saved;
    const read = invoke('management:get-state', undefined, managementEvent());
    expect(JSON.stringify(read)).not.toMatch(/token|endpoint|test-only/);
    for (const name of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
      const handler = native.management!.webContents.on.mock.calls.find(([event]) => event === name)![1];
      const preventDefault = vi.fn();
      handler({ url: saved, preventDefault }); expect(preventDefault).not.toHaveBeenCalled();
      handler({ url: native.webContents.mainFrame.url, preventDefault }); expect(preventDefault).toHaveBeenCalledOnce();
    }
    expect(native.management!.webContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({ action: 'deny' });
  });
  it('close hides, activate/second instance/tray reopens, and visibility and toolbar size persist together', () => {
    const close = native.management!.on.mock.calls.find(([event]) => event === 'close')![1];
    const preventDefault = vi.fn();
    close({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(native.management!.hide).toHaveBeenCalledOnce();
    expect(native.stop).not.toHaveBeenCalled(); expect(native.quit).not.toHaveBeenCalled();
    native.appEvents.get('activate')!(); native.appEvents.get('second-instance')!();
    native.tray.on.mock.calls.find(([event]) => event === 'click')![1]();
    expect(native.management!.focus).toHaveBeenCalledTimes(3);
    expect(native.options).toHaveBeenCalledTimes(2);
    expect(native.start).toHaveBeenCalledOnce();
    invoke('management:update-preferences', { petVisible: false, petSize: 220 }, managementEvent());
    expect(native.window.hide).toHaveBeenCalled(); expect(latestLayout().pet.width).toBe(220);
    native.window.show.mockClear(); native.window.hide.mockClear();
    invoke('pet:resize-window-by', { x: 10, y: 10 });
    expect(native.window.show).not.toHaveBeenCalled(); expect(native.window.hide).not.toHaveBeenCalled();
    const saved = JSON.parse(readFileSync(join(native.path, 'preferences.json'), 'utf8'));
    expect(saved).toEqual({ schemaVersion: 1, petVisible: false, petSize: 230 });
    invoke('management:update-preferences', { petVisible: true }, managementEvent());
    expect(native.window.show).toHaveBeenCalled();
    native.appEvents.get('window-all-closed')!(); expect(native.quit).not.toHaveBeenCalled();
  });
  it('does not reshow management when closed before ready-to-show', () => {
    const window = native.management!;
    window.on.mock.calls.find(([event]) => event === 'close')![1]({ preventDefault: vi.fn() });
    window.show.mockClear();
    window.once.mock.calls.find(([event]) => event === 'ready-to-show')![1]();
    expect(window.show).not.toHaveBeenCalled();
    native.appEvents.get('activate')!();
    expect(window.show).toHaveBeenCalledOnce();
  });
  it('rejects invalid management patches without native effects', () => {
    expect(() => invoke('management:update-preferences', { path: '/tmp/no' }, managementEvent())).toThrow(TypeError);
    expect(() => invoke('management:set-login', 'yes', managementEvent())).toThrow(TypeError);
    expect(native.loginSet).not.toHaveBeenCalled();
  });
  it('never registers login items at startup; dev refuses opt-in without calling OS login APIs', async () => {
    expect(native.loginSet).not.toHaveBeenCalled();
    native.appEvents.get('will-quit')?.(); vi.resetModules(); vi.clearAllMocks(); native.isPackaged = false;
    await import('./index.js');
    const result = invoke('management:set-login', true, managementEvent());
    expect(result).toMatchObject({ login: { supported: false, enabled: false, error: expect.any(String) } });
    expect(native.loginSet).not.toHaveBeenCalled(); expect(native.loginGet).not.toHaveBeenCalled();
  });
  it.runIf(process.platform === 'darwin')('verifies packaged macOS opt-in and reports OS failures truthfully', () => {
    native.loginGet.mockReturnValue({ openAtLogin: true });
    expect(invoke('management:set-login', true, managementEvent())).toMatchObject({ login: { supported: true, enabled: true, error: null } });
    expect(native.loginSet).toHaveBeenCalledWith({ openAtLogin: true });
    native.loginGet.mockReturnValue({ openAtLogin: false });
    expect(invoke('management:set-login', true, managementEvent())).toMatchObject({ login: { enabled: false, error: expect.any(String) } });
    native.loginSet.mockImplementationOnce(() => { throw new Error('OS denied'); });
    expect(invoke('management:set-login', true, managementEvent())).toMatchObject({ login: { enabled: false, error: expect.any(String) } });
  });
  it('explicit quit awaits Adapter stop once and allows real window closure only while quitting', async () => {
    let finish!: () => void;
    native.stop.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const event = { preventDefault: vi.fn() };
    native.appEvents.get('before-quit')!(event);
    native.appEvents.get('before-quit')!(event);
    await Promise.resolve();
    expect(native.stop).toHaveBeenCalledOnce(); expect(native.quit).not.toHaveBeenCalled();
    const close = native.management!.on.mock.calls.find(([event]) => event === 'close')![1];
    const preventDefault = vi.fn(); close({ preventDefault }); expect(preventDefault).not.toHaveBeenCalled();
    finish(); for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(native.tray.destroy).toHaveBeenCalledOnce(); expect(native.quit).toHaveBeenCalledOnce();
    event.preventDefault.mockClear(); native.appEvents.get('before-quit')!(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
  it('restores hidden pet and size from disk; ready-to-show cannot override hidden preference', async () => {
    native.appEvents.get('will-quit')?.(); vi.resetModules(); vi.clearAllMocks();
    writeFileSync(join(native.path, 'preferences.json'), JSON.stringify({ schemaVersion: 1, petVisible: false, petSize: 260 }));
    await import('./index.js');
    expect(latestLayout().pet.width).toBe(260);
    native.window.once.mock.calls.find(([event]) => event === 'ready-to-show')![1]();
    expect(native.window.show).not.toHaveBeenCalled(); expect(native.window.hide).toHaveBeenCalled();
    expect(invoke('management:get-state', undefined, managementEvent())).toMatchObject({ preferences: { petVisible: false, petSize: 260 } });
  });
  it('failed toolbar persistence retains geometry and opens management with the error', () => {
    mkdirSync(join(native.path, 'preferences.json'));
    const width = latestLayout().pet.width;
    invoke('pet:resize-window-by', { x: 20, y: 20 });
    expect(latestLayout().pet.width).toBe(width);
    expect(native.management!.focus).toHaveBeenCalled();
    expect(invoke('management:get-state', undefined, managementEvent())).toMatchObject({ preferenceError: expect.stringContaining('未应用') });
  });
  it('quit during Adapter startup waits for its handle, then stops it rather than leaking a late listener', async () => {
    native.appEvents.get('will-quit')?.(); vi.resetModules(); vi.clearAllMocks();
    let started!: () => void;
    native.start.mockReturnValueOnce(new Promise<void>(resolve => { started = resolve; }));
    await import('./index.js');
    native.appEvents.get('before-quit')!({ preventDefault: vi.fn() });
    await Promise.resolve(); expect(native.stop).not.toHaveBeenCalled(); expect(native.quit).not.toHaveBeenCalled();
    started(); for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(native.stop).toHaveBeenCalledOnce(); expect(native.quit).toHaveBeenCalledOnce();
  });
  it('a losing single instance exits before creating windows, Adapter, preferences or IPC', async () => {
    native.appEvents.get('will-quit')?.(); vi.resetModules(); vi.clearAllMocks(); native.handlers.clear();
    native.lock = false;
    await import('./index.js');
    expect(native.quit).toHaveBeenCalledOnce(); expect(native.options).not.toHaveBeenCalled();
    expect(native.start).not.toHaveBeenCalled(); expect(native.handlers.size).toBe(0);
  });
});
