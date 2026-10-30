import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { availablePetActions, bundledAnimations, normalizePetAction, petActionIds, petActionCatalog, type PetAnimations } from '@agent-pet/pet-runtime';
import { usePetAnimation } from '../shared/usePetAnimation.js';
import { usePetInteraction } from '../shared/usePetInteraction.js';
import { Box3, Vector3, type AnimationClip, type Group } from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import starterUrl from '@agent-pet/pet-runtime/assets/starter.glb?url';
import { bundledAnimationBounds } from '../features/pet/bundled-animation-bounds.js';

export const petActions = petActionIds.map(id => ({ id, label: petActionCatalog[id].label }));

const noAnimations: PetAnimations = {};

export function ScenePet({ connectionCue, action, replay = 0, reduced, onReady, animations, restAction = 'idle', modelUrl, interactive = false, selection = 0 }:  {
  connectionCue?: string | undefined; interactive?: boolean; selection?: number; action: string; replay?: number | string; restAction?: string; reduced: boolean; onReady: (clips: string[]) => void; animations?: PetAnimations | undefined; modelUrl?: string | undefined;
}) {
  const gltf: { scene: Group; animations: AnimationClip[] } = useGLTF(modelUrl ?? starterUrl, false, false);
  const root = useMemo(() => cloneSkinned(gltf.scene) as Group, [gltf.scene]);
  const envelope = useMemo(() => modelUrl ? new Box3().setFromObject(gltf.scene) : bundledAnimationBounds(gltf.scene, gltf.animations), [gltf, modelUrl]);
  const transform = useMemo(() => {
    const bounds = new Box3().copy(envelope);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const extent = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(extent) || extent <= 0 || !Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z) || !Number.isFinite(bounds.min.y)) {
      return { scale: 1, position: [0, 0, 0] as [number, number, number] };
    }
    const scale = 2.1 / extent;
    return { scale, position: [-center.x * scale, -bounds.min.y * scale, -center.z * scale] as [number, number, number] };
  }, [envelope]);
  const interaction = usePetInteraction(interactive && !reduced, selection);
  usePetAnimation(root, gltf.animations, animations ?? (modelUrl ? noAnimations : bundledAnimations), normalizePetAction(action) ?? action, reduced, replay, restAction, interaction.feedback, interaction.finish, connectionCue);
  useEffect(() => { onReady(availablePetActions(animations ?? (modelUrl ? {} : bundledAnimations), gltf.animations.map(clip => clip.name))); }, [gltf.animations, animations, modelUrl, onReady]);
  // Cached geometry/materials belong to useGLTF; instances own transforms/mixers only.
  return <group name="scene-pet-pointer-target" scale={transform.scale} position={transform.position}
    onPointerOver={event => { event.stopPropagation(); interaction.hover(true); }} onPointerOut={event => {
      if (!event.intersections.some(hit => hit.eventObject === event.eventObject)) interaction.hover(false);
    }}><primitive object={root} dispose={null} /></group>;
}
