import { contextBridge, ipcRenderer } from 'electron';
import type { ManagementState, PreferencePatch } from '../shared/preferences.js';
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
const managementApi = {
  piPreflight, piConnection,
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
