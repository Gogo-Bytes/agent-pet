import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { PreferenceStore } from './preferences.js';
import { PiPreflight } from './pi-preflight.js';
import { PiConnection } from './pi-connection.js';
import type { PiBridgeAdapter } from '@agent-pet/adapter-pi';
import type { ObservationSink } from '@agent-pet/adapter-core';
import { assertWindowSender, loadTrustedEntry } from './window-trust.js';
import type { ManagementState, PreferencePatch, Preferences } from '../shared/preferences.js';

export function createManagement(options: {
  applyPreferences(preferences: Preferences): void;
  stop(): Promise<void>;
  developmentMenu: Electron.MenuItemConstructorOptions[];
  pi: { adapter: PiBridgeAdapter; publish: ObservationSink['publish']; developmentEnvironment: boolean };
}) {
  const preferences = new PreferenceStore(join(app.getPath('userData'), 'preferences.json'));
  let window: BrowserWindow | undefined;
  let windowRequested = false;
  const preflight = new PiPreflight({ home: app.getPath('home'), guiPath: process.env.PATH ?? '',
    async pick(kind) {
      if (!window || window.isDestroyed() || quitting) return null;
      const result = await dialog.showOpenDialog(window, {
        title: kind === 'installation' ? '选择 pi 安装包目录（包含 package.json）' : '选择 pi 配置目录（agentDir，不是项目或 sessions 目录）',
        properties: ['openDirectory', 'dontAddToRecent'],
      });
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
  });
  const connection = new PiConnection({ ...options.pi, target: () => preflight.snapshot() });
  connection.subscribe(snapshot => {
    if (window && !window.isDestroyed()) window.webContents.send('management:pi-connection-state', snapshot);
  });
  let tray: Tray;
  let quitting = false;
  let stopped = false;
  let loginError: string | null = null;
  const loginSupported = process.platform === 'darwin' && app.isPackaged;
  function state(): ManagementState {
    let enabled = false;
    let readError: string | null = null;
    if (loginSupported) {
      try { enabled = app.getLoginItemSettings().openAtLogin; }
      catch { readError = '无法读取系统登录项状态。'; }
    }
    return { preferences: preferences.snapshot(), preferenceError: preferences.error,
      login: { supported: loginSupported, enabled, error: readError ?? loginError } };
  }
  function publish(): ManagementState {
    const snapshot = state();
    if (window && !window.isDestroyed()) window.webContents.send('management:state', snapshot);
    return snapshot;
  }
  function update(patch: PreferencePatch): ManagementState {
    if (quitting) throw new Error('Application is quitting');
    const previous = preferences.snapshot();
    if (preferences.update(patch)) options.applyPreferences(preferences.snapshot());
    if (previous.petVisible !== preferences.snapshot().petVisible) rebuildMenu();
    return publish();
  }
  function open(): void {
    if (quitting) return;
    windowRequested = true;
    if (!window || window.isDestroyed()) {
      window = new BrowserWindow({ width: 900, height: 680, minWidth: 620, minHeight: 480,
        show: false, title: 'Agent Pet', backgroundColor: '#f5f7fa',
        webPreferences: { preload: join(__dirname, '../preload/management.cjs'),
          contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
      const current = window;
      current.on('close', event => {
        connection.invalidate();
        if (!quitting) { event.preventDefault(); windowRequested = false; current.hide(); }
      });
      current.webContents.on('did-start-loading', () => connection.invalidate());
      current.webContents.on('render-process-gone', () => connection.invalidate());
      current.once('ready-to-show', () => {
        if (!quitting && windowRequested && window === current && !current.isDestroyed()) current.show();
      });
      current.on('closed', () => { connection.invalidate(); if (window === current) window = undefined; });
      const dev = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
      loadTrustedEntry(current, join(__dirname, '../renderer/management.html'), dev ? new URL('management.html', dev.endsWith('/') ? dev : dev + '/').href : undefined);
    } else {
      if (window.isMinimized()) window.restore();
      window.show(); window.focus(); publish();
    }
  }
  function menuItems(): Electron.MenuItemConstructorOptions[] {
    return [
      { label: '打开管理窗口', click: open },
      { label: preferences.snapshot().petVisible ? '隐藏宠物' : '显示宠物', click: () => {
        const result = update({ petVisible: !preferences.snapshot().petVisible });
        if (result.preferenceError) open();
      } },
      { type: 'separator' }, { label: '退出 Agent Pet', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
    ];
  }
  function rebuildMenu(): void {
    tray?.setContextMenu(Menu.buildFromTemplate(menuItems()));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Agent Pet', submenu: menuItems() },
      { role: 'editMenu' }, { role: 'viewMenu' }, ...options.developmentMenu,
    ]));
  }
  // Small bundled monochrome menu-bar glyph; no remote icon or extra asset dependency.
  const pixels = Buffer.alloc(16 * 16 * 4);
  for (let y = 3; y < 14; y++) for (let x = 3; x < 13; x++) {
    if (y >= 6 || x <= 5 || x >= 10) pixels[(y * 16 + x) * 4 + 3] = 255;
  }
  const icon = nativeImage.createFromBitmap(pixels, { width: 16, height: 16, scaleFactor: 1 });
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Agent Pet');
  tray.on('click', open);
  rebuildMenu();
  ipcMain.handle('management:get-state', event => { assertWindowSender(window, event); return state(); });
  ipcMain.handle('management:update-preferences', (event, patch: unknown) => {
    assertWindowSender(window, event);
    return update(patch as PreferencePatch); // Store validates the runtime payload.
  });
  ipcMain.handle('management:set-login', (event, enabled: unknown) => {
    assertWindowSender(window, event);
    if (typeof enabled !== 'boolean') throw new TypeError('Invalid login preference');
    if (quitting) throw new Error('Application is quitting');
    loginError = null;
    if (!loginSupported) loginError = '仅打包后的 macOS 应用支持登录自启；开发模式不会注册 Electron。';
    else {
      try {
        app.setLoginItemSettings({ openAtLogin: enabled });
        if (app.getLoginItemSettings().openAtLogin !== enabled) loginError = '系统未应用登录项更改，请检查系统设置。';
      } catch { loginError = '登录项更改失败，请检查系统设置。'; }
    }
    return publish();
  });
  let preflightPending = 0;
  const preflightHandlers = {
    'management:pi-state': () => preflight.snapshot(),
    'management:pi-detect': () => preflight.detect(),
    'management:pi-choose-installation': () => preflight.choose('installation'),
    'management:pi-choose-target': () => preflight.choose('target'),
    'management:pi-default-target': () => preflight.useDefaultTarget(),
    'management:pi-inspect': () => preflight.inspect(),
  };
  for (const [channel, handle] of Object.entries(preflightHandlers)) ipcMain.handle(channel, (event, ...args: unknown[]) => {
    assertWindowSender(window, event);
    if (quitting || args.length) throw new Error('Invalid preflight request');
    if (channel !== 'management:pi-state') {
      if (connection.snapshot().busy) throw new Error('Connection operation busy');
      connection.invalidate();
    }
    const result = handle();
    if (result instanceof Promise) {
      preflightPending++;
      return result.finally(() => { preflightPending--; connection.invalidate(); });
    }
    return result;
  });
  ipcMain.handle('management:pi-select-installation', (event, ...args: unknown[]) => {
    assertWindowSender(window, event);
    if (quitting || args.length !== 1) throw new Error('Invalid preflight request');
    if (connection.snapshot().busy) throw new Error('Connection operation busy');
    connection.invalidate();
    return preflight.selectInstallation(args[0]);
  });
  const connectionHandlers = {
    state: () => connection.snapshot(), preview: () => connection.preview(),
    cancel: () => connection.invalidate(), remove: () => connection.remove(),
  };
  for (const [action, handle] of Object.entries(connectionHandlers)) ipcMain.handle(`management:pi-connection-${action}`, (event, ...args: unknown[]) => {
    assertWindowSender(window, event);
    if (quitting || args.length) throw new Error('Invalid connection request');
    if (action === 'preview' && preflightPending) throw new Error('Preflight operation busy');
    return handle();
  });
  ipcMain.handle('management:pi-connection-confirm', (event, ...args: unknown[]) => {
    assertWindowSender(window, event);
    if (quitting || args.length !== 1 || typeof args[0] !== 'string' || args[0].length > 80) throw new Error('Invalid connection request');
    if (preflightPending) throw new Error('Preflight operation busy');
    return connection.confirm(args[0]);
  });
  app.on('activate', open);
  app.on('second-instance', open);
  app.on('window-all-closed', () => { /* Tray remains the recovery entry on all platforms. */ });
  app.on('before-quit', event => {
    if (stopped) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    preflight.close();
    void Promise.all([options.stop(), connection.stop()]).catch(() => { console.warn('Adapter shutdown failed'); }).finally(() => {
      stopped = true; tray.destroy();
      // Let native cancellation of the first before-quit unwind before retrying.
      // A microtask retry can leave a windowless process holding the instance lock.
      setImmediate(() => app.quit());
    });
  });
  options.applyPreferences(preferences.snapshot());
  open();
  return { update, open, connection, isQuitting: () => quitting };
}
