import type { DisplayStatus } from '@agent-pet/domain';

export type PetMotion = 'idle' | 'working' | 'success' | 'error';

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
