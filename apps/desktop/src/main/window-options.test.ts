import { describe, expect, it } from 'vitest';
import { createPetWindowOptions } from './window-options.js';

describe('pet window security and desktop behavior', () => {
  it('creates a transparent overlay with an isolated sandboxed renderer', () => {
    const options = createPetWindowOptions('/tmp/preload.mjs');

    expect(options).toMatchObject({
      width: 420,
      height: 420,
      minWidth: 240,
      minHeight: 240,
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
