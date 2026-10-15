import { useEffect, useMemo } from 'react';
import type { AnimationClip, Group } from 'three';
import { useThree } from '@react-three/fiber';
import { useBounds, useGLTF } from '@react-three/drei';
import { bundledAnimations, type PetMotion, type PetAnimations } from '@agent-pet/pet-runtime';
import { usePetAnimation } from '../../shared/usePetAnimation.js';
import starterUrl from '@agent-pet/pet-runtime/assets/starter.glb?url';
import { bundledAnimationBounds } from './bundled-animation-bounds.js';

export function PetModel({ motion, reduced = false, onReady, onHover, animations = bundledAnimations, replay = 0, restAction = 'idle' }: { replay?: number | string; restAction?: PetMotion; reduced?: boolean; motion: PetMotion; animations?: PetAnimations; onReady: (message: string) => void; onHover?: (hovered: boolean) => void }) {
  // No decoder/CDN needed by this local, uncompressed asset.
  const gltf: { scene: Group; animations: AnimationClip[] } = useGLTF(starterUrl, false, false);
  // Object transforms belong to this instance. The non-skinned bundled robot's
  // geometry/materials/textures still belong to useGLTF's shared URL cache.
  const root = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const envelope = useMemo(() => bundledAnimationBounds(gltf.scene, gltf.animations), [gltf.scene, gltf.animations]);
  usePetAnimation(root, gltf.animations, animations, motion, reduced, replay, restAction);
  const bounds = useBounds();
  const size = useThree(state => state.size);
  useEffect(() => {
    bounds.refresh(envelope).clip().fit();
  }, [bounds, envelope, size.width, size.height]);
  useEffect(() => {
    onReady('');
  }, [onReady]);
  useEffect(() => () => onHover?.(false), [onHover]);
  return <group name="pet-pointer-target" onPointerOver={event => { event.stopPropagation(); onHover?.(true); }} onPointerOut={() => onHover?.(false)}>
    <primitive object={root} dispose={null} />
  </group>;
}
