import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPetBridgeDouble } from './test-support/pet-bridge-double.js';
import { baselineLayout, piBaselineObservations, piObservation } from './test-support/pi-fixtures.js';

const bridges: ReturnType<typeof createPetBridgeDouble>[] = [];
function setup(options: Parameters<typeof createPetBridgeDouble>[0] = {}) {
  const bridge = createPetBridgeDouble({ observations: piBaselineObservations(), ...options });
  bridges.push(bridge);
  return bridge;
}
afterEach(() => { for (const bridge of bridges.splice(0)) bridge.dispose(); });

describe('renderer bridge baseline (real Application, no DOM/native window)', () => {
  it('delivers initial snapshot and layout after subscribing, with stable snapshot identity', async () => {
    const bridge = setup();
    const snapshot = vi.fn();
    const layout = vi.fn();
    const offSnapshot = bridge.api.subscribeSnapshot(snapshot);
    const offLayout = bridge.api.subscribeLayout(layout);
    expect(snapshot).not.toHaveBeenCalled();
    await bridge.api.requestSnapshot();
    const initial = bridge.snapshot();
    expect(snapshot).toHaveBeenLastCalledWith(initial);
    expect(initial.bubbles).toHaveLength(5);
    expect(initial.bubbles.map(bubble => bubble.status)).toEqual([
      'working', 'completed-unread', 'error-unread', 'working', 'completed-unread',
    ]);
    expect(initial.bubbles.at(-1)?.name).toBe('项目名称回退');
    expect(layout).toHaveBeenLastCalledWith(baselineLayout());
    await bridge.api.requestSnapshot();
    expect(snapshot.mock.calls[1]?.[0]).toBe(initial);
    offSnapshot(); offSnapshot(); offLayout();
    expect(bridge.listenerCounts()).toEqual({ snapshot: 0, layout: 0 });
    bridge.observe(piObservation({ revision: 2, status: 'completed' }));
    bridge.publishLayout(baselineLayout('top-left', 80));
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(layout).toHaveBeenCalledTimes(2);
    const remounted = vi.fn();
    bridge.api.subscribeSnapshot(remounted);
    await bridge.api.requestSnapshot();
    expect(remounted).toHaveBeenCalledExactlyOnceWith(bridge.snapshot());
  });

  it('keeps duplicate callback registrations independent for snapshot and layout', async () => {
    const bridge = setup();
    const snapshot = vi.fn();
    const layout = vi.fn();
    const offSnapshot = bridge.api.subscribeSnapshot(snapshot);
    const offLayout = bridge.api.subscribeLayout(layout);
    const offSecondSnapshot = bridge.api.subscribeSnapshot(snapshot);
    const offSecondLayout = bridge.api.subscribeLayout(layout);
    await bridge.api.requestSnapshot();
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(layout).toHaveBeenCalledTimes(2);
    offSnapshot(); offSnapshot(); offLayout(); offLayout();
    expect(bridge.listenerCounts()).toEqual({ snapshot: 1, layout: 1 });
    await bridge.api.requestSnapshot();
    expect(snapshot).toHaveBeenCalledTimes(3);
    expect(layout).toHaveBeenCalledTimes(3);
    offSecondSnapshot(); offSecondLayout();
    await bridge.api.requestSnapshot();
    expect(snapshot).toHaveBeenCalledTimes(3);
    expect(layout).toHaveBeenCalledTimes(3);
    expect(bridge.listenerCounts()).toEqual({ snapshot: 0, layout: 0 });
  });

  it('keeps a working bubble on open; acknowledges only the chosen terminal session before opening', async () => {
    const openSession = vi.fn(async () => ({ status: 'unsupported' as const }));
    const bridge = setup({ openSession });
    const ref = { provider: 'pi' as const, sessionId: 'pi:baseline:working' };
    await bridge.api.acknowledgeAndOpen(ref);
    expect(bridge.snapshot().bubbles.find(b => b.sessionId === ref.sessionId)?.status).toBe('working');
    bridge.observe(piObservation({ revision: 2, status: 'completed' }));
    openSession.mockImplementationOnce(async () => {
      expect(bridge.snapshot().bubbles.some(b => b.sessionId === ref.sessionId)).toBe(false);
      return { status: 'unsupported' };
    });
    expect(await bridge.api.acknowledgeAndOpen(ref)).toEqual({ status: 'unsupported' });
    expect(openSession).toHaveBeenLastCalledWith(ref);
    expect(bridge.snapshot().bubbles).toHaveLength(4);
    expect(bridge.snapshot().bubbles.find(b => b.sessionId === 'pi:baseline:error')?.unread).toBe(true);

    bridge.observe(piObservation({ revision: 3, status: 'completed', agentName: '重命名' }));
    expect(bridge.snapshot().sessions[ref.sessionId]?.name).toBe('重命名');
    expect(bridge.snapshot().bubbles.some(b => b.sessionId === ref.sessionId)).toBe(false);
    bridge.observe(piObservation({ revision: 4, workId: 'turn-2', status: 'working' }));
    expect(bridge.snapshot().bubbles.find(b => b.sessionId === ref.sessionId)?.status).toBe('working');
  });

  it('updates a visible name without adding a Session, and ignores stale replay', () => {
    const bridge = setup();
    bridge.observe(piObservation({ revision: 2, agentName: '重命名中的工作' }));
    bridge.observe(piObservation({ revision: 1, status: 'completed' }));
    const bubbles = bridge.snapshot().bubbles.filter(b => b.sessionId === 'pi:baseline:working');
    expect(bubbles).toEqual([{ sessionId: 'pi:baseline:working', name: '重命名中的工作', status: 'working', unread: false }]);
    expect(Object.keys(bridge.snapshot().sessions)).toHaveLength(6);
  });

  it('does not resurrect an error bubble when Open Session rejects', async () => {
    const bridge = setup({ openSession: async () => { throw new Error('open failed'); } });
    await expect(bridge.api.acknowledgeAndOpen({ provider: 'pi', sessionId: 'pi:baseline:error' })).rejects.toThrow('open failed');
    expect(bridge.snapshot().bubbles.some(b => b.sessionId === 'pi:baseline:error')).toBe(false);
    await expect(bridge.api.acknowledgeAndOpen({ provider: 'pi', sessionId: 'missing' })).resolves.toEqual({ status: 'not-found' });
  });
});
