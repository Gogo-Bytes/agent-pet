import { validatePetManifest, type PetManifest } from '@agent-pet/pet-runtime';

export const PET_ASSET_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
export type PetAssetSource = 'bundled' | 'imported';

/** Metadata kept by the application; file locations remain Main-process details. */
export interface PetAsset {
  id: string;
  manifest: PetManifest;
  source: PetAssetSource;
  importedAt: string | null;
}

export interface PetAssetsState {
  version: 1;
  records: PetAsset[];
}

export const starterPetAsset: PetAsset = {
  id: 'starter',
  source: 'bundled',
  importedAt: null,
  manifest: {
    schemaVersion: 2,
    actionCatalogVersion: 1,
    id: 'starter',
    version: '1.0.0',
    model: 'starter.glb',
    license: 'CC0-1.0',
    author: 'Agent Pet contributors',
  },
};

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function validPetAsset(value: unknown): value is PetAsset {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'id,importedAt,manifest,source' ||
      typeof value.id !== 'string' || !PET_ASSET_ID.test(value.id) ||
      !['bundled', 'imported'].includes(String(value.source)) ||
      (value.importedAt !== null && typeof value.importedAt !== 'string')) return false;
  const result = validatePetManifest(value.manifest);
  return result.valid && result.manifest.id === value.id &&
    (value.source === 'bundled' ? value.importedAt === null : typeof value.importedAt === 'string');
}

export function validPetAssetsState(value: unknown): value is PetAssetsState {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'records,version' || value.version !== 1 ||
      !Array.isArray(value.records) || value.records.length > 64 || !value.records.every(validPetAsset)) return false;
  const ids = value.records.map(record => record.id);
  return new Set(ids).size === ids.length && !ids.includes('starter');
}
