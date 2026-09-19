import { contextBridge, ipcRenderer } from 'electron';
import type { SessionRef, OpenSessionResult } from '@agent-pet/adapter-core';
import type { SessionState } from '@agent-pet/domain';

const channels = {
  acknowledgeAndOpen: 'pet:acknowledge-and-open',
  moveWindowBy: 'pet:move-window-by',
  snapshot: 'pet:snapshot',
} as const;

const petApi = {
  acknowledgeAndOpen(session: SessionRef): Promise<OpenSessionResult> {
    return ipcRenderer.invoke(channels.acknowledgeAndOpen, session);
  },
  moveWindowBy(delta: { x: number; y: number }): Promise<void> {
    return ipcRenderer.invoke(channels.moveWindowBy, delta);
  },
  subscribeSnapshot(listener: (snapshot: SessionState) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: SessionState) => {
      listener(snapshot);
    };
    ipcRenderer.on(channels.snapshot, handler);
    return () => ipcRenderer.removeListener(channels.snapshot, handler);
  },
};

contextBridge.exposeInMainWorld('pet', petApi);

declare global {
  interface Window {
    pet: typeof petApi;
  }
}
