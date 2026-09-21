// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createPetBridgeDouble } from '../../test-support/pet-bridge-double.js';
import { piObservation } from '../../test-support/pi-fixtures.js';
import { useSessionNotice } from './use-session-notice.js';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('clears retained notice state when its effect restarts', async () => {
  vi.useFakeTimers();
  const bridge = createPetBridgeDouble({ observations: [piObservation()] });
  try {
    const { result, rerender, unmount } = renderHook(
      ({ api }) => useSessionNotice(api), { initialProps: { api: bridge.api } },
    );
    await act(async () => result.current.openSession({ provider: 'pi', sessionId: 'pi:baseline:working' }));
    expect(result.current.message).toBe('暂不支持跳转原会话');
    expect(vi.getTimerCount()).toBe(1);
    // A new bridge identity restarts this effect while preserving hook state,
    // exercising the same cleanup/setup invariant required by Fast Refresh.
    rerender({ api: { ...bridge.api } });
    expect(result.current.message).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => result.current.openSession({ provider: 'pi', sessionId: 'pi:baseline:working' }));
    expect(result.current.message).toBe('暂不支持跳转原会话');
    act(() => vi.advanceTimersByTime(3500));
    expect(result.current.message).toBeNull();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally { bridge.dispose(); }
});
