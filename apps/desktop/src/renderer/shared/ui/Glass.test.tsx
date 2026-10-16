// @vitest-environment jsdom
import { createRef, StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GlassAction, GlassButton, GlassToolbar } from './Glass.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('keeps native action refs and one bounded optical observer per control surface through StrictMode', () => {
  let resize!: ResizeObserverCallback;
  let frame: FrameRequestCallback | undefined;
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  const cancel = vi.fn(() => { frame = undefined; });
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const draw = vi.fn();
  const context = {
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: draw,
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    ((kind: string) => kind === '2d' ? context : null) as HTMLCanvasElement['getContext'],
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,test');
  const toolbarRef = createRef<HTMLDivElement>();
  const buttonRef = createRef<HTMLButtonElement>();
  const click = vi.fn();
  const { container, unmount } = render(<StrictMode>
    <GlassToolbar ref={toolbarRef} aria-label="操作" style={{ borderTopLeftRadius: 23, borderLeftWidth: 1 }}>
      <GlassAction ref={buttonRef} onClick={click} aria-pressed>切换</GlassAction>
    </GlassToolbar>
    <GlassButton material="panel">会话状态</GlassButton>
  </StrictMode>);
  expect(observe.mock.calls.length - disconnect.mock.calls.length).toBe(1);
  expect(toolbarRef.current).toBe(screen.getByRole('group'));
  act(() => { buttonRef.current!.focus(); buttonRef.current!.click(); });
  expect(document.activeElement).toBe(buttonRef.current);
  expect(click).toHaveBeenCalledOnce();
  expect(buttonRef.current!.querySelector('.glass-optics')).toBeNull();
  let width = 96;
  Object.defineProperties(toolbarRef.current!, { clientWidth: { get: () => width }, clientHeight: { get: () => 44 } });
  const notify = () => act(() => { resize([], {} as ResizeObserver); const callback = frame; frame = undefined; callback?.(0); });
  notify();
  expect(container.querySelector('feDisplacementMap')).toBeTruthy();
  expect(draw).toHaveBeenCalledOnce();
  notify(); // No per-frame rebuilding for an unchanged size.
  expect(draw).toHaveBeenCalledOnce();
  width = 10_000; // Area cap clears the obsolete map and falls back.
  notify();
  expect(container.querySelector('feDisplacementMap')).toBeNull();
  expect(draw).toHaveBeenCalledOnce();
  unmount();
  expect(disconnect).toHaveBeenCalledTimes(observe.mock.calls.length);
  expect(frame).toBeUndefined();
  expect(toolbarRef.current).toBeNull();
});

it('retains a usable native control without ResizeObserver', () => {
  vi.stubGlobal('ResizeObserver', undefined);
  const click = vi.fn();
  render(<GlassButton onClick={click}>添加</GlassButton>);
  act(() => screen.getByRole('button', { name: '添加' }).click());
  expect(click).toHaveBeenCalledOnce();
  expect(document.querySelector('feDisplacementMap')).toBeNull();
});
