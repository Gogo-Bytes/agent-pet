import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { createPetWindowOptions } from './window-options.js';

let petWindow: BrowserWindow | undefined;

function createPetWindow(): BrowserWindow {
  const window = new BrowserWindow(
    createPetWindowOptions(join(__dirname, '../preload/index.js')),
  );

  void window.loadFile(join(__dirname, '../renderer/index.html'));
  window.once('ready-to-show', () => window.show());
  return window;
}

app.whenReady().then(() => {
  petWindow = createPetWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      petWindow = createPetWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
