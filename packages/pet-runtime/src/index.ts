import { Group, Scene } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { DisplayStatus } from '@agent-pet/domain';

export type PetAnimations = {
  idle?: string;
  working?: string;
  success?: string;
  error?: string;
  attention?: string;
};

export type PetManifest = {
  id: string;
  version: string;
  model: string;
  animations: PetAnimations;
  license: string;
  author?: string;
  attribution?: string;
};

export type PetManifestValidation =
  | { valid: true; manifest: PetManifest }
  | {
      valid: false;
      reason:
        | 'model-must-be-local-glb'
        | 'idle-animation-required'
        | 'required-field-missing';
    };

export function validatePetManifest(
  manifest: PetManifest,
): PetManifestValidation {
  if (
    !manifest.id.trim() ||
    !manifest.version.trim() ||
    !manifest.license.trim() ||
    !manifest.animations
  ) {
    return { valid: false, reason: 'required-field-missing' };
  }

  if (!manifest.model.toLowerCase().endsWith('.glb') || manifest.model.includes('://')) {
    return { valid: false, reason: 'model-must-be-local-glb' };
  }

  if (
    typeof manifest.animations.idle !== 'string' ||
    !manifest.animations.idle.trim()
  ) {
    return { valid: false, reason: 'idle-animation-required' };
  }

  return { valid: true, manifest };
}

export function animationForStatus(
  status: DisplayStatus,
  animations: PetAnimations,
): string {
  switch (status) {
    case 'working':
      return animations.working || animations.idle || '';
    case 'error-unread':
      return animations.error || animations.attention || animations.idle || '';
    case 'completed-unread':
      return animations.success || animations.attention || animations.idle || '';
  }
}

export function createPetScene(): { scene: Scene; petRoot: Group } {
  const scene = new Scene();
  const petRoot = new Group();
  scene.add(petRoot);
  return { scene, petRoot };
}

export async function loadPetModel(modelUrl: string): Promise<Group> {
  if (!modelUrl.toLowerCase().endsWith('.glb') || modelUrl.includes('://')) {
    throw new Error('Only local GLB models are supported');
  }

  const gltf = await new GLTFLoader().loadAsync(modelUrl);
  return gltf.scene;
}
