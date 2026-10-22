import { Suspense, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3 } from 'three';
import { ScenePet } from './ScenePet.js';
import type { PetAnimations } from '@agent-pet/pet-runtime';

export type HomePet = { id: string; assetId?: string; agent: string; name: string; configuration: string; status: string; action: string; replay?: number | string; restAction?: string };
export type Point = [number, number, number];
export function petPosition(index: number, count: number): Point {
  const columns = Math.min(count, 3) || 1;
  const row = Math.floor(index / columns);
  const rowCount = Math.min(columns, count - row * columns);
  return [(index % columns - (rowCount - 1) / 2) * 2.7, 0, (row - (Math.ceil(count / columns) - 1) / 2) * 2.6];
}

function SceneCamera({ target, count, reduced, mode }: {
  target: Point | null; count: number; reduced: boolean; mode: 'home' | 'pet';
}) {
  const { camera, size } = useThree();
  const look = useRef(new Vector3(0, 1.05, 0));
  const goal = useRef(new Vector3());
  const destination = useRef(new Vector3());
  useFrame((_, delta) => {
    const aspect = Math.max(.1, size.width / Math.max(1, size.height));
    const narrow = size.width < 650;
    const rows = Math.max(1, Math.ceil(count / 3));
    const halfWidth = (Math.min(count, 3) - 1) * 2.7 / 2 + 1.1;
    const distance = Math.max(8, halfWidth / (Math.tan(19 * Math.PI / 180) * aspect)) + (rows - 1) * 2.2;
    destination.current.set(target ? target[0] : 0, target ? 2.4 : 4.5 + rows - 1,
      target ? target[2] + (narrow ? 6.6 : 5.1) : distance);
    goal.current.set(target ? target[0] - (narrow ? 0 : 1) : 0, target ? (narrow ? .55 : 1) : .8, target ? target[2] : 0);
    if (mode === 'pet') {
      // ScenePet's normalized animation envelope is 2.1 high. Aim at its center,
      // without the home's identity-panel offset; portrait windows still fit its width.
      destination.current.set(0, 2.4, Math.max(narrow && size.height < 400 ? 12.5 : 5.6, 1.5 / (Math.tan(19 * Math.PI / 180) * aspect)));
      goal.current.set(0, 1.05, 0);
    }
    const rate = reduced ? 1 : 1 - Math.exp(-MathUtils.clamp(delta, 0, .1) * 5);
    camera.position.lerp(destination.current, rate); look.current.lerp(goal.current, rate); camera.lookAt(look.current);
  });
  return null;
}

/** Home has configuration instances, a floor and selection. The Canvas owns their lifetime. */
export function HomeScene({ pets, focused, reduced, onFocus, onReady, modelUrls, animations }: {
  pets: HomePet[]; focused: string | null; reduced: boolean; onFocus: (id: string) => void; onReady: (clips: string[]) => void; modelUrls?: Record<string, string> | undefined; animations?: Record<string, PetAnimations> | undefined;
}) {
  const index = pets.findIndex(pet => pet.id === focused);
  return <group name="home-scene">
    <SceneCamera mode="home" count={pets.length} target={index >= 0 ? petPosition(index, pets.length) : null} reduced={reduced} />
    <mesh name="home-floor" rotation={[-Math.PI / 2, 0, 0]} position={[0, -.07, 0]}>
      <circleGeometry args={[Math.max(5.4, Math.ceil(pets.length / 3) * 1.8), 80]} /><meshStandardMaterial color="#ede7fc" roughness={1} />
    </mesh>
    <Suspense fallback={null}>{pets.map((pet, index) =>
      <group key={pet.id} name={pet.id} position={petPosition(index, pets.length)} onClick={event => { event.stopPropagation(); onFocus(pet.id); }}>
        <ScenePet key={pet.assetId ?? 'starter'} action={pet.action} replay={pet.replay ?? 0} restAction={pet.restAction ?? 'idle'} reduced={reduced} onReady={onReady} modelUrl={modelUrls?.[pet.assetId ?? 'starter']} animations={animations?.[pet.assetId ?? 'starter']} />
      </group>)}</Suspense>
  </group>;
}

/** A separate audition scene: only the selected asset, centered, with no home scenery. */
export function PetPreviewScene({ action, replay, reduced, onReady, modelUrl, animations }: {
  action: string; replay: number; reduced: boolean; onReady: (clips: string[]) => void; modelUrl?: string | undefined; animations?: Record<string, string | null> | undefined;
}) {
  return <group name="pet-preview-scene">
    <SceneCamera mode="pet" count={1} target={null} reduced={reduced} />
    <Suspense fallback={null}><ScenePet key={modelUrl ?? 'starter'} action={action} replay={replay} reduced={reduced} onReady={onReady} modelUrl={modelUrl} animations={animations} /></Suspense>
  </group>;
}
