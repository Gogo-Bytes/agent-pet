import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { pathToFileURL } from 'node:url';

const entries = new WeakMap<BrowserWindow, string>();
export function loadTrustedEntry(window: BrowserWindow, file: string, developmentUrl?: string): void {
  const entry = developmentUrl ? new URL(developmentUrl).href : pathToFileURL(file).href;
  entries.set(window, entry);
  // Chromium persists zoom per host. In dev both windows use localhost, so an
  // accidental menu zoom shrinks the pet and breaks CSS/native hit geometry too.
  // Keep app pixels stable; pet size remains owned by the persisted preference.
  const actualSize = () => window.webContents.setZoomFactor(1);
  window.webContents.on('did-finish-load', actualSize);
  window.webContents.on('zoom-changed', actualSize);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const restrict = (event: { url: string; preventDefault(): void }) => { if (event.url !== entry) event.preventDefault(); };
  window.webContents.on('will-navigate', restrict);
  window.webContents.on('will-redirect', restrict);
  window.webContents.on('will-frame-navigate', restrict);
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  if (developmentUrl) void window.loadURL(entry);
  else void window.loadFile(file);
}
export function assertWindowSender(window: BrowserWindow | undefined, event: IpcMainInvokeEvent): void {
  if (!window || window.isDestroyed() || event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame || event.senderFrame?.url !== entries.get(window)) {
    throw new Error('Untrusted renderer');
  }
}
