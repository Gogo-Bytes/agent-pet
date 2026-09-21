import { useEffect, useRef } from 'react';
import type { Rect } from '../../../shared/overlay-layout.js';
import type { PetStore } from '../../app/bridge/pet-store.js';
import { rectStyle } from '../../shared/rect-style.js';
import { useWindowGesture } from '../../shared/use-window-gesture.js';
import { createPetScene } from './pet-scene.js';

export function PetCanvas({ store, rect, onNotice }: {
  store: PetStore; rect: Rect | undefined; onNotice: (message: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useWindowGesture(store.bridge, 'moveWindowBy');
  useEffect(() => {
    try { return createPetScene(canvas.current!, store, onNotice); }
    catch { onNotice('内置宠物加载失败，请重新打开窗口。'); }
  }, [store, onNotice]);
  return <canvas ref={canvas} className={`pet-canvas${drag.active ? ' pet-canvas--dragging' : ''}`}
    style={rectStyle(rect)} {...drag.handlers} />;
}
