import { Component, Suspense, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds } from '@react-three/drei';
import type { Rect } from '../../../shared/overlay-layout.js';
import type { PetStore } from '../../app/bridge/pet-store.js';
import { rectStyle } from '../../shared/rect-style.js';
import { useWindowGesture } from '../../shared/use-window-gesture.js';
import { projectPetPresentation } from '@agent-pet/pet-runtime';
import styles from './PetCanvas.module.css';
import { PreferenceRenderLoop } from '../../shared/PreferenceRenderLoop.js';
import { PetModel } from './PetModel.js';

function LoadingNotice({ onNotice }: { onNotice: (message: string) => void }) {
  useEffect(() => { onNotice('正在加载内置 GLB 宠物…'); }, [onNotice]);
  return null;
}

class PetErrorBoundary extends Component<{ children: ReactNode; onNotice: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onNotice('内置宠物加载失败，请重新打开窗口。'); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function PetCanvas({ store, rect, onNotice, onHover, visible }: {
  visible: boolean; store: PetStore; rect: Rect | undefined; onNotice: (message: string) => void; onHover?: (hovered: boolean) => void;
}) {
  const { sessions, preferences } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const presentation = projectPetPresentation(sessions);
  const drag = useWindowGesture(store.bridge, 'moveWindowBy');
  // Canvas adds its own sizing divs. Keep Main's absolute pixel region and the
  // native pointer handlers on this outer surface, never on a Three mesh.
  return <div className={`pet-canvas ${styles.surface}${drag.active ? ` pet-canvas--dragging ${styles.dragging}` : ''}`}
    style={rectStyle(rect)} {...drag.handlers}>
    <PetErrorBoundary onNotice={onNotice}>
      <Canvas flat dpr={preferences.resolution / 100} gl={{ alpha: true, antialias: true }}
        camera={{ fov: 35, position: [0, 0, 5] }}
        frameloop="never">
        <PreferenceRenderLoop active={visible || !preferences.pauseHidden} fps={preferences.fps} />
        <ambientLight intensity={2} />
        <directionalLight color="#ffffff" intensity={3} position={[3, 5, 4]} />
        <Suspense fallback={<LoadingNotice onNotice={onNotice} />}>
          <Bounds margin={1.2} maxDuration={0}>
            <PetModel motion={presentation.action} replay={presentation.replay} restAction={presentation.restAction} reduced={preferences.reduced} onReady={onNotice} {...(onHover ? { onHover } : {})} />
          </Bounds>
        </Suspense>
      </Canvas>
    </PetErrorBoundary>
  </div>;
}
