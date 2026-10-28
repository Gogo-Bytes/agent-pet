import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyObservation, createSessionState } from '@agent-pet/domain';
import type { AgentConfiguration, ConfigurationsState } from '../shared/configurations.js';
import { defaultPreferences } from '../shared/preferences.js';
import { createDesktopPets } from './desktop-pets.js';

const native = vi.hoisted(() => ({ windows: [] as any[], cursor: { x: 0, y: 0 } }));
vi.mock('electron', () => ({
  BrowserWindow: class {
    constructor() {
      let destroyed = false; let visible = false;
      const window: any = {
        webContents: { mainFrame: { url: '' }, send: vi.fn(), on: vi.fn(), reload: vi.fn(), setWindowOpenHandler: vi.fn(), setZoomFactor: vi.fn() },
        setBounds: vi.fn(), setIgnoreMouseEvents: vi.fn(), setAlwaysOnTop: vi.fn(), setVisibleOnAllWorkspaces: vi.fn(),
        moveTop: vi.fn(), setResizable: vi.fn(), on: vi.fn(), once: vi.fn(),
        isDestroyed: () => destroyed, isVisible: () => visible,
        showInactive: vi.fn(() => { visible = true; }), hide: vi.fn(() => { visible = false; }),
        destroy: vi.fn(() => { destroyed = true; }),
        loadFile: vi.fn((path: string) => { window.webContents.mainFrame.url = `file://${path}`; }),
      };
      native.windows.push(window); return window;
    }
  },
  screen: { getCursorScreenPoint: () => native.cursor, getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
}));
function record(id: string, assetId = 'starter'): AgentConfiguration {
  return { id, name: id, provider: 'pi', pet: { assetId, name: `pet ${id}` }, targetPath: `/isolated/${id}`,
    installation: null, availability: 'available', inspection: null,
    connection: { revision: 0, status: 'connected', mode: 'desktop', busy: false, canConfigure: false, preview: null,
      deployedPath: null, canRemove: false, canResume: false, receiving: 'active', saved: 'none', notice: 'none' } };
}
function state(records: AgentConfiguration[], sessionConfigurations: Record<string, string> = {}): ConfigurationsState {
  return { revision: 1, records, sessionConfigurations, notice: 'none', busy: false };
}
function event(window: any) { return { sender: window.webContents, senderFrame: window.webContents.mainFrame } as Electron.IpcMainInvokeEvent; }
function last(window: any, channel: string) { return window.webContents.send.mock.calls.filter(([name]: string[]) => name === channel).at(-1)?.[1]; }
function callback(window: any, name: string) { return window.once.mock.calls.find(([value]: string[]) => value === name)![1]; }
function setup() {
  let preferences = { ...defaultPreferences, offline: true };
  let quitting = false;
  const sessions = ['one-work', 'one-error', 'two-work', 'orphan'].reduce((value, sessionId) => applyObservation(value, {
    sessionId, provider: 'pi', status: sessionId.endsWith('error') ? 'error' : 'working', observedAt: '2026-10-20T00:00:00Z',
  }), createSessionState());
  const resize = vi.fn(); const hide = vi.fn();
  const pets = createDesktopPets({ directory: '/test/main', preferences: () => preferences, sessions: () => sessions,
    isQuitting: () => quitting, resize, hide });
  return { pets, resize, hide, setPreferences(patch: Partial<typeof preferences>) { preferences = { ...preferences, ...patch }; pets.applyPreferences(); }, quit() { quitting = true; } };
}
beforeEach(() => { native.windows = []; native.cursor = { x: 0, y: 0 }; });
describe('desktop pets own one native overlay per online, explicitly bound configuration', () => {
  it('creates no eager default pet for empty, offline or unbound configurations despite offline preference', () => {
    const { pets } = setup();
    pets.updateConfigurations(state([]));
    pets.updateConfigurations(state([{ ...record('offline'), connection: null }, { ...record('unbound'), pet: null }]));
    expect(native.windows).toHaveLength(0);
  });
  it('keeps same-provider configurations separate and routes only each configuration’s Sessions, bubbles and binding', () => {
    const { pets } = setup();
    pets.updateConfigurations(state([record('one', 'artist-pet'), record('two')], { 'one-work': 'one', 'one-error': 'one', 'two-work': 'two', orphan: 'removed' }));
    expect(native.windows).toHaveLength(2);
    const [one, two] = native.windows;
    pets.requestSnapshot(event(one)); pets.requestSnapshot(event(two));
    expect(Object.keys(last(one, 'pet:snapshot').sessions)).toEqual(['one-work', 'one-error']);
    expect(last(one, 'pet:snapshot').bubbles.map((bubble: any) => bubble.sessionId)).toEqual(['one-work', 'one-error']);
    expect(Object.keys(last(two, 'pet:snapshot').sessions)).toEqual(['two-work']);
    expect(last(one, 'pet:preferences')).toMatchObject({ petAssetId: 'artist-pet', petName: 'pet one' });
    expect(last(two, 'pet:preferences')).toMatchObject({ petAssetId: 'starter', petName: 'pet two' });
    expect(last(one, 'pet:layout').anchor).not.toEqual(last(two, 'pet:layout').anchor);
  });
  it('destroys on unbind/offline without waiting for a Session and cannot reshow a removed pending window', () => {
    const { pets } = setup(); pets.updateConfigurations(state([record('one'), record('two')]));
    const [one, two] = native.windows;
    pets.updateConfigurations(state([{ ...record('one'), pet: null }, { ...record('two'), connection: null }]));
    expect(one.destroy).toHaveBeenCalledOnce(); expect(two.destroy).toHaveBeenCalledOnce();
    callback(one, 'ready-to-show')(); callback(two, 'ready-to-show')();
    expect(one.showInactive).not.toHaveBeenCalled(); expect(two.showInactive).not.toHaveBeenCalled();
    expect(() => pets.requestSnapshot(event(one))).toThrow('Untrusted renderer');
  });
  it('updates a binding in place and does not duplicate windows on repeated state publication', () => {
    const { pets } = setup(); pets.updateConfigurations(state([record('one')]));
    pets.updateConfigurations(state([record('one', 'custom')]));
    pets.updateConfigurations(state([record('one', 'custom')]));
    expect(native.windows).toHaveLength(1); expect(last(native.windows[0], 'pet:preferences').petAssetId).toBe('custom');
  });
  it('rejects foreign frames, cross-configuration asset requests and Session actions', () => {
    const { pets } = setup(); pets.updateConfigurations(state([record('one', 'custom'), record('two')], { 'one-work': 'one', 'two-work': 'two' }));
    const [one, two] = native.windows;
    expect(() => pets.assertAsset(event(one), 'custom')).not.toThrow();
    expect(() => pets.assertAsset(event(one), 'starter')).toThrow('Asset belongs to another pet');
    expect(() => pets.assertSession(event(one), 'two-work', 'pi')).toThrow('Session belongs to another pet');
    expect(() => pets.assertSession(event(two), 'orphan', 'pi')).toThrow('Session belongs to another pet');
    expect(() => pets.assertSession(event(two), 'two-work', 'pi')).not.toThrow();
    expect(() => pets.requestSnapshot({ ...event(one), senderFrame: {} } as Electron.IpcMainInvokeEvent)).toThrow('Untrusted renderer');
    expect(() => pets.assertSession(event(one), 'one-work', 'claude')).toThrow('Session belongs to another pet');
    one.webContents.mainFrame.url = 'https://hostile.invalid/';
    expect(() => pets.requestSnapshot(event(one))).toThrow('Untrusted renderer');
  });
  it('moves and hit-tests each native window independently and keeps global size/visibility preferences', () => {
    const f = setup(); f.pets.updateConfigurations(state([record('one'), record('two')]));
    const [one, two] = native.windows; const before = structuredClone(last(two, 'pet:layout'));
    f.pets.move(event(one), { x: 10, y: -20 });
    expect(last(two, 'pet:layout')).toEqual(before);
    f.pets.presentation(event(one), 'interacting', true); f.pets.updateHitPolicies();
    expect(one.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    expect(two.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    callback(one, 'ready-to-show')(); callback(two, 'ready-to-show')();
    f.setPreferences({ petVisible: false, petSize: 200 });
    for (const window of [one, two]) { expect(window.hide).toHaveBeenCalledOnce(); expect(last(window, 'pet:layout').pet.width).toBe(200); }
    f.pets.resize(event(one), { x: 20, y: 20 }); expect(f.resize).toHaveBeenCalledWith(220);
  });
  it('closes every overlay on shutdown and rejects stale renderer calls and late ready events', () => {
    const f = setup(); f.pets.updateConfigurations(state([record('one'), record('two')]));
    f.pets.close();
    for (const window of native.windows) {
      expect(window.destroy).toHaveBeenCalledOnce(); callback(window, 'ready-to-show')();
      expect(window.showInactive).not.toHaveBeenCalled();
      expect(() => f.pets.requestSnapshot(event(window))).toThrow('Untrusted renderer');
    }
  });
  it('bounds renderer recovery per window and prevents ready-to-show while quitting', () => {
    const f = setup(); f.pets.updateConfigurations(state([record('one'), record('two')]));
    const [one, two] = native.windows;
    for (const window of [one, two]) {
      const crash = window.webContents.on.mock.calls.find(([name]: string[]) => name === 'render-process-gone')![1];
      crash(); crash(); expect(window.webContents.reload).toHaveBeenCalledOnce();
    }
    f.quit(); callback(one, 'ready-to-show')(); callback(two, 'ready-to-show')();
    expect(one.showInactive).not.toHaveBeenCalled(); expect(two.showInactive).not.toHaveBeenCalled();
  });
});
