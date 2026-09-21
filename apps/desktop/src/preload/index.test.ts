import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baselineLayout, piBaselineObservations } from '../renderer/test-support/pi-fixtures.js';
import { createPetBridgeDouble } from '../renderer/test-support/pet-bridge-double.js';

const electron = vi.hoisted(() => ({ exposeInMainWorld: vi.fn(), invoke: vi.fn() }));
const events = new EventEmitter();
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: (channel: string, listener: (...args: unknown[]) => void) => events.on(channel, listener),
    removeListener: (channel: string, listener: (...args: unknown[]) => void) => events.removeListener(channel, listener),
  },
}));

let api: Window['pet'];
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  events.removeAllListeners();
  electron.invoke.mockReset().mockResolvedValue(undefined);
  await import('./index.js');
  expect(electron.exposeInMainWorld).toHaveBeenCalledWith('pet', expect.any(Object));
  api = electron.exposeInMainWorld.mock.calls[0]![1] as Window['pet'];
});

describe('preload public renderer bridge', () => {
  it('delivers initial pushed state/layout without leaking IPC events; cleans up exact listeners', async () => {
    const bridge = createPetBridgeDouble({ observations: piBaselineObservations() });
    try {
      const snapshot = bridge.snapshot();
      const layout = baselineLayout();
      electron.invoke.mockImplementation(async (channel: string) => {
        if (channel === 'pet:request-snapshot') {
          events.emit('pet:snapshot', { sender: 'not renderer data' }, snapshot);
          events.emit('pet:layout', {}, layout);
        }
      });
      const first = vi.fn();
      const second = vi.fn();
      const onLayout = vi.fn();
      const offFirst = api.subscribeSnapshot(first);
      const offSecond = api.subscribeSnapshot(second);
      const offLayout = api.subscribeLayout(onLayout);
      await api.requestSnapshot();
      expect(first).toHaveBeenCalledExactlyOnceWith(snapshot);
      expect(second).toHaveBeenCalledExactlyOnceWith(snapshot);
      expect(onLayout).toHaveBeenCalledExactlyOnceWith(layout);
      offFirst(); offFirst();
      await api.requestSnapshot();
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(2);
      offSecond(); offLayout();
      expect(events.listenerCount('pet:snapshot')).toBe(0);
      expect(events.listenerCount('pet:layout')).toBe(0);
      const remount = vi.fn();
      const offRemount = api.subscribeSnapshot(remount);
      await api.requestSnapshot();
      expect(remount).toHaveBeenCalledExactlyOnceWith(snapshot);
      offRemount();
    } finally { bridge.dispose(); }
  });

  it('forwards public controls and screen-coordinate deltas to the expected IPC channels', async () => {
    await api.bubblesExpanded(true);
    await api.bubblesVisible(false);
    await api.interaction(true);
    await api.moveWindowBy({ x: -12, y: 8 });
    await api.resizeWindowBy({ x: 5, y: -3 });
    await api.interaction(false);
    expect(electron.invoke.mock.calls).toEqual([
      ['pet:bubbles-expanded', true], ['pet:bubbles-visible', false], ['pet:interaction', true],
      ['pet:move-window-by', { x: -12, y: 8 }], ['pet:resize-window-by', { x: 5, y: -3 }],
      ['pet:interaction', false],
    ]);
  });

  it.each(['success', 'unsupported', 'not-found', 'permission-denied'] as const)(
    'returns the explicit %s Open Session result', async status => {
      const ref = { provider: 'pi' as const, sessionId: 'pi:baseline:completed' };
      electron.invoke.mockResolvedValue({ status });
      await expect(api.acknowledgeAndOpen(ref)).resolves.toEqual({ status });
      expect(electron.invoke).toHaveBeenCalledExactlyOnceWith('pet:acknowledge-and-open', ref);
    },
  );

  it('propagates request/open failures for the renderer to report', async () => {
    electron.invoke.mockRejectedValue(new Error('IPC unavailable'));
    await expect(api.requestSnapshot()).rejects.toThrow('IPC unavailable');
    await expect(api.acknowledgeAndOpen({ provider: 'pi', sessionId: 'test' })).rejects.toThrow('IPC unavailable');
  });
});
