import type { BrowserWindowConstructorOptions } from 'electron';

export function createPetWindowOptions(
  preloadPath: string,
): BrowserWindowConstructorOptions {
  return {
    width: 140,
    height: 140,
    minWidth: 80,
    minHeight: 80,
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
