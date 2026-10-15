import { contextBridge, ipcRenderer } from 'electron';
import type { SessionRef, OpenSessionResult } from '@agent-pet/adapter-core';
import type { SessionState } from '@agent-pet/domain';

const channels = {
  acknowledgeAndOpen: 'pet:acknowledge-and-open',
  moveWindowBy: 'pet:move-window-by',
  resizeWindowBy: 'pet:resize-window-by',
  snapshot: 'pet:snapshot',
} as const;

import type { Preferences } from '../shared/preferences.js';
import type { OverlayLayout } from '../shared/overlay-layout.js';
const petApi = {
  subscribePreferences(listener: (preferences: Preferences) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, preferences: Preferences) => listener(preferences);
    ipcRenderer.on('pet:preferences', handler);
    return () => ipcRenderer.removeListener('pet:preferences', handler);
  },
  controlsVisible(visible: boolean): Promise<void> { return ipcRenderer.invoke('pet:controls-visible', visible); },
  bubblesExpanded(expanded: boolean): Promise<void> { return ipcRenderer.invoke('pet:bubbles-expanded', expanded); },
  // Actual committed bubble presence. Main retains the region until DOM removal,
  // and the renderer waits for true acknowledgement before revealing content.
  bubblesVisible(visible: boolean): Promise<void> { return ipcRenderer.invoke('pet:bubbles-visible', visible); },
  interaction(active: boolean): Promise<void> { return ipcRenderer.invoke('pet:interaction', active); },
  subscribeLayout(listener: (layout: OverlayLayout) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, layout: OverlayLayout) => listener(layout);
    ipcRenderer.on('pet:layout', handler);
    return () => { ipcRenderer.removeListener('pet:layout', handler); };
  },
  acknowledgeAndOpen(session: SessionRef): Promise<OpenSessionResult> {
    return ipcRenderer.invoke(channels.acknowledgeAndOpen, session);
  },
  requestSnapshot(): Promise<void> {
    return ipcRenderer.invoke('pet:request-snapshot');
  },
  moveWindowBy(delta: { x: number; y: number }): Promise<void> {
    return ipcRenderer.invoke(channels.moveWindowBy, delta);
  },
  resizeWindowBy(delta: { x: number; y: number }): Promise<void> {
    return ipcRenderer.invoke(channels.resizeWindowBy, delta);
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
