import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from 'electron';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { PiBridgeAdapter as ConfigurationAdapter } from '@agent-pet/adapter-pi';
import type { SessionState } from '@agent-pet/domain';
import { Configurations } from './configurations.js';
import { loadCodexRuntimeAssets } from './codex-runtime-assets.js';
import { loadClaudeRuntimeAssets, claudeProcessProbePath } from './claude-runtime-assets.js';
import { configurationOnline } from '../shared/configurations.js';
import { registerConfigurationIpc } from './configuration-ipc.js';
import { PreferenceStore } from './preferences.js';
import { PiPreflight } from './pi-preflight.js';
import { CodexDiscovery } from './codex-discovery.js';
import { ClaudeDiscovery } from './claude-discovery.js';
import { PiConnectionStore } from './pi-connection-store.js';
import { PiConnection } from './pi-connection.js';
import type { PiBridgeAdapter } from '@agent-pet/adapter-pi';
import type { ObservationSink } from '@agent-pet/adapter-core';
import { assertWindowSender, loadTrustedEntry } from './window-trust.js';
import type { ManagementState, PreferencePatch, Preferences } from '../shared/preferences.js';
import { PetAssetsStore } from './pet-assets-store.js';
import { inspectPetFolder, installPetFolder, type PetImportPreview as SourcePetImportPreview } from './pet-assets-import.js';

