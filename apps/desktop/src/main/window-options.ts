import type { BrowserWindowConstructorOptions } from 'electron';

export function createPetWindowOptions(
  preloadPath: string,
  platform: NodeJS.Platform = process.platform,
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
    // A macOS nonactivating panel can accompany other apps' fullscreen Spaces
    // without transforming the whole app (and its management/Dock window).
    ...(platform === 'darwin' ? { type: 'panel' } : {}),
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
