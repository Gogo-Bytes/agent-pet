import { describe, expect, it, vi } from 'vitest';
import { createPetStore } from './pet-store.js';
import { createPetBridgeDouble } from '../../test-support/pet-bridge-double.js';
import { piObservation } from '../../test-support/pi-fixtures.js';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
describe('createPetStore', () => {
  it('caches snapshot identity and shares IPC subscriptions until the last consumer leaves', async () => {
    const bridge = createPetBridgeDouble({ observations: [piObservation()] });
    const store = createPetStore(bridge.api);
    const initial = store.getSnapshot();
    expect(store.getSnapshot()).toBe(initial);
    const consumer = vi.fn();
    const offA = store.subscribe(consumer);
    const offB = store.subscribe(consumer);
    await flush();
    const snapshot = store.getSnapshot();
    expect(snapshot.sessions).toBe(bridge.snapshot());
    expect(store.getSnapshot()).toBe(snapshot);
    await bridge.api.requestSnapshot();
    expect(store.getSnapshot()).toBe(snapshot);
    expect(bridge.listenerCounts()).toEqual({ snapshot: 1, layout: 1 });
    offA(); offA();
    expect(bridge.listenerCounts()).toEqual({ snapshot: 1, layout: 1 });
    offB();
    expect(bridge.listenerCounts()).toEqual({ snapshot: 0, layout: 0 });
  });

  it('ignores a stale initial rejection after disconnect/reconnect and a rejection after a current push', async () => {
    const bridge = createPetBridgeDouble();
    const reject: Array<(error: Error) => void> = [];
    bridge.api.requestSnapshot.mockImplementation(() => new Promise((_resolve, fail) => reject.push(fail)));
    const store = createPetStore(bridge.api);
    const off = store.subscribe(vi.fn());
    await flush();
    off();
    const offAgain = store.subscribe(vi.fn());
    await flush();
    reject[0]!(Error('old request'));
    await flush();
    expect(store.getSnapshot().error).toBe('');
    bridge.observe(piObservation());
    reject[1]!(Error('reply failed after push'));
    await flush();
    expect(store.getSnapshot().sessions.bubbles).toHaveLength(1);
    expect(store.getSnapshot().error).toBe('');
    offAgain();
  });

  it('surfaces a current initial rejection, recovers on push, and ignores callbacks from old registrations', async () => {
    const bridge = createPetBridgeDouble();
    bridge.api.requestSnapshot.mockRejectedValue(Error('offline'));
    const store = createPetStore(bridge.api);
    const off = store.subscribe(vi.fn());
    const oldCallback = bridge.api.subscribeSnapshot.mock.calls[0]![0];
    await flush();
    expect(store.getSnapshot().error).toContain('无法获取 Session 状态');
    bridge.observe(piObservation());
    expect(store.getSnapshot().error).toBe('');
    off();
    const snapshot = store.getSnapshot();
    oldCallback({ sessions: {}, bubbles: [] });
    expect(store.getSnapshot()).toBe(snapshot);
  });

  it('cancels an initial request if unmounted before its microtask', async () => {
    const bridge = createPetBridgeDouble();
    const store = createPetStore(bridge.api);
    const off = store.subscribe(vi.fn());
    off();
    await flush();
    expect(bridge.api.requestSnapshot).not.toHaveBeenCalled();
    expect(bridge.listenerCounts()).toEqual({ snapshot: 0, layout: 0 });
  });
});