export function createManagement(options: {
  applyPreferences(preferences: Preferences): void;
  stop(): Promise<void>;
  onlineChanged?(online: boolean): void;
  sessions?(): SessionState;
  pi: { adapter: PiBridgeAdapter; publish: ObservationSink['publish']; developmentEnvironment: boolean };
}) {
  const preferences = new PreferenceStore(join(app.getPath('userData'), 'preferences.json'));
  const petAssets = new PetAssetsStore(app.getPath('userData'));
  let pendingPetImport: { token: string; preview: SourcePetImportPreview } | undefined;
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
  const connection = new PiConnection({ ...options.pi, publish: observation => { configurations.registerLegacySession(observation.sessionId); options.pi.publish(observation); }, target: () => preflight.snapshot(),
    ...(!options.pi.developmentEnvironment ? { store: new PiConnectionStore(app.getPath('userData')) } : {}) });
  connection.subscribe(snapshot => {
    if (options.pi.developmentEnvironment) options.onlineChanged?.(snapshot.status === 'connected');
    if (window && !window.isDestroyed()) window.webContents.send('management:pi-connection-state', snapshot);
  });
  const legacyState = connection.snapshot();
  const collectionOwnsLegacy = !!(legacyState.deployedPath || legacyState.saved === 'invalid' || options.pi.developmentEnvironment);
  const configurations = new Configurations({ directory: app.getPath('userData'),
    adapter: () => new ConfigurationAdapter(), publish: options.pi.publish,
    claude: { nodeExecutable: process.execPath, runAsNode: true, runtimeAssets: loadClaudeRuntimeAssets,
      normal: { probePath: claudeProcessProbePath(), observerExecutable: realpathSync(process.execPath) },
      async chooseExecutable() {
        if (!window || window.isDestroyed() || quitting) return null;
        const result = await dialog.showOpenDialog(window, { title: '选择 Claude Code 程序（当前支持 npm 2.1.301）',
          properties: ['openFile', 'showHiddenFiles', 'dontAddToRecent'] });
        return result.canceled ? null : result.filePaths[0] ?? null;
      } },
    codex: { nodeExecutable: process.execPath, observerExecutable: realpathSync(process.execPath), runAsNode: true,
      probePath: claudeProcessProbePath(), runtimeAssets: loadCodexRuntimeAssets,
      async chooseExecutable() {
        if (!window || window.isDestroyed() || quitting) return null;
        const result = await dialog.showOpenDialog(window, { title: '选择 Codex CLI 程序（已验证 standalone 0.163.0）',
          properties: ['openFile', 'showHiddenFiles', 'dontAddToRecent'] });
        return result.canceled ? null : result.filePaths[0] ?? null;
      } },
    developmentEnvironment: options.pi.developmentEnvironment,
    ...(collectionOwnsLegacy
      ? { legacy: { connection, targetPath: legacyState.deployedPath ? dirname(dirname(legacyState.deployedPath)) : preflight.snapshot().target.path } } : {}),
  });
  configurations.subscribe(snapshot => {
    options.onlineChanged?.(snapshot.records.some(configurationOnline));
    if (window && !window.isDestroyed()) window.webContents.send('management:configurations-state', snapshot);
  });
  const codexDiscovery = new CodexDiscovery({ home: app.getPath('home'), guiPath: process.env.PATH ?? '', ...(process.env.CODEX_HOME ? { codexHome: process.env.CODEX_HOME } : {}) });
  const claudeDiscovery = new ClaudeDiscovery({ home: app.getPath('home'), guiPath: process.env.PATH ?? '' });
  const configurationIpc = registerConfigurationIpc({ window: () => window, configurations, preflight, claudeDiscovery, codexDiscovery,
    sessions: () => options.sessions?.() ?? { sessions: {}, bubbles: [] }, quitting: () => quitting });
  let tray: Tray | undefined;
  let runtimeError: string | null = null;
  let dockReady = false;
  let entryRevision = 0;
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
    return { preferences: preferences.snapshot(), preferenceError: preferences.error ?? runtimeError,
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
    if (preferences.update(patch)) {
      runtimeError = null;
      try {
        applyEntrypoints(previous);
        options.applyPreferences(preferences.snapshot());
      } catch { runtimeError = '偏好已保存，但部分系统设置未生效，请重新打开应用后检查。'; }
    }
    rebuildMenu();
    return publish();
  }
  function open(): void {
    if (quitting) return;
    windowRequested = true;
    if (!window || window.isDestroyed()) {
      window = new BrowserWindow({ width: 900, height: 680, minWidth: 400, minHeight: 400,
        show: false, frame: process.platform === 'darwin', title: 'Agent Pet', backgroundColor: '#f7f4ff',
        ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
        webPreferences: { preload: join(__dirname, '../preload/management.cjs'),
          contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
      const current = window;
      current.on('close', event => {
        connection.invalidate(); configurations.invalidateAll(); configurationIpc.invalidate();
        if (!quitting) {
          event.preventDefault(); windowRequested = false;
          if (preferences.snapshot().background) current.hide(); else app.quit();
        }
      });
      current.webContents.on('did-start-loading', () => { connection.invalidate(); configurations.invalidateAll(); configurationIpc.invalidate(); });
      current.webContents.on('render-process-gone', () => { connection.invalidate(); configurations.invalidateAll(); configurationIpc.invalidate(); });
      current.once('ready-to-show', () => {
        if (!quitting && windowRequested && window === current && !current.isDestroyed()) current.show();
      });
      current.on('closed', () => { connection.invalidate(); configurations.invalidateAll(); configurationIpc.invalidate(); if (window === current) window = undefined; });
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
      { role: 'editMenu' }, { label: 'View', submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' }, { role: 'resetZoom' }, { role: 'togglefullscreen' },
      ] },
    ]));
  }
  // Small bundled monochrome menu-bar glyph; no remote icon or extra asset dependency.
  const pixels = Buffer.alloc(16 * 16 * 4);
  for (let y = 3; y < 14; y++) for (let x = 3; x < 13; x++) {
    if (y >= 6 || x <= 5 || x >= 10) pixels[(y * 16 + x) * 4 + 3] = 255;
  }
  const icon = nativeImage.createFromBitmap(pixels, { width: 16, height: 16, scaleFactor: 1 });
  icon.setTemplateImage(true);
  function applyEntrypoints(previous?: Preferences): void {
    const next = preferences.snapshot();
    const revision = ++entryRevision;
    function ensureTray(): void {
      if (tray) return;
      tray = new Tray(icon);
      tray.setToolTip('Agent Pet'); tray.on('click', open); rebuildMenu();
    }
    // Establish a confirmed remaining entry before removing the previous one.
    if (next.tray || (!next.tray && !dockReady)) ensureTray();
    if (process.platform === 'darwin' && app.dock) {
      if (next.dock && (!dockReady || !previous || previous.dock !== next.dock)) {
        dockReady = false;
        ensureTray();
        void app.dock.show().then(() => {
          if (revision !== entryRevision || quitting) return;
          dockReady = true;
          if (!preferences.snapshot().tray && tray) { tray.destroy(); tray = undefined; }
        }).catch(() => {
          if (revision !== entryRevision || quitting) return;
          dockReady = false;
          runtimeError = 'Dock 图标未能显示，已保留菜单栏入口，请重试或重新打开应用。';
          ensureTray(); publish();
        });
      } else if (!next.dock) { dockReady = false; app.dock.hide(); }
    }
    if (!next.tray && dockReady && tray) { tray.destroy(); tray = undefined; }
  }
  applyEntrypoints();
  rebuildMenu();
  ipcMain.handle('management:window-action', (event, action: unknown) => {
    assertWindowSender(window, event);
    if (typeof action !== 'string' || !['minimize', 'toggle-maximize', 'close'].includes(action)) throw new TypeError('Invalid window action');
    if (quitting) return;
    if (action === 'minimize') window!.minimize();
    else if (action === 'toggle-maximize') {
      if (window!.isMaximized()) window!.unmaximize(); else window!.maximize();
    } else window!.close(); // Existing close handler owns background/quit and preview invalidation.
  });
  ipcMain.handle('management:get-state', event => { assertWindowSender(window, event); return state(); });
  ipcMain.handle('management:pet-assets-state', event => { assertWindowSender(window, event); return petAssets.snapshot(); });
  function readPetAssetFile(id: unknown, file: 'pet.glb' | 'avatar'): Uint8Array | null {
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(id) || id === 'starter') return null;
    const record = petAssets.snapshot().records.find(value => value.id === id && value.source === 'imported');
    if (!record) return null;
    const name = file === 'pet.glb' ? 'pet.glb' : record.manifest.avatar;
    if (!name || name.includes('/') || name.includes('\\')) return null;
    try {
      const path = join(petAssets.directory, id, name);
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > (file === 'pet.glb' ? 64 * 1024 * 1024 : 4 * 1024 * 1024)) return null;
      return new Uint8Array(readFileSync(path));
    } catch { return null; }
  }
  ipcMain.handle('management:pet-assets-model', (event, id: unknown) => { assertWindowSender(window, event); return readPetAssetFile(id, 'pet.glb'); });
  ipcMain.handle('management:pet-assets-avatar', (event, id: unknown) => { assertWindowSender(window, event); return readPetAssetFile(id, 'avatar'); });
  ipcMain.handle('management:pet-assets-choose', async event => {
    assertWindowSender(window, event);
    if (quitting) throw new Error('Application is quitting');
    const result = await dialog.showOpenDialog(window!, { title: '选择宠物文件夹', properties: ['openDirectory', 'dontAddToRecent'] });
    if (result.canceled || !result.filePaths[0]) return { ok: false, reason: 'cancelled' };
    const inspected = inspectPetFolder(result.filePaths[0]);
    if (!inspected.ok) return inspected;
    const token = randomUUID(); pendingPetImport = { token, preview: inspected.preview };
    return { ok: true, preview: { token, manifest: inspected.preview.manifest, modelBytes: inspected.preview.modelBytes, avatar: inspected.preview.avatar, avatarFile: inspected.preview.avatarFile } };
  });
  ipcMain.handle('management:pet-assets-confirm', (event, token: unknown) => {
    assertWindowSender(window, event);
    if (quitting || typeof token !== 'string' || !pendingPetImport || token !== pendingPetImport.token) throw new Error('Invalid pet import confirmation');
    const pending = pendingPetImport; pendingPetImport = undefined;
    if (!installPetFolder(pending.preview, petAssets)) throw new Error('宠物导入失败，未确认更改。');
    const next = petAssets.snapshot(); if (window && !window.isDestroyed()) window.webContents.send('management:pet-assets-state', next); return next;
  });
  ipcMain.handle('management:pet-assets-cancel', (event, token: unknown) => {
    assertWindowSender(window, event);
    if (typeof token !== 'string' || pendingPetImport?.token !== token) return;
    pendingPetImport = undefined;
  });
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
    resume: () => connection.resume(), disable: () => connection.disable(),
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
    void Promise.all([options.stop(), configurations.stop(), ...(collectionOwnsLegacy ? [] : [connection.stop()])]).catch(() => { console.warn('Adapter shutdown failed'); }).finally(() => {
      stopped = true; tray?.destroy();
      // Let native cancellation of the first before-quit unwind before retrying.
      // A microtask retry can leave a windowless process holding the instance lock.
      setImmediate(() => app.quit());
    });
  });
  options.applyPreferences(preferences.snapshot());
  // Construct the trusted IPC owner without forcing a console on startup.
  open();
  if (!preferences.snapshot().startConsole) { windowRequested = false; window?.hide(); }
  return { update, open, connection, configurations,
    publishSessions(snapshot: SessionState) { if (window && !window.isDestroyed()) window.webContents.send('management:sessions', snapshot); },
    preferences: () => preferences.snapshot(), isQuitting: () => quitting };
}
