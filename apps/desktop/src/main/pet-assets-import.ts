import * as fs from 'node:fs';
import { basename, join, normalize, resolve } from 'node:path';
import { validatePetManifest, type PetManifest } from '@agent-pet/pet-runtime';
import { PET_ASSET_ID, type PetAsset } from '../shared/pet-assets.js';
import { PetAssetsStore } from './pet-assets-store.js';
import { validatePetGlb } from './pet-glb.js';

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_MODEL_BYTES = 64 * 1024 * 1024;
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

export type PetImportPreview = {
  source: string;
  manifest: PetManifest;
  modelBytes: number;
  avatar: 'custom' | 'fallback';
  avatarFile: string | null;
};
export type PetImportFailure =
  | 'not-directory' | 'unsafe-directory' | 'missing-manifest' | 'invalid-manifest'
  | 'invalid-asset-id' | 'invalid-model' | 'missing-model' | 'model-too-large' | 'invalid-avatar';
export type PetImportInspection = { ok: true; preview: PetImportPreview } | { ok: false; reason: PetImportFailure };

// Only the latest preview owns bytes, bounding memory and preventing stale confirmation.
let pending: { preview: PetImportPreview; serialized: string; files: [string, Buffer][] } | undefined;

function readFile(path: string, maximum: number): Buffer | null {
  try {
    const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const before = fs.fstatSync(fd);
      if (!before.isFile() || before.nlink !== 1 || (before.mode & 0o111) !== 0 || before.size > maximum) return null;
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
        if (!count) return null;
        offset += count;
      }
      const after = fs.fstatSync(fd);
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || after.nlink !== 1) return null;
      return bytes;
    } finally { fs.closeSync(fd); }
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
  if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) return null;
  const path = resolve(root, name);
  return normalize(path) === normalize(join(root, name)) ? path : null;
}

function avatarKind(name: string, bytes: Buffer): boolean {
  const extension = name.toLowerCase().slice(name.lastIndexOf('.'));
  if (extension === '.png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === '.jpg' || extension === '.jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return extension === '.webp' && bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

export function inspectPetFolder(source: string): PetImportInspection {
  pending = undefined;
  const root = safeRoot(source);
  if (!root) return { ok: false, reason: 'not-directory' };
  const manifestBytes = readFile(join(root, 'pet.json'), MAX_MANIFEST_BYTES);
  if (!manifestBytes) return { ok: false, reason: 'missing-manifest' };
  let input: unknown;
  try { input = JSON.parse(manifestBytes.toString('utf8')); } catch { return { ok: false, reason: 'invalid-manifest' }; }
  const result = validatePetManifest(input);
  if (!result.valid) return { ok: false, reason: 'invalid-manifest' };
  if (!PET_ASSET_ID.test(result.manifest.id)) return { ok: false, reason: 'invalid-asset-id' };
  if (result.manifest.model !== 'pet.glb') return { ok: false, reason: 'invalid-model' };
  const modelBytes = readFile(join(root, 'pet.glb'), MAX_MODEL_BYTES);
  if (!modelBytes) return { ok: false, reason: 'missing-model' };
  if (!validatePetGlb(modelBytes)) return { ok: false, reason: 'invalid-model' };
  const files: [string, Buffer][] = [['pet.json', manifestBytes], ['pet.glb', modelBytes]];
  let avatarFile: string | null = null;
  if (result.manifest.avatar) {
    const path = child(root, result.manifest.avatar);
    const bytes = path && readFile(path, MAX_AVATAR_BYTES);
    if (bytes && avatarKind(result.manifest.avatar, bytes)) {
      avatarFile = basename(result.manifest.avatar);
      files.push([avatarFile, bytes]);
    }
  }
  const preview: PetImportPreview = { source: root, manifest: result.manifest, modelBytes: modelBytes.length,
    avatar: avatarFile ? 'custom' : 'fallback', avatarFile };
  pending = { preview, serialized: JSON.stringify(preview), files };
  return { ok: true, preview };
}

export function installPetFolder(preview: PetImportPreview, store: PetAssetsStore): PetAsset | null {
  const snapshot = pending;
  pending = undefined;
  try {
    if (!snapshot || snapshot.preview !== preview || snapshot.serialized !== JSON.stringify(preview)) return null;
    if (store.snapshot().records.some(record => record.id === preview.manifest.id)) return null;
    const directory = join(store.directory, preview.manifest.id);
    // Exclusive reservation protects existing empty directories too; failure never deletes them.
    fs.mkdirSync(directory, { mode: 0o700 });
    for (const [name, bytes] of snapshot.files) fs.writeFileSync(join(directory, name), bytes, { flag: 'wx', mode: 0o600 });
    const asset: PetAsset = { id: preview.manifest.id, manifest: structuredClone(preview.manifest), source: 'imported', importedAt: new Date().toISOString() };
    return store.saveImported(asset) ? asset : null;
  } catch {
    // Preserve partial/changed files until ownership-aware recovery exists; never recursively delete on failure.
    return null;
  }
}
