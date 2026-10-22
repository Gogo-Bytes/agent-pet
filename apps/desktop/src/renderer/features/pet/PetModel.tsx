import { useEffect, useMemo } from 'react';
import { Box3, type AnimationClip, type Group } from 'three';
import { useThree } from '@react-three/fiber';
import { useBounds, useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { bundledAnimations, type PetMotion, type PetAnimations } from '@agent-pet/pet-runtime';
import { usePetAnimation } from '../../shared/usePetAnimation.js';
import starterUrl from '@agent-pet/pet-runtime/assets/starter.glb?url';
import { bundledAnimationBounds } from './bundled-animation-bounds.js';

export function PetModel({ motion, reduced = false, onReady, onHover, animations = bundledAnimations, replay = 0, restAction = 'idle', modelUrl }: { replay?: number | string; restAction?: PetMotion; reduced?: boolean; motion: PetMotion; animations?: PetAnimations | undefined; onReady: (message: string) => void; onHover?: (hovered: boolean) => void; modelUrl?: string | undefined }) {
  const gltf: { scene: Group; animations: AnimationClip[] } = useGLTF(modelUrl ?? starterUrl, false, false);
  // Object transforms belong to this instance. The non-skinned bundled robot's
  // geometry/materials/textures still belong to useGLTF's shared URL cache.
  const root = useMemo(() => cloneSkinned(gltf.scene) as Group, [gltf.scene]);
  const envelope = useMemo(() => modelUrl ? new Box3().setFromObject(gltf.scene) : bundledAnimationBounds(gltf.scene, gltf.animations), [gltf.scene, gltf.animations, modelUrl]);
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
