import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import type { AdapterHandle, SessionRef } from '@agent-pet/adapter-core';
import { PiBridgeAdapter } from '@agent-pet/adapter-pi';
import { createApplication } from '@agent-pet/application';
import { join } from 'node:path';
import { createPetWindowOptions } from './window-options.js';
import { readPiBridgeConfig } from './pi-config.js';

let petWindow: BrowserWindow | undefined;
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
