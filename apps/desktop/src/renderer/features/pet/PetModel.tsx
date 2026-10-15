import { useEffect, useMemo } from 'react';
import type { AnimationClip, Group } from 'three';
import { useThree } from '@react-three/fiber';
import { useAnimations, useBounds, useGLTF } from '@react-three/drei';
import { animationForStatus, type PetMotion } from '@agent-pet/pet-runtime';
import starterUrl from '@agent-pet/pet-runtime/assets/starter.glb?url';
import { bundledAnimationBounds } from './bundled-animation-bounds.js';

const animations = { idle: 'Idle', working: 'Work', success: 'Success', error: 'Error' };
const statuses = { working: 'working', success: 'completed-unread', error: 'error-unread' } as const;

export function PetModel({ motion, reduced = false, onReady, onHover }: { reduced?: boolean; motion: PetMotion; onReady: (message: string) => void; onHover?: (hovered: boolean) => void }) {
  // No decoder/CDN needed by this local, uncompressed asset.
  const gltf: { scene: Group; animations: AnimationClip[] } = useGLTF(starterUrl, false, false);
  if (!gltf.animations.some(clip => clip.name === animations.idle)) throw new Error('Required Idle clip is missing');
  // Object transforms belong to this instance. The non-skinned bundled robot's
  // geometry/materials/textures still belong to useGLTF's shared URL cache.
  const root = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const envelope = useMemo(() => bundledAnimationBounds(gltf.scene, gltf.animations), [gltf.scene, gltf.animations]);
  const instance = useMemo(() => ({ current: root }), [root]);
  // Drei owns mixer caches. Do not uncacheRoot in effect cleanup: its lazy
  // actions survive effect reactivation and would reference removed bindings.
  const { actions } = useAnimations(gltf.animations, instance);
  const bounds = useBounds();
  const size = useThree(state => state.size);
  useEffect(() => {
    bounds.refresh(envelope).clip().fit();
  }, [bounds, envelope, size.width, size.height]);
  useEffect(() => {
    const name = motion === 'idle' ? animations.idle : animationForStatus(statuses[motion], animations);
    const action = actions[name] ?? actions[animations.idle]!;
    action.reset().play();
    action.paused = reduced;
    // Exactly one action owns the pose; rapid transitions never accumulate
    // fading actions. Drei alone advances this mixer in R3F's frame loop.
    return () => { action.stop(); };
  }, [actions, motion, reduced]);
  useEffect(() => {
    onReady('');
  }, [onReady]);
  useEffect(() => () => onHover?.(false), [onHover]);
  return <group name="pet-pointer-target" onPointerOver={event => { event.stopPropagation(); onHover?.(true); }} onPointerOut={() => onHover?.(false)}>
    <primitive object={root} dispose={null} />
  </group>;
}
