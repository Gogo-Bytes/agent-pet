import { app, ipcMain, screen } from 'electron';
import type { AdapterHandle, SessionRef } from '@agent-pet/adapter-core';
import { PiBridgeAdapter } from '@agent-pet/adapter-pi';
import { createApplication } from '@agent-pet/application';
import { createDevObservationEvidence } from './dev-observation-evidence.js';
import { createManagement } from './management.js';
import { createDesktopPets } from './desktop-pets.js';
import { readPiBridgeConfig } from './pi-config.js';
import { defaultPreferences, type Preferences } from '../shared/preferences.js';
// Acquire ownership before creating the Application, Adapter, windows or IPC handlers.
if (!app.requestSingleInstanceLock()) app.quit();
else startPrimaryInstance();

function startPrimaryInstance(): void {
  let management: ReturnType<typeof createManagement> | undefined;
  let currentPreferences: Preferences = { ...defaultPreferences };
  let adapterStart: Promise<void> = Promise.resolve();
  const pets = createDesktopPets({ directory: __dirname,
    ...(!app.isPackaged && process.env.ELECTRON_RENDERER_URL ? { developmentUrl: process.env.ELECTRON_RENDERER_URL } : {}),
    sessions: () => application.snapshot(), preferences: () => currentPreferences,
    isQuitting: () => management?.isQuitting() ?? false,
    resize: petSize => { if (management?.update({ petSize }).preferenceError) management.open(); },
    hide: () => { if (management?.update({ petVisible: false }).preferenceError) management.open(); },
  });
  for (const [channel, key] of [
    ['pet:controls-visible', 'controlsVisible'], ['pet:bubbles-expanded', 'bubblesExpanded'],
    ['pet:bubbles-visible', 'bubblesVisible'], ['pet:interaction', 'interacting'],
  ] as const) ipcMain.handle(channel, (event, value: unknown) => pets.presentation(event, key, value));
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
    pets.publishSessions();
  });

  ipcMain.handle('pet:request-snapshot', event => pets.requestSnapshot(event));

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
    pets.assertTrusted(event);
    const ref = parseSessionRef(value);
    pets.assertSession(event, ref.sessionId, ref.provider);
    return application.acknowledgeAndOpen(ref);
  });

  function deltaValue(value: unknown): { x: number; y: number } {
    if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value) ||
        typeof value.x !== 'number' || typeof value.y !== 'number' ||
        !Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new TypeError('Invalid delta');
    return { x: value.x, y: value.y };
  }
  ipcMain.handle('pet:resize-window-by', (event, value: unknown) => {
    pets.assertTrusted(event); pets.resize(event, deltaValue(value));
  });
  ipcMain.handle('pet:move-window-by', (event, value: unknown) => {
    pets.assertTrusted(event); pets.move(event, deltaValue(value));
  });

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
    screen.on('display-removed', pets.updateLayouts);
    screen.on('display-metrics-changed', pets.updateLayouts);
    const hitTimer = setInterval(pets.updateHitPolicies, 50);
    hitTimer.unref();
    app.once('will-quit', () => clearInterval(hitTimer));
    management = createManagement({
      sessions: () => application.snapshot(),
      pi: { adapter: piAdapter, publish: observation => application.observe(observation), developmentEnvironment },
      configurationsChanged: snapshot => pets.updateConfigurations(snapshot),
      applyPreferences: preferences => {
        currentPreferences = preferences; pets.applyPreferences();
      },
      stop: async () => {
        clearInterval(hitTimer); pets.close();
        await adapterStart;
        await piHandle?.stop();
      },
    });
    ipcMain.handle('pet:asset', (event, id: unknown) => {
      pets.assertAsset(event, id);
      return typeof id === 'string' ? management?.petAsset(id) ?? null : null;
    });
    pets.updateConfigurations(management.configurations.snapshot());
    adapterStart = startConfiguredAdapters();
  });
}
