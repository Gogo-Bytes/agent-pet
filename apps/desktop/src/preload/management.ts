import { contextBridge, ipcRenderer } from 'electron';
import type { ManagementState, PreferencePatch } from '../shared/preferences.js';
const managementApi = {
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
