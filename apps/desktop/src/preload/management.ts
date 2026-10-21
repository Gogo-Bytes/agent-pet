import { contextBridge, ipcRenderer } from 'electron';
import type { ManagementWindowAction } from '../shared/window-controls.js';
import type { SessionState } from '@agent-pet/domain';
import type { ConfigurationsApi, ConfigurationsState } from '../shared/configurations.js';
import type { ConfigurationLocationsApi } from '../shared/configuration-locations.js';
import type { ManagementState, PreferencePatch } from '../shared/preferences.js';
import type { PetAssetsApi, PetAssetsState } from '../shared/pet-assets.js';
import type { PiPreflightApi } from '../shared/pi-preflight.js';
import type { PiConnectionApi, PiConnectionState } from '../shared/pi-connection.js';
const piConnection: PiConnectionApi = {
  getState: () => ipcRenderer.invoke('management:pi-connection-state'),
  preview: () => ipcRenderer.invoke('management:pi-connection-preview'),
  cancel: () => ipcRenderer.invoke('management:pi-connection-cancel'),
  confirm: id => ipcRenderer.invoke('management:pi-connection-confirm', id),
  resume: () => ipcRenderer.invoke('management:pi-connection-resume'),
  disable: () => ipcRenderer.invoke('management:pi-connection-disable'),
  remove: () => ipcRenderer.invoke('management:pi-connection-remove'),
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, state: PiConnectionState) => listener(state);
    ipcRenderer.on('management:pi-connection-state', handler);
    return () => { ipcRenderer.removeListener('management:pi-connection-state', handler); };
  },
};
const piPreflight: PiPreflightApi = {
  getState: () => ipcRenderer.invoke('management:pi-state'),
  detect: () => ipcRenderer.invoke('management:pi-detect'),
  chooseInstallation: () => ipcRenderer.invoke('management:pi-choose-installation'),
  selectInstallation: (id: string) => ipcRenderer.invoke('management:pi-select-installation', id),
  chooseTarget: () => ipcRenderer.invoke('management:pi-choose-target'),
  useDefaultTarget: () => ipcRenderer.invoke('management:pi-default-target'),
  inspect: () => ipcRenderer.invoke('management:pi-inspect'),
};
const configurations: ConfigurationsApi = {
  getState: () => ipcRenderer.invoke('management:configurations-state'),
  create: input => ipcRenderer.invoke('management:configurations-create', input),
  prepareDetected: (id, requestId) => ipcRenderer.invoke('management:configurations-prepare-detected', id, requestId),
  detectCodex: requestId => ipcRenderer.invoke('management:configurations-detect-codex', requestId),
  cancelCodexScan: requestId => ipcRenderer.invoke('management:configurations-cancel-codex-scan', requestId),
  prepareDetectedCodex: (id, requestId) => ipcRenderer.invoke('management:configurations-prepare-detected-codex', id, requestId),
  detectClaude: requestId => ipcRenderer.invoke('management:configurations-detect-claude', requestId),
  cancelClaudeScan: requestId => ipcRenderer.invoke('management:configurations-cancel-claude-scan', requestId),
  prepareDetectedClaude: (id, requestId) => ipcRenderer.invoke('management:configurations-prepare-detected-claude', id, requestId),
  cancelDetected: requestId => ipcRenderer.invoke('management:configurations-cancel-detected', requestId),
  rename: (id, name) => ipcRenderer.invoke('management:configurations-rename', id, name),
  changeTarget: (id, path) => ipcRenderer.invoke('management:configurations-target', id, path),
  bindPet: (id, pet) => ipcRenderer.invoke('management:configurations-pet', id, pet),
  inspect: id => ipcRenderer.invoke('management:configurations-inspect', id),
  preview: id => ipcRenderer.invoke('management:configurations-preview', id),
  cancel: id => ipcRenderer.invoke('management:configurations-cancel', id),
  confirm: (id, planId) => ipcRenderer.invoke('management:configurations-confirm', id, planId),
  resume: id => ipcRenderer.invoke('management:configurations-resume', id),
  disable: id => ipcRenderer.invoke('management:configurations-disable', id),
  remove: id => ipcRenderer.invoke('management:configurations-remove', id),
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, state: ConfigurationsState) => listener(state);
    ipcRenderer.on('management:configurations-state', handler);
    return () => ipcRenderer.removeListener('management:configurations-state', handler);
  },
};
const locations: ConfigurationLocationsApi = {
  choose: () => ipcRenderer.invoke('management:location-choose'),
  authorize: path => ipcRenderer.invoke('management:location-authorize', path),
  inspect: (path, provider) => ipcRenderer.invoke('management:location-inspect', path, provider),
};
const petAssets: PetAssetsApi = {
  getState: () => ipcRenderer.invoke('management:pet-assets-state'),
  getModel: id => ipcRenderer.invoke('management:pet-assets-model', id),
  getAvatar: id => ipcRenderer.invoke('management:pet-assets-avatar', id),
  choose: () => ipcRenderer.invoke('management:pet-assets-choose'),
  confirm: token => ipcRenderer.invoke('management:pet-assets-confirm', token),
  remove: id => ipcRenderer.invoke('management:pet-assets-remove', id),
  cancel: token => ipcRenderer.invoke('management:pet-assets-cancel', token),
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, state: PetAssetsState) => listener(state);
    ipcRenderer.on('management:pet-assets-state', handler);
    return () => ipcRenderer.removeListener('management:pet-assets-state', handler);
  },
};
const managementApi = {
  nativeWindowControls: process.platform === 'darwin',
  piPreflight, piConnection, configurations, locations, petAssets,
  windowAction(action: ManagementWindowAction): Promise<void> { return ipcRenderer.invoke('management:window-action', action); },
  getSessions(): Promise<SessionState> { return ipcRenderer.invoke('management:sessions'); },
  openProject(): Promise<void> { return ipcRenderer.invoke('management:project'); },
  subscribeSessions(listener: (sessions: SessionState) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, sessions: SessionState) => listener(sessions);
    ipcRenderer.on('management:sessions', handler);
    return () => ipcRenderer.removeListener('management:sessions', handler);
  },
  getState(): Promise<ManagementState> { return ipcRenderer.invoke('management:get-state'); },
  updatePreferences(patch: PreferencePatch): Promise<ManagementState> { return ipcRenderer.invoke('management:update-preferences', patch); },
  setLogin(enabled: boolean): Promise<ManagementState> { return ipcRenderer.invoke('management:set-login', enabled); },
  subscribe(listener: (state: ManagementState) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, state: ManagementState) => listener(state);
    ipcRenderer.on('management:state', handler);
    return () => { ipcRenderer.removeListener('management:state', handler); };
  },
};
contextBridge.exposeInMainWorld('management', managementApi);
declare global { interface Window { management: typeof managementApi } }
