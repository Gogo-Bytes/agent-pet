import { BrowserWindow, screen } from 'electron';
import type { SessionState } from '@agent-pet/domain';
import { join } from 'node:path';
import { configurationOnline, type AgentConfiguration, type ConfigurationsState } from '../shared/configurations.js';
import type { Preferences } from '../shared/preferences.js';
import type { OverlayLayout, Rect } from '../shared/overlay-layout.js';
import { createPetWindowOptions } from './window-options.js';
import { applyPetWindowLayer } from './pet-window-layer.js';
import { assertWindowSender, loadTrustedEntry } from './window-trust.js';
import { layoutOverlay } from './overlay-layout.js';
import { overlayHit } from './overlay-hit.js';

type DesktopPet = {
  window: BrowserWindow; configuration: AgentConfiguration; anchor: Rect; overlay?: OverlayLayout;
  interacting: boolean; controlsVisible: boolean; bubblesVisible: boolean; bubblesExpanded: boolean;
};

/** Each bound online configuration owns its native geometry, hit policy and routed Sessions. */
export function createDesktopPets(options: {
  directory: string; developmentUrl?: string;
  sessions(): SessionState; preferences(): Preferences; isQuitting(): boolean;
  resize(size: number): void; hide(): void;
}) {
  const pets = new Map<string, DesktopPet>();
  let configurations: ConfigurationsState = { revision: 0, records: [], sessionConfigurations: {}, notice: 'none', busy: false };
  function trusted(event: Electron.IpcMainInvokeEvent): DesktopPet {
    const pet = [...pets.values()].find(value => value.window.webContents === event.sender);
    assertWindowSender(pet?.window, event);
    return pet!;
  }
  function sessions(pet: DesktopPet): SessionState {
    const source = options.sessions();
    const belongs = (id: string) => configurations.sessionConfigurations[id] === pet.configuration.id;
    return { sessions: Object.fromEntries(Object.entries(source.sessions).filter(([id]) => belongs(id))),
      bubbles: source.bubbles.filter(bubble => belongs(bubble.sessionId)) };
  }
  function preferences(pet: DesktopPet): Preferences {
    return { ...options.preferences(), petAssetId: pet.configuration.pet!.assetId, petName: pet.configuration.pet!.name };
  }
  function updateHitPolicy(pet: DesktopPet): void {
    if (pet.window.isDestroyed() || !pet.overlay) return;
    const point = screen.getCursorScreenPoint();
    const local = { x: point.x - pet.overlay.bounds.x, y: point.y - pet.overlay.bounds.y };
    const hit = overlayHit(pet.overlay, local, pet);
    pet.window.setIgnoreMouseEvents(!hit, { forward: true });
  }
  function updateOverlay(pet: DesktopPet): void {
    if (pet.window.isDestroyed()) return;
    pet.overlay = layoutOverlay(pet.anchor, screen.getDisplayMatching(pet.anchor).workArea);
    pet.anchor = pet.overlay.anchor;
    pet.window.setBounds(pet.overlay.bounds);
    pet.window.webContents.send('pet:layout', pet.overlay);
    updateHitPolicy(pet);
  }
  function publish(pet: DesktopPet): void {
    pet.window.webContents.send('pet:snapshot', sessions(pet));
    pet.window.webContents.send('pet:preferences', preferences(pet));
  }
  function create(configuration: AgentConfiguration): DesktopPet {
    const window = new BrowserWindow(createPetWindowOptions(join(options.directory, '../preload/index.cjs')));
    const size = options.preferences().petSize;
    const pet: DesktopPet = { window, configuration,
      anchor: { x: 100 + pets.size * (size + 24), y: 300, width: size, height: size },
      interacting: false, controlsVisible: false, bubblesVisible: false, bubblesExpanded: false };
    pets.set(configuration.id, pet);
    const restoreLayer = () => applyPetWindowLayer(window, options.preferences().topmost);
    restoreLayer(); window.on('show', restoreLayer); window.on('restore', restoreLayer);
    window.setResizable(false);
    let rendererRecoveryAttempts = 0;
    const resetPresentation = () => {
      pet.interacting = false; pet.controlsVisible = false; pet.bubblesVisible = false; pet.bubblesExpanded = false;
      updateHitPolicy(pet);
    };
    window.webContents.on('did-start-loading', resetPresentation);
    window.webContents.on('render-process-gone', () => {
      resetPresentation();
      if (options.isQuitting() || window.isDestroyed() || rendererRecoveryAttempts >= 1) return;
      rendererRecoveryAttempts++; window.webContents.reload();
    });
    window.once('ready-to-show', () => {
      if (pets.get(configuration.id) === pet && !options.isQuitting() && options.preferences().petVisible) window.showInactive();
    });
    window.on('close', event => {
      if (!options.isQuitting()) { event.preventDefault(); options.hide(); }
    });
    window.on('closed', () => { if (pets.get(configuration.id) === pet) pets.delete(configuration.id); });
    loadTrustedEntry(window, join(options.directory, '../renderer/index.html'), options.developmentUrl);
    updateOverlay(pet);
    return pet;
  }
  return {
    close(): void {
      const current = [...pets.values()]; pets.clear();
      for (const pet of current) if (!pet.window.isDestroyed()) pet.window.destroy();
    },
    updateConfigurations(next: ConfigurationsState): void {
      configurations = next;
      const active = next.records.filter(record => configurationOnline(record) && record.pet);
      const ids = new Set(active.map(record => record.id));
      for (const [id, pet] of pets) if (!ids.has(id)) {
        pets.delete(id); pet.window.destroy();
      }
      if (options.isQuitting()) return;
      for (const configuration of active) {
        const pet = pets.get(configuration.id) ?? create(configuration);
        pet.configuration = configuration;
        publish(pet);
      }
    },
    applyPreferences(): void {
      for (const pet of pets.values()) {
        const next = options.preferences();
        pet.anchor.width = next.petSize; pet.anchor.height = next.petSize;
        updateOverlay(pet); applyPetWindowLayer(pet.window, next.topmost);
        pet.window.webContents.send('pet:preferences', preferences(pet));
        if (next.petVisible !== pet.window.isVisible()) {
          if (next.petVisible && !options.isQuitting()) pet.window.showInactive(); else pet.window.hide();
        }
      }
    },
    publishSessions(): void { for (const pet of pets.values()) pet.window.webContents.send('pet:snapshot', sessions(pet)); },
    updateLayouts(): void { for (const pet of pets.values()) updateOverlay(pet); },
    updateHitPolicies(): void { for (const pet of pets.values()) updateHitPolicy(pet); },
    requestSnapshot(event: Electron.IpcMainInvokeEvent): void { const pet = trusted(event); publish(pet); updateOverlay(pet); },
    presentation(event: Electron.IpcMainInvokeEvent, key: 'interacting' | 'controlsVisible' | 'bubblesVisible' | 'bubblesExpanded', value: unknown): void {
      const pet = trusted(event);
      if (typeof value !== 'boolean') throw new TypeError('Invalid presentation visibility');
      pet[key] = value; updateHitPolicy(pet);
    },
    move(event: Electron.IpcMainInvokeEvent, delta: { x: number; y: number }): void {
      const pet = trusted(event); pet.anchor.x += Math.round(delta.x); pet.anchor.y += Math.round(delta.y); updateOverlay(pet);
    },
    resize(event: Electron.IpcMainInvokeEvent, delta: { x: number; y: number }): void {
      const pet = trusted(event);
      options.resize(Math.max(80, Math.min(600, pet.anchor.width + Math.round((delta.x + delta.y) / 2))));
    },
    assertSession(event: Electron.IpcMainInvokeEvent, sessionId: string, provider: string): void {
      const pet = trusted(event);
      if (configurations.sessionConfigurations[sessionId] !== pet.configuration.id || options.sessions().sessions[sessionId]?.provider !== provider) throw new Error('Session belongs to another pet');
    },
    assertAsset(event: Electron.IpcMainInvokeEvent, assetId: unknown): void {
      const pet = trusted(event);
      if (assetId !== pet.configuration.pet!.assetId) throw new Error('Asset belongs to another pet');
    },
    assertTrusted: trusted,
  };
}
