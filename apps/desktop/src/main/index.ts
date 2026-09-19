import { app, BrowserWindow, ipcMain } from 'electron';
import type { SessionRef } from '@agent-pet/adapter-core';
import { createApplication } from '@agent-pet/application';
import { join } from 'node:path';
import { createPetWindowOptions } from './window-options.js';

let petWindow: BrowserWindow | undefined;
const application = createApplication([]);

function assertTrustedRenderer(event: Electron.IpcMainInvokeEvent): void {
  if (!petWindow || event.sender !== petWindow.webContents ||
      event.senderFrame !== petWindow.webContents.mainFrame) {
    throw new Error('Untrusted renderer');
  }
}

function parseSessionRef(value: unknown): SessionRef {
  if (!value || typeof value !== 'object') {
    throw new TypeError('Invalid session reference');
  }
  const ref = value as { provider?: unknown; sessionId?: unknown };
  if (
    !['codex', 'pi', 'claude'].includes(String(ref.provider)) ||
    typeof ref.sessionId !== 'string' ||
    ref.sessionId.length === 0
  ) {
    throw new TypeError('Invalid session reference');
  }
  return { provider: ref.provider as SessionRef['provider'], sessionId: ref.sessionId };
}

ipcMain.handle('pet:acknowledge-and-open', async (event, value: unknown) => {
  assertTrustedRenderer(event);
  const result = await application.acknowledgeAndOpen(parseSessionRef(value));
  petWindow?.webContents.send('pet:snapshot', application.snapshot());
  return result;
});

ipcMain.handle('pet:move-window-by', (event, delta: unknown) => {
  assertTrustedRenderer(event);

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
    createPetWindowOptions(join(__dirname, '../preload/index.cjs')),
  );

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
  window.webContents.once('did-finish-load', () => {
    window.webContents.send('pet:snapshot', application.snapshot());
  });
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
