import { contextBridge, ipcRenderer } from 'electron';
import type { ManagementState, PreferencePatch } from '../shared/preferences.js';
import type { PiPreflightApi } from '../shared/pi-preflight.js';
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
  piPreflight,
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
