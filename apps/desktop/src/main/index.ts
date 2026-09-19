import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { createPetWindowOptions } from './window-options.js';

let petWindow: BrowserWindow | undefined;

ipcMain.handle('pet:move-window-by', (event, delta: unknown) => {
  if (!event.senderFrame?.url.startsWith('file://')) {
    throw new Error('Untrusted renderer');
  }

  if (
    !delta ||
    typeof delta !== 'object' ||
    typeof (delta as { x?: unknown }).x !== 'number' ||
    typeof (delta as { y?: unknown }).y !== 'number' ||
    !Number.isFinite((delta as { x: number }).x) ||
    !Number.isFinite((delta as { y: number }).y)
  ) {
    throw new TypeError('Invalid window movement');
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    throw new Error('Pet window is unavailable');
  }

  const [x = 0, y = 0] = window.getPosition();
  const { x: deltaX, y: deltaY } = delta as { x: number; y: number };
  window.setPosition(Math.round(x + deltaX), Math.round(y + deltaY));
});

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
