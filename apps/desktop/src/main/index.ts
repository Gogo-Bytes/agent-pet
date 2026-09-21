import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import type { AdapterHandle, SessionRef } from '@agent-pet/adapter-core';
import { PiBridgeAdapter } from '@agent-pet/adapter-pi';
import { createApplication } from '@agent-pet/application';
import { join } from 'node:path';
import { createPetWindowOptions } from './window-options.js';
import { readPiBridgeConfig } from './pi-config.js';

import { layoutOverlay } from './overlay-layout.js';
import type { Rect, OverlayLayout } from '../shared/overlay-layout.js';
let petWindow: BrowserWindow | undefined;
let anchor: Rect = { x: 100, y: 300, width: 140, height: 140 };
let overlay: OverlayLayout;
let interacting = false;
// Renderer reports committed presentation, not the user visibility preference.
let bubblesVisible = false;
let bubblesExpanded = false;
ipcMain.handle('pet:bubbles-expanded', (event, expanded: unknown) => {
  assertTrustedRenderer(event);
  if (typeof expanded !== 'boolean') throw new TypeError('Invalid expansion');
  bubblesExpanded = expanded;
  updateHitPolicy();
});
ipcMain.handle('pet:bubbles-visible', (event, visible: unknown) => {
  assertTrustedRenderer(event);
  if (typeof visible !== 'boolean') throw new TypeError('Invalid visibility');
  bubblesVisible = visible;
  updateHitPolicy();
});
function updateOverlay(): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  const area = screen.getDisplayMatching(anchor).workArea;
  overlay = layoutOverlay(anchor, area);
  anchor = overlay.anchor;
  petWindow.setBounds(overlay.bounds);
  petWindow.webContents.send('pet:layout', overlay);
  updateHitPolicy();
}
ipcMain.handle('pet:interaction', (event, active: unknown) => {
  assertTrustedRenderer(event);
  if (typeof active !== 'boolean') throw new TypeError('Invalid interaction');
  interacting = active;
  updateHitPolicy();
});
let piHandle: AdapterHandle | undefined;
const piConfig = readPiBridgeConfig(process.env);
const piAdapter = new PiBridgeAdapter();
const application = createApplication(piConfig ? [piAdapter] : []);
application.subscribe((snapshot) => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:snapshot', snapshot);
  }
});

ipcMain.handle('pet:request-snapshot', (event) => {
  assertTrustedRenderer(event);
  event.sender.send('pet:snapshot', application.snapshot());
  updateOverlay();
});

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
  return application.acknowledgeAndOpen(parseSessionRef(value));
});

function deltaValue(value: unknown): { x: number; y: number } {
  if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value) ||
      typeof value.x !== 'number' || typeof value.y !== 'number' ||
      !Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new TypeError('Invalid delta');
  return { x: value.x, y: value.y };
}
ipcMain.handle('pet:resize-window-by', (event, value: unknown) => {
  assertTrustedRenderer(event);
  const delta = deltaValue(value);
  anchor.width = Math.max(80, Math.min(600, anchor.width + Math.round((delta.x + delta.y) / 2)));
  anchor.height = anchor.width;
  updateOverlay();
});
ipcMain.handle('pet:move-window-by', (event, value: unknown) => {
  assertTrustedRenderer(event);
  const delta = deltaValue(value);
  anchor.x += Math.round(delta.x);
  anchor.y += Math.round(delta.y);
  updateOverlay();
});

function updateHitPolicy(): void {
  if (!petWindow || petWindow.isDestroyed() || !overlay) return;
  const point = screen.getCursorScreenPoint();
  const local = { x: point.x - overlay.bounds.x, y: point.y - overlay.bounds.y };
  const bubbleHeight = Math.min(overlay.bubbles.height, bubblesExpanded ? overlay.bubbles.height : 88);
  const bubbleHit = { ...overlay.bubbles, height: bubbleHeight,
    y: overlay.bubbles.y < overlay.pet.y ? overlay.bubbles.y + overlay.bubbles.height - bubbleHeight : overlay.bubbles.y };
  const regions = [overlay.pet, overlay.toolbar, ...(bubblesVisible ? [bubbleHit] : [])];
  const hit = interacting || regions.some(r => local.x >= r.x && local.y >= r.y && local.x <= r.x + r.width && local.y <= r.y + r.height);
  petWindow.setIgnoreMouseEvents(!hit, { forward: true });
}

function createPetWindow(): BrowserWindow {
  const window = new BrowserWindow(
    createPetWindowOptions(join(__dirname, '../preload/index.cjs')),
  );

  window.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setResizable(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const resetPresentation = () => {
    interacting = false; bubblesVisible = false; bubblesExpanded = false;
    updateHitPolicy();
  };
  window.webContents.on('did-start-loading', resetPresentation);
  window.webContents.on('render-process-gone', resetPresentation);
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
  window.once('ready-to-show', () => window.show());
  return window;
}

async function startConfiguredAdapters(): Promise<void> {
  if (!piConfig) return;
  try {
    piHandle = await piAdapter.start(piConfig, {
      publish: observation => application.observe(observation),
      connectionChanged: state => {
        if (state !== 'connected') console.info(`[pi adapter] ${state}`);
      },
    });
  } catch (error) {
    console.warn('[pi adapter] disabled:', error instanceof Error ? error.message : error);
  }
}

app.whenReady().then(() => {
  void startConfiguredAdapters();
  petWindow = createPetWindow();
  updateOverlay();
  screen.on('display-removed', updateOverlay);
  screen.on('display-metrics-changed', updateOverlay);
  const hitTimer = setInterval(updateHitPolicy, 50);
  hitTimer.unref();
  app.once('will-quit', () => clearInterval(hitTimer));
  let demoRun = 0;
  function demo(status: 'working' | 'completed' | 'error'): void {
    if (status === 'working' || demoRun === 0) demoRun++;
    for (const provider of ['codex', 'pi', 'claude'] as const) {
      application.observe({
        provider,
        sessionId: `demo-${provider}-${demoRun}`,
        agentName: `模拟 · ${provider} · ${demoRun}`,
        status,
        observedAt: new Date().toISOString(),
      });
    }
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Agent Pet', submenu: [
      { label: '显示宠物', click: () => petWindow?.show() },
      { label: '隐藏宠物', click: () => petWindow?.hide() },
      { type: 'separator' }, { role: 'quit' },
    ] },
    ...(!app.isPackaged ? [{ label: '模拟 Session（开发专用）', submenu: [
      { label: '新建三个工作 Session', click: () => demo('working') },
      { label: '当前模拟任务完成', click: () => demo('completed') },
      { label: '当前模拟任务出错', click: () => demo('error') },
    ] }] : []),
  ]));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      petWindow = createPetWindow();
    }
  });
});

app.on('before-quit', () => {
  void piHandle?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
