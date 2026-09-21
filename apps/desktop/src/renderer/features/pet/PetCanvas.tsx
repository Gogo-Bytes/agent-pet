import { Component, Suspense, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds } from '@react-three/drei';
import type { Rect } from '../../../shared/overlay-layout.js';
import type { PetStore } from '../../app/bridge/pet-store.js';
import { rectStyle } from '../../shared/rect-style.js';
import { useWindowGesture } from '../../shared/use-window-gesture.js';
import { selectPetMotion } from '../../pet-motion.js';
import { PetModel } from './PetModel.js';

function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}
const isVisible = () => !document.hidden;

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

export function PetCanvas({ store, rect, onNotice }: {
  store: PetStore; rect: Rect | undefined; onNotice: (message: string) => void;
}) {
  const { sessions } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const visible = useSyncExternalStore(subscribeVisibility, isVisible);
  const drag = useWindowGesture(store.bridge, 'moveWindowBy');
  // Canvas adds its own sizing divs. Keep Main's absolute pixel region and the
  // native pointer handlers on this outer surface, never on a Three mesh.
  return <div className={`pet-canvas${drag.active ? ' pet-canvas--dragging' : ''}`}
    style={rectStyle(rect)} {...drag.handlers}>
    <PetErrorBoundary onNotice={onNotice}>
      <Canvas flat dpr={[1, 2]} gl={{ alpha: true, antialias: true }}
        camera={{ fov: 35, position: [0, 0, 5] }}
        frameloop={visible ? 'always' : 'never'}>
        <ambientLight intensity={2} />
        <directionalLight color="#ffffff" intensity={3} position={[3, 5, 4]} />
        <Suspense fallback={<LoadingNotice onNotice={onNotice} />}>
          <Bounds margin={1.2} maxDuration={0}>
            <PetModel motion={selectPetMotion(sessions.bubbles)} onReady={onNotice} />
          </Bounds>
        </Suspense>
      </Canvas>
    </PetErrorBoundary>
  </div>;
}
