import { useEffect, useMemo } from 'react';
import { Box3, type AnimationClip, type Group } from 'three';
import { useThree } from '@react-three/fiber';
import { useBounds, useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { bundledAnimations, type PetMotion, type PetAnimations } from '@agent-pet/pet-runtime';
import { usePetAnimation } from '../../shared/usePetAnimation.js';
import { usePetInteraction } from '../../shared/usePetInteraction.js';
import type { DragDirection } from '../../shared/use-window-gesture.js';
import starterUrl from '@agent-pet/pet-runtime/assets/starter.glb?url';
import { bundledAnimationBounds } from './bundled-animation-bounds.js';

const noAnimations: PetAnimations = {};
const dragTilt = Math.PI / 18;

export function PetModel({ connectionCue, interactionActive = true, dragDirection = null, motion, reduced = false, onReady, onHover, animations, replay = 0, restAction = 'idle', modelUrl }:  { connectionCue?: string | undefined; interactionActive?: boolean; dragDirection?: DragDirection | null; replay?: number | string; restAction?: PetMotion; reduced?: boolean; motion: PetMotion; animations?: PetAnimations | undefined; onReady: (message: string) => void; onHover?: (hovered: boolean) => void; modelUrl?: string | undefined }) {
  const gltf: { scene: Group; animations: AnimationClip[] } = useGLTF(modelUrl ?? starterUrl, false, false);
  // Object transforms belong to this instance. The non-skinned bundled robot's
  // geometry/materials/textures still belong to useGLTF's shared URL cache.
  const root = useMemo(() => cloneSkinned(gltf.scene) as Group, [gltf.scene]);
  const envelope = useMemo(() => modelUrl ? new Box3().setFromObject(gltf.scene) : bundledAnimationBounds(gltf.scene, gltf.animations), [gltf.scene, gltf.animations, modelUrl]);
  const interaction = usePetInteraction(interactionActive && !dragDirection && !reduced);
  // Keep incoming business cues unconsumed and the drag clip stable until release.
  usePetAnimation(root, gltf.animations, animations ?? (modelUrl ? noAnimations : bundledAnimations), dragDirection ? 'dragging' : motion, reduced, dragDirection ? 0 : replay, restAction, interaction.feedback, interaction.finish, connectionCue);
  const pitch = reduced ? 0 : dragDirection === 'up' ? -dragTilt : dragDirection === 'down' ? dragTilt : 0;
  const yaw = reduced ? 0 : dragDirection === 'left' ? -dragTilt : dragDirection === 'right' ? dragTilt : 0;
  const bounds = useBounds();
  const size = useThree(state => state.size);
  useEffect(() => {
    bounds.refresh(envelope).clip().fit();
  }, [bounds, envelope, size.width, size.height]);
  useEffect(() => {
    onReady('');
  }, [onReady]);
  useEffect(() => () => onHover?.(false), [onHover]);
  return <group name="pet-pointer-target" rotation={[pitch, yaw, 0]} onPointerOver={event => { event.stopPropagation(); interaction.hover(true); onHover?.(true); }} onPointerOut={event => {
    if (event.intersections.some(hit => hit.eventObject === event.eventObject)) return;
    interaction.hover(false); onHover?.(false);
  }}>
    <primitive object={root} dispose={null} />
  </group>;
}
