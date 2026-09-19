import type { BrowserWindowConstructorOptions } from 'electron';

export function createPetWindowOptions(
  preloadPath: string,
): BrowserWindowConstructorOptions {
  return {
    width: 720,
    height: 720,
    minWidth: 240,
    minHeight: 240,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  };
}
