import * as fs from 'node:fs';
import { basename, join, normalize, resolve } from 'node:path';
import { validatePetManifest, type PetManifest } from '@agent-pet/pet-runtime';
import { PET_ASSET_ID, type PetAsset } from '../shared/pet-assets.js';
import { PetAssetsStore } from './pet-assets-store.js';
import { validatePetGlb } from './pet-glb.js';

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_MODEL_BYTES = 64 * 1024 * 1024;
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

type FileKind = 'manifest' | 'model' | 'avatar';
export type PetImportPreview = {
  source: string;
  manifest: PetManifest;
  modelBytes: number;
  avatar: 'custom' | 'fallback';
  avatarFile: string | null;
};

export type PetImportFailure =
  | 'not-directory'
  | 'unsafe-directory'
  | 'missing-manifest'
  | 'invalid-manifest'
  | 'invalid-asset-id'
  | 'invalid-model'
  | 'missing-model'
  | 'model-too-large'
  | 'invalid-avatar';

export type PetImportInspection = { ok: true; preview: PetImportPreview } | { ok: false; reason: PetImportFailure };

function regularFile(path: string, kind: FileKind): fs.Stats | null {
  try {
    const stat = fs.lstatSync(path);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o111) !== 0) return null;
    if (kind === 'manifest' && stat.size > MAX_MANIFEST_BYTES) return null;
    if (kind === 'model' && stat.size > MAX_MODEL_BYTES) return null;
    if (kind === 'avatar' && stat.size > MAX_AVATAR_BYTES) return null;
    return stat;
  } catch { return null; }
}

function safeRoot(path: string): string | null {
  try {
    const stat = fs.lstatSync(path);
    if (!stat.isDirectory() || stat.uid !== process.getuid?.() && stat.uid !== 0 || (stat.mode & 0o022) !== 0) return null;
    const real = fs.realpathSync(path);
    return normalize(real) === normalize(path) ? real : null;
  } catch { return null; }
}

function child(root: string, name: string): string | null {
  if (!name || name.includes('\0') || name.startsWith('/') || name.split('/').length !== 1) return null;
  const path = resolve(root, name);
  return normalize(path) === normalize(join(root, name)) ? path : null;
}

function isGlb(path: string): boolean {
  try {
    const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const before = fs.fstatSync(fd);
      if (!before.isFile() || before.nlink !== 1 || (before.mode & 0o111) !== 0 || before.size > MAX_MODEL_BYTES) return false;
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
        if (!count) return false;
        offset += count;
      }
      const after = fs.fstatSync(fd);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) return false;
      return validatePetGlb(bytes);
    } finally { fs.closeSync(fd); }
  } catch { return false; }
}

function avatarKind(path: string): boolean {
  const extension = basename(path).toLowerCase().slice(basename(path).lastIndexOf('.'));
  if (!IMAGE_EXTENSIONS.has(extension)) return false;
  try {
    const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const header = Buffer.alloc(12);
      const count = fs.readSync(fd, header, 0, header.length, 0);
      if (extension === '.png') return count >= 8 && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (extension === '.jpg' || extension === '.jpeg') return count >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
      return count >= 12 && header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP';
    } finally { fs.closeSync(fd); }
  } catch { return false; }
}

export function inspectPetFolder(source: string): PetImportInspection {
  const root = safeRoot(source);
  if (!root) return { ok: false, reason: 'not-directory' };
  const manifestPath = child(root, 'pet.json');
  const manifestStat = manifestPath && regularFile(manifestPath, 'manifest');
  if (!manifestPath || !manifestStat) return { ok: false, reason: 'missing-manifest' };
  let input: unknown;
  try { input = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return { ok: false, reason: 'invalid-manifest' }; }
  const result = validatePetManifest(input);
  if (!result.valid) return { ok: false, reason: 'invalid-manifest' };
  if (!PET_ASSET_ID.test(result.manifest.id)) return { ok: false, reason: 'invalid-asset-id' };
  if (result.manifest.model !== 'pet.glb') return { ok: false, reason: 'invalid-model' };
  const modelPath = child(root, result.manifest.model);
  const modelStat = modelPath && regularFile(modelPath, 'model');
  if (!modelPath || !modelStat) return { ok: false, reason: 'missing-model' };
  if (!isGlb(modelPath)) return { ok: false, reason: 'invalid-model' };
  let avatar: PetImportPreview['avatar'] = 'fallback';
  let avatarFile: string | null = null;
  if (result.manifest.avatar) {
    const path = child(root, result.manifest.avatar);
    const stat = path && regularFile(path, 'avatar');
    if (path && stat && avatarKind(path)) { avatar = 'custom'; avatarFile = basename(path); }
  }
  return { ok: true, preview: { source: root, manifest: result.manifest, modelBytes: modelStat.size, avatar, avatarFile } };
}

export function installPetFolder(preview: PetImportPreview, store: PetAssetsStore): PetAsset | null {
  if (!PET_ASSET_ID.test(preview.manifest.id)) return null;
  const directory = join(store.directory, preview.manifest.id);
  try {
    if (store.snapshot().records.some(record => record.id === preview.manifest.id)) return null;
    // Exclusive reservation also protects existing empty directories; rename would replace them.
    fs.mkdirSync(directory, { mode: 0o700 });
    fs.copyFileSync(join(preview.source, 'pet.json'), join(directory, 'pet.json'), fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(join(preview.source, preview.manifest.model), join(directory, 'pet.glb'), fs.constants.COPYFILE_EXCL);
    if (preview.avatar === 'custom' && preview.avatarFile) fs.copyFileSync(join(preview.source, preview.avatarFile), join(directory, preview.avatarFile), fs.constants.COPYFILE_EXCL);
    const asset: PetAsset = { id: preview.manifest.id, manifest: preview.manifest, source: 'imported', importedAt: new Date().toISOString() };
    if (!store.saveImported(asset)) return null;
    return asset;
  } catch {
    // Preserve partial/changed files until ownership-aware recovery exists; never recursively delete on failure.
    return null;
  }
}
