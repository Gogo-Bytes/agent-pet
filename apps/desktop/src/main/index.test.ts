import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionObservation } from '@agent-pet/domain';
import type { OverlayLayout, Rect } from './overlay-layout.js';
import { piObservation } from '../renderer/test-support/pi-fixtures.js';

const native = vi.hoisted(() => {
  const frame = {};
  const webContents = { mainFrame: frame, send: vi.fn(), setWindowOpenHandler: vi.fn(), on: vi.fn() };
  const window = {
    webContents, setBounds: vi.fn(), isDestroyed: () => false,
    setAlwaysOnTop: vi.fn(), setVisibleOnAllWorkspaces: vi.fn(), setResizable: vi.fn(),
    loadFile: vi.fn(), loadURL: vi.fn(), once: vi.fn(), show: vi.fn(), hide: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
  };
  return {
    handlers: new Map<string, (event: unknown, value?: unknown) => unknown>(),
    appEvents: new Map<string, () => void>(),
    window, webContents, options: vi.fn(),
    area: { x: 0, y: 25, width: 1440, height: 875 }, cursor: { x: 0, y: 0 },
    publish: undefined as ((value: SessionObservation) => void) | undefined,
  };
});
vi.mock('electron', () => ({
  app: {
    whenReady: () => Promise.resolve(), isPackaged: true,
    on: (name: string, callback: () => void) => native.appEvents.set(name, callback),
    once: (name: string, callback: () => void) => native.appEvents.set(name, callback), quit: vi.fn(),
  },
  BrowserWindow: class {
    constructor(options: unknown) { native.options(options); return native.window; }
    static getAllWindows() { return [native.window]; }
  },
  ipcMain: { handle: (channel: string, handler: (event: unknown, value?: unknown) => unknown) => native.handlers.set(channel, handler) },
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
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
    native.publish = sink.publish;
    return { stop: vi.fn() };
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
  native.area = { x: 0, y: 25, width: 1440, height: 875 };
  native.cursor = { x: 0, y: 0 };
  await import('./index.js');
});
afterEach(() => { native.appEvents.get('will-quit')?.(); vi.useRealTimers(); });

describe('Main public IPC layout/hit baseline (mock Electron, not native acceptance)', () => {
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
    const bottomStrip = { ...layout.bubbles, y: layout.bubbles.y + layout.bubbles.height - 40, height: 20 };
    const topStrip = { ...layout.bubbles, height: 20 };
    pointAt(bottomStrip); expectHit(true);
    pointAt(topStrip); expectHit(false);
    invoke('pet:bubbles-expanded', true); expectHit(true);
    invoke('pet:bubbles-visible', false); expectHit(false);
    pointAt(layout.pet); expectHit(true); // hiding bubbles does not hide pet
    invoke('pet:bubbles-visible', true);
    await invoke('pet:acknowledge-and-open', { provider: 'pi', sessionId: 'pi:baseline:working' });
    pointAt(bottomStrip); expectHit(false);
    invoke('pet:interaction', true); expectHit(true);
    invoke('pet:interaction', false); expectHit(false);
  });

  it('anchors the collapsed hit strip to the top when bubbles are below the pet', () => {
    invoke('pet:move-window-by', { x: 0, y: -9999 });
    const layout = latestLayout();
    expect(layout.bubbles.y).toBeGreaterThan(layout.pet.y);
    native.publish!(piObservation());
    pointAt({ ...layout.bubbles, height: 20 }); expectHit(true);
    pointAt({ ...layout.bubbles, y: layout.bubbles.y + 100, height: 20 }); expectHit(false);
    invoke('pet:bubbles-expanded', true); expectHit(true);
  });

  it('rejects foreign senders/subframes and malformed control payloads without changing layout', () => {
    const layout = latestLayout();
    for (const event of [{ sender: {}, senderFrame: native.webContents.mainFrame },
      { sender: native.webContents, senderFrame: {} }]) {
      expect(() => invoke('pet:move-window-by', { x: 1, y: 1 }, event)).toThrow('Untrusted renderer');
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
