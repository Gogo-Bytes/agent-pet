import { useEffect, useMemo } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { Box3, Vector3, type AnimationClip, type Group } from 'three';
import starterUrl from '@agent-pet/pet-runtime/assets/starter.glb?url';
import { bundledAnimationBounds } from '../features/pet/bundled-animation-bounds.js';

export const petActions = [
  { id: 'Idle', label: '待机' }, { id: 'Work', label: '工作' },
  { id: 'Success', label: '庆祝' }, { id: 'Error', label: '出错' },
] as const;

export function ScenePet({ action, replay = 0, reduced, onReady }: {
  action: string; replay?: number; reduced: boolean; onReady: (clips: string[]) => void;
}) {
  const gltf: { scene: Group; animations: AnimationClip[] } = useGLTF(starterUrl, false, false);
  if (!gltf.animations.some(clip => clip.name === 'Idle')) throw new Error('Required Idle clip missing');
  const root = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const envelope = useMemo(() => bundledAnimationBounds(gltf.scene, gltf.animations), [gltf]);
  const transform = useMemo(() => {
    const bounds = new Box3().copy(envelope);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const scale = 2.1 / Math.max(size.x, size.y, size.z);
    return { scale, position: [-center.x * scale, -bounds.min.y * scale, -center.z * scale] as [number, number, number] };
  }, [envelope]);
  const instance = useMemo(() => ({ current: root }), [root]);
  const { actions } = useAnimations(gltf.animations, instance);
  useEffect(() => {
    const current = actions[action] ?? actions.Idle!;
    current.reset().play(); current.paused = reduced;
    return () => { current.stop(); };
  }, [actions, action, replay, reduced]);
  useEffect(() => { onReady(gltf.animations.map(clip => clip.name)); }, [gltf.animations, onReady]);
  // Cached geometry/materials belong to useGLTF; instances own transforms/mixers only.
  return <group scale={transform.scale} position={transform.position}><primitive object={root} dispose={null} /></group>;
}
