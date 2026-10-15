import { expect, it, vi } from 'vitest';
import { applyPetWindowLayer } from './pet-window-layer.js';

it('restores the overlay above other windows without focus and respects explicit topmost disablement', () => {
  const window = { isDestroyed: () => false, isVisible: () => true,
    setAlwaysOnTop: vi.fn(), setVisibleOnAllWorkspaces: vi.fn(), moveTop: vi.fn() };
  applyPetWindowLayer(window, true, 'darwin');
  expect(window.setAlwaysOnTop).toHaveBeenLastCalledWith(true, 'screen-saver');
  expect(window.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  expect(window.moveTop).toHaveBeenCalledOnce();
  applyPetWindowLayer(window, false, 'darwin');
  expect(window.setAlwaysOnTop).toHaveBeenLastCalledWith(false, 'screen-saver');
  expect(window.moveTop).toHaveBeenCalledOnce();
  applyPetWindowLayer({ ...window, isDestroyed: () => true }, true, 'darwin');
  expect(window.moveTop).toHaveBeenCalledOnce();
});
