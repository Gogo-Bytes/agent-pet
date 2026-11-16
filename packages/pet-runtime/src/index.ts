import type { DisplayStatus } from '@agent-pet/domain';
import { petActionIds, supportsPetStages, type PetAction, type PetAnimations } from './actions.js';
export * from './actions.js';
export * from './presentation.js';

export type PetMotion = PetAction;

export type PetManifest = {
  id: string;
  version: string;
  model: string;
  /** Optional local avatar path; invalid or missing files use the application fallback. */
  avatar?: string;
  schemaVersion?: 2 | 3;
  actionCatalogVersion?: number;
  animations?: PetAnimations;
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
        | 'unsupported-schema-version'
        | 'invalid-action-catalog-version'
        | 'required-field-missing';
    };

export function validatePetManifest(
  input: unknown,
): PetManifestValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, reason: 'required-field-missing' };
  const source = input as Record<string, unknown>;
  if (
    ['id', 'version', 'model', 'license'].some(key => typeof source[key] !== 'string' || !(source[key] as string).trim())
  ) {
    return { valid: false, reason: 'required-field-missing' };
  }

  if (source.schemaVersion !== undefined && source.schemaVersion !== 2 && source.schemaVersion !== 3) return { valid: false, reason: 'unsupported-schema-version' };
  if (source.actionCatalogVersion !== undefined &&
    (typeof source.actionCatalogVersion !== 'number' || !Number.isSafeInteger(source.actionCatalogVersion) || source.actionCatalogVersion < 1)) {
    return { valid: false, reason: 'invalid-action-catalog-version' };
  }
  const model = source.model as string;
  if (!model.toLowerCase().endsWith('.glb') || /[:\\\\?#\u0000-\u001f]/u.test(model) || model.startsWith('/') || model.split('/').includes('..')) {
    return { valid: false, reason: 'model-must-be-local-glb' };
  }
  const avatar = source.avatar;
  if (avatar !== undefined && (typeof avatar !== 'string' || !avatar.trim() || /[:\\\\?#\u0000-\u001f]/u.test(avatar) || avatar.startsWith('/') || avatar.split('/').includes('..'))) {
    return { valid: false, reason: 'required-field-missing' };
  }

  // Optional animation and avatar mistakes use runtime fallback; they cannot reject the Pet.
  const mappings = source.animations;
  const animations: PetAnimations = {};
  if (mappings && typeof mappings === 'object' && !Array.isArray(mappings)) {
    for (const key of petActionIds) {
      if (!Object.hasOwn(mappings, key)) continue;
      const value = (mappings as Record<string, unknown>)[key];
      if (source.schemaVersion === 3 && supportsPetStages(key) && value && typeof value === 'object' && !Array.isArray(value)) {
        const stages = value as Record<string, unknown>;
        animations[key] = Object.keys(stages).every(stage => stage === 'in' || stage === 'loop' || stage === 'out')
          ? { loop: clipName(stages.loop), in: clipName(stages.in), out: clipName(stages.out) } : null;
      } else animations[key] = clipName(value);
    }
  }
  const manifest: PetManifest = { id: source.id as string, version: source.version as string, model,
    license: source.license as string, ...(typeof avatar === 'string' ? { avatar } : {}), ...(source.animations !== undefined ? { animations } : {}),
    ...(source.schemaVersion === 2 || source.schemaVersion === 3 ? { schemaVersion: source.schemaVersion } : {}),
    ...(typeof source.actionCatalogVersion === 'number' ? { actionCatalogVersion: source.actionCatalogVersion } : {}),
    ...(typeof source.author === 'string' ? { author: source.author } : {}),
    ...(typeof source.attribution === 'string' ? { attribution: source.attribution } : {}),
  };
  return { valid: true, manifest };
}

function clipName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && value.length <= 128 && !/[\u0000-\u001f]/u.test(value) ? value : null;
}

export function animationForStatus(
  status: DisplayStatus,
  animations: PetAnimations = {},
): string {
  const idle = typeof animations.idle === 'object' ? animations.idle?.loop : animations.idle;
  const working = typeof animations.working === 'object' ? animations.working?.loop : animations.working;
  switch (status) {
    case 'working':
      return working || idle || '';
    case 'error-unread':
      return animations.error || animations.attention || idle || '';
    case 'completed-unread':
      return animations.success || animations.attention || idle || '';
  }
}
