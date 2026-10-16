import { describe, expect, it } from 'vitest';
import { createPetWindowOptions } from './window-options.js';

describe('pet window security and desktop behavior', () => {
  it('uses a macOS overlay panel without changing other platform window types', () => {
    expect(createPetWindowOptions('/tmp/preload.cjs', 'darwin').type).toBe('panel');
    expect(createPetWindowOptions('/tmp/preload.cjs', 'win32').type).toBeUndefined();
  });
  it('creates a transparent overlay with an isolated sandboxed renderer', () => {
    const options = createPetWindowOptions('/tmp/preload.mjs');

    expect(options).toMatchObject({
      width: 140,
      height: 140,
      minWidth: 80,
      minHeight: 80,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        preload: '/tmp/preload.mjs',
      },
    });
  });
});
