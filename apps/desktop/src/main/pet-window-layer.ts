import type { BrowserWindow } from 'electron';

/** Reapply presentation after show/restore without activating the user's Agent window. */
export function applyPetWindowLayer(window: Pick<BrowserWindow, 'isDestroyed' | 'isVisible' | 'setAlwaysOnTop' | 'setVisibleOnAllWorkspaces' | 'moveTop'>,
  topmost: boolean, platform: NodeJS.Platform = process.platform): void {
  if (window.isDestroyed()) return;
  window.setAlwaysOnTop(topmost, 'screen-saver');
  if (platform === 'darwin') window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  if (topmost && window.isVisible()) window.moveTop();
}
