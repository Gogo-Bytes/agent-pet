import { app, BrowserWindow, ipcMain, screen } from 'electron';
import type { AdapterHandle, SessionRef } from '@agent-pet/adapter-core';
import { PiBridgeAdapter } from '@agent-pet/adapter-pi';
import { createApplication } from '@agent-pet/application';
import { join } from 'node:path';
import { createDevObservationEvidence } from './dev-observation-evidence.js';
import { createManagement } from './management.js';
import { assertWindowSender, loadTrustedEntry } from './window-trust.js';
import { createPetWindowOptions } from './window-options.js';
import { applyPetWindowLayer } from './pet-window-layer.js';
import { readPiBridgeConfig } from './pi-config.js';
import { defaultPreferences, type Preferences } from '../shared/preferences.js';

import { layoutOverlay } from './overlay-layout.js';
import { overlayHit } from './overlay-hit.js';
import type { Rect, OverlayLayout } from '../shared/overlay-layout.js';
// Acquire ownership before creating the Application, Adapter, windows or IPC handlers.
if (!app.requestSingleInstanceLock()) app.quit();
else startPrimaryInstance();

function startPrimaryInstance(): void {
  let management: ReturnType<typeof createManagement> | undefined;
  let petVisible = true;
  let petOnline = false;
  let currentPreferences: Preferences = { ...defaultPreferences };
  function applyPetVisibility(): void {
    const visible = currentPreferences.petVisible && (currentPreferences.offline || petOnline);
    if (visible !== petVisible || !preferencesApplied) {
      petVisible = visible;
      if (visible) petWindow?.showInactive(); else petWindow?.hide();
    }
  }
  let preferencesApplied = false;
  let adapterStart: Promise<void> = Promise.resolve();
  let petWindow: BrowserWindow | undefined;
  let anchor: Rect = { x: 100, y: 300, width: 140, height: 140 };
  let overlay: OverlayLayout;
  let interacting = false;
  // Renderer reports committed presentation, not the user visibility preference.
  let bubblesVisible = false;
  let bubblesExpanded = false;
  let controlsVisible = false;
  ipcMain.handle('pet:controls-visible', (event, visible: unknown) => {
    assertTrustedRenderer(event);
    if (typeof visible !== 'boolean') throw new TypeError('Invalid controls visibility');
    controlsVisible = visible; updateHitPolicy();
  });
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
  const application = createApplication([piAdapter]);
  // Partial/invalid env configuration also reserves the dev path: never silently replace it.
  const developmentEnvironment = process.env.AGENT_PET_PI_ENDPOINT !== undefined ||
    process.env.AGENT_PET_PI_TOKEN !== undefined || piConfig !== undefined;
  const evidence = !app.isPackaged && process.env.AGENT_PET_DEV_EVIDENCE_DIR
    ? createDevObservationEvidence(process.env.AGENT_PET_DEV_EVIDENCE_DIR) : undefined;
  app.once('will-quit', () => evidence?.close());
  application.subscribe((snapshot) => {
    evidence?.observe(snapshot);
    management?.publishSessions(snapshot);
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('pet:snapshot', snapshot);
    }
  });

  ipcMain.handle('pet:request-snapshot', (event) => {
    assertTrustedRenderer(event);
    event.sender.send('pet:snapshot', application.snapshot());
    event.sender.send('pet:preferences', currentPreferences);
    updateOverlay();
  });

  function assertTrustedRenderer(event: Electron.IpcMainInvokeEvent): void {
    assertWindowSender(petWindow, event);
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
    const size = Math.max(80, Math.min(600, anchor.width + Math.round((delta.x + delta.y) / 2)));
    const result = management?.update({ petSize: size });
    if (result?.preferenceError) management?.open();
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
    const hit = overlayHit(overlay, local, { interacting, controlsVisible, bubblesVisible, bubblesExpanded });
    petWindow.setIgnoreMouseEvents(!hit, { forward: true });
  }

  function createPetWindow(): BrowserWindow {
    const window = new BrowserWindow(
      createPetWindowOptions(join(__dirname, '../preload/index.cjs')),
    );

    const restoreLayer = () => applyPetWindowLayer(window, currentPreferences.topmost);
    restoreLayer();
    window.on('show', restoreLayer);
    window.on('restore', restoreLayer);
    window.setResizable(false);
    let rendererRecoveryAttempts = 0;
    const resetPresentation = () => {
      interacting = false; controlsVisible = false; bubblesVisible = false; bubblesExpanded = false;
      updateHitPolicy();
    };
    const recoverRenderer = () => {
      resetPresentation();
      if (management?.isQuitting() || window.isDestroyed() || rendererRecoveryAttempts >= 1) return;
      rendererRecoveryAttempts++;
      window.webContents.reload();
    };
    window.webContents.on('did-start-loading', resetPresentation);
    window.webContents.on('render-process-gone', recoverRenderer);
    const rendererFile = join(__dirname, '../renderer/index.html');
    const developmentUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
    loadTrustedEntry(window, rendererFile, developmentUrl);
    window.once('ready-to-show', () => { if (petVisible && !management?.isQuitting()) window.showInactive(); });
    window.on('close', event => {
      if (!management?.isQuitting()) {
        event.preventDefault();
        const result = management?.update({ petVisible: false });
        if (result?.preferenceError) management?.open();
      }
    });
    return window;
  }

  async function startConfiguredAdapters(): Promise<void> {
    if (!piConfig) {
      if (developmentEnvironment) management?.connection.developmentStarted(false);
      return;
    }
    try {
      piHandle = await piAdapter.start(piConfig, {
        publish: observation => { management?.configurations.registerLegacySession(observation.sessionId); application.observe(observation); },
        connectionChanged: state => {
          management?.connection.connectionChanged(state);
        },
      });
      management?.connection.developmentStarted(true);
    } catch {
      management?.connection.developmentStarted(false);
      console.warn('[pi adapter] start failed');
    }
  }

  app.whenReady().then(() => {
    petWindow = createPetWindow();
    updateOverlay();
    screen.on('display-removed', updateOverlay);
    screen.on('display-metrics-changed', updateOverlay);
    const hitTimer = setInterval(updateHitPolicy, 50);
    hitTimer.unref();
    app.once('will-quit', () => clearInterval(hitTimer));
    management = createManagement({
      sessions: () => application.snapshot(),
      pi: { adapter: piAdapter, publish: observation => application.observe(observation), developmentEnvironment },
      onlineChanged: online => { petOnline = online; applyPetVisibility(); },
      applyPreferences: preferences => {
        currentPreferences = preferences;
        applyPetVisibility();
        preferencesApplied = true;
        anchor.width = preferences.petSize;
        anchor.height = preferences.petSize;
        updateOverlay();
        if (petWindow) applyPetWindowLayer(petWindow, preferences.topmost);
        petWindow?.webContents.send('pet:preferences', preferences);
      },
      stop: async () => {
        clearInterval(hitTimer);
        await adapterStart;
        await piHandle?.stop();
      },
    });
    ipcMain.handle('pet:asset', (event, id: unknown) => {
      assertTrustedRenderer(event);
      return typeof id === 'string' ? management?.petAsset(id) ?? null : null;
    });
    adapterStart = startConfiguredAdapters();
  });
}
