// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../../app/App.js';
import { createPetStore } from '../../app/bridge/pet-store.js';
import { createPetBridgeDouble } from '../../test-support/pet-bridge-double.js';
import { piObservation } from '../../test-support/pi-fixtures.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('contains actual Fiber WebGL initialization rejection without removing session controls', async () => {
  const callbacks = new Set<() => void>();
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: () => void) {}
    observe() { callbacks.add(this.callback); }
    unobserve() {}
    disconnect() { callbacks.delete(this.callback); }
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 140, 140));
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  // Expected Three/React diagnostics; Vitest must still fail on any unhandled rejection.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const bridge = createPetBridgeDouble({ observations: [piObservation({ agentName: 'WebGL failure session' })] });
  try {
    const { unmount } = render(<App store={createPetStore(bridge.api)} />);
    await act(async () => { for (const callback of callbacks) callback(); });
    await waitFor(() => expect(context).toHaveBeenCalledWith('webgl2', expect.any(Object)));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('内置宠物加载失败，请重新打开窗口。'));
    expect(screen.getByRole('button', { name: 'WebGL failure session 正在工作' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: '隐藏气泡' }));
    expect(screen.getByRole('button', { name: '显示气泡' })).toBeTruthy();
    unmount();
    expect(callbacks.size).toBe(0);
    expect(bridge.listenerCounts()).toEqual({ snapshot: 0, layout: 0 });
  } finally { bridge.dispose(); }
});
