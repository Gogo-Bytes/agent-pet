import { AnimationMixer, type AnimationAction, type Group, type Material, type Mesh, type Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type PetMotion = 'idle' | 'working' | 'success' | 'error';
export type AnimationBindings = { idle: string } & Partial<Record<Exclude<PetMotion, 'idle'>, string>>;

export type LoadedPet = {
  root: Group;
  setMotion(motion: PetMotion): void;
  update(deltaSeconds: number): void;
  dispose(): void;
};

// Bundled, trusted GLB bytes only. This is not the custom-asset import boundary.
export async function parseBundledPet(bytes: ArrayBuffer, bindings: AnimationBindings): Promise<LoadedPet> {
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  const mixer = new AnimationMixer(gltf.scene);
  const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
  let current: AnimationAction | undefined;
  let disposed = false;

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    mixer.stopAllAction();
    mixer.uncacheRoot(gltf.scene);
    const geometries = new Set<Mesh['geometry']>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    gltf.scene.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value && typeof value === 'object' && 'isTexture' in value && value.isTexture) textures.add(value as Texture);
        }
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    gltf.scene.removeFromParent();
  }

  const idle = clips.get(bindings.idle);
  if (!idle) {
    dispose();
    throw new Error(`Required idle clip is missing: ${bindings.idle}`);
  }

  function setMotion(motion: PetMotion): void {
    if (disposed) return;
    const clip = clips.get(bindings[motion] ?? bindings.idle) ?? idle!;
    const next = mixer.clipAction(clip);
    if (next === current) return;
    current?.fadeOut(.15);
    next.reset().fadeIn(.15).play();
    current = next;
  }
  setMotion('idle');
  return {
    root: gltf.scene,
    setMotion,
    update(deltaSeconds) {
      if (!disposed && Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
        mixer.update(Math.min(deltaSeconds, .1));
      }
    },
    dispose,
  };
}
