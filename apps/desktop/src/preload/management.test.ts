import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from '../shared/preferences.js';
const native = vi.hoisted(() => ({ expose: vi.fn(), invoke: vi.fn() }));
const events = new EventEmitter();
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: native.expose }, ipcRenderer: {
  invoke: native.invoke,
  on: (name: string, callback: (...args: unknown[]) => void) => events.on(name, callback),
  removeListener: (name: string, callback: (...args: unknown[]) => void) => events.removeListener(name, callback),
} }));
describe('management preload capability boundary', () => {
  it('exposes only management capabilities and strips Electron events with exact cleanup', async () => {
    await import('./management.js');
    expect(native.expose).toHaveBeenCalledExactlyOnceWith('management', expect.any(Object));
    const api = native.expose.mock.calls[0]![1] as Window['management'];
    expect(Object.keys(api).sort()).toEqual(['getState', 'piPreflight', 'setLogin', 'subscribe', 'updatePreferences']);
    await api.getState(); await api.updatePreferences({ petSize: 200 }); await api.setLogin(true);
    expect(native.invoke.mock.calls).toEqual([['management:get-state'], ['management:update-preferences', { petSize: 200 }], ['management:set-login', true]]);
    expect(Object.keys(api.piPreflight).sort()).toEqual(['chooseInstallation', 'chooseTarget', 'detect', 'getState', 'inspect', 'selectInstallation', 'useDefaultTarget']);
    native.invoke.mockClear();
    await api.piPreflight.getState(); await api.piPreflight.detect(); await api.piPreflight.chooseInstallation();
    await api.piPreflight.selectInstallation('opaque-id'); await api.piPreflight.chooseTarget();
    await api.piPreflight.useDefaultTarget(); await api.piPreflight.inspect();
    expect(native.invoke.mock.calls).toEqual([
      ['management:pi-state'], ['management:pi-detect'], ['management:pi-choose-installation'],
      ['management:pi-select-installation', 'opaque-id'], ['management:pi-choose-target'],
      ['management:pi-default-target'], ['management:pi-inspect'],
    ]);
    const callback = vi.fn(); const off = api.subscribe(callback);
    const state = { preferences: defaultPreferences, preferenceError: null, login: { supported: false, enabled: false, error: null } };
    events.emit('management:state', { secretEvent: true }, state);
    expect(callback).toHaveBeenCalledExactlyOnceWith(state);
    off(); off(); expect(events.listenerCount('management:state')).toBe(0);
    native.invoke.mockRejectedValueOnce(new Error('IPC unavailable'));
    await expect(api.getState()).rejects.toThrow('IPC unavailable');
  });
});
