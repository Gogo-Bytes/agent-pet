// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePetInteraction } from './usePetInteraction.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

it.each(['blur', 'pointercancel', 'lostpointercapture', 'visibilitychange'])('clears local feedback on %s and permits a fresh edge', event => {
  const f = renderHook(() => usePetInteraction(true), { wrapper });
  act(() => f.result.current.hover(true)); expect(f.result.current.feedback?.action).toBe('hover');
  if (event === 'visibilitychange') vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event)));
  expect(f.result.current.feedback).toBeNull();
  act(() => f.result.current.hover(true)); expect(f.result.current.feedback?.action).toBe('hover');
});

it('does not replay initial selection on mount, clears selection when cancelled/disabled, and removes lifecycle listeners on unmount', () => {
  const removeWindow = vi.spyOn(window, 'removeEventListener');
  const removeDocument = vi.spyOn(document, 'removeEventListener');
  const f = renderHook(({ enabled, selection }) => usePetInteraction(enabled, selection), { initialProps: { enabled: true, selection: 4 }, wrapper });
  expect(f.result.current.feedback).toBeNull();
  f.rerender({ enabled: true, selection: 5 }); expect(f.result.current.feedback?.action).toBe('selected');
  act(() => f.result.current.hover(false)); expect(f.result.current.feedback?.action).toBe('selected');
  act(() => window.dispatchEvent(new Event('blur'))); expect(f.result.current.feedback).toBeNull();
  f.rerender({ enabled: true, selection: 5 }); expect(f.result.current.feedback).toBeNull();
  f.rerender({ enabled: true, selection: 6 }); expect(f.result.current.feedback?.action).toBe('selected');
  f.rerender({ enabled: false, selection: 6 }); expect(f.result.current.feedback).toBeNull();
  f.rerender({ enabled: true, selection: 6 }); expect(f.result.current.feedback).toBeNull();
  f.rerender({ enabled: true, selection: 7 });
  f.rerender({ enabled: true, selection: 0 }); expect(f.result.current.feedback).toBeNull();
  removeWindow.mockClear(); removeDocument.mockClear();
  f.unmount();
  expect(removeWindow.mock.calls.map(call => call[0])).toEqual(['blur', 'pointercancel', 'lostpointercapture']);
  expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
});
