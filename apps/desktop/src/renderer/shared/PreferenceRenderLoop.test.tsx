// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreferenceRenderLoop } from './PreferenceRenderLoop.js';
const runtime = vi.hoisted(() => ({ clock: { elapsedTime: 0 }, advance: vi.fn() }));
vi.mock('@react-three/fiber', () => ({ useThree: (select: (state: typeof runtime) => unknown) => select(runtime) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('preference drawing scheduler', () => {
  it('caps actual frames, resumes without a hidden-time animation jump, and releases RAF on hide/unmount', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    const cancel = vi.fn((id: number) => callbacks.delete(id));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++sequence, callback); return sequence; });
    vi.stubGlobal('cancelAnimationFrame', cancel);
    runtime.clock.elapsedTime = 0;
    runtime.advance.mockImplementation(time => { runtime.clock.elapsedTime = time; });
    const tick = (time: number) => {
      const pending = [...callbacks.values()]; callbacks.clear();
      pending.forEach(callback => callback(time));
    };
    const view = render(<StrictMode><PreferenceRenderLoop active fps={30} /></StrictMode>);
    expect(callbacks.size).toBe(1);
    for (const time of [0, 16, 32, 48, 64, 80, 96]) tick(time);
    expect(runtime.advance).toHaveBeenCalledTimes(3);
    const elapsed = runtime.clock.elapsedTime;
    view.rerender(<StrictMode><PreferenceRenderLoop active={false} fps={30} /></StrictMode>);
    expect(callbacks.size).toBe(0);
    tick(5000);
    expect(runtime.clock.elapsedTime).toBe(elapsed);
    view.rerender(<StrictMode><PreferenceRenderLoop active fps={120} /></StrictMode>);
    tick(6000);
    expect(runtime.clock.elapsedTime).toBe(elapsed);
    tick(6008); tick(6016);
    expect(runtime.advance).toHaveBeenCalledTimes(6);
    view.unmount();
    expect(callbacks.size).toBe(0);
    expect(cancel).toHaveBeenCalled();
  });
});
