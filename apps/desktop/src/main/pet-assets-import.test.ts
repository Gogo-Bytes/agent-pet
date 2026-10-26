import * as fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { inspectPetFolder, installPetFolder } from './pet-assets-import.js';
import { PetAssetsStore } from './pet-assets-store.js';

function root() { return fs.realpathSync(mkdtempSync(join(tmpdir(), 'agent-pet-import-'))); }
function folder(withAvatar = true) {
  const directory = join(root(), 'artist-pet'); fs.mkdirSync(directory, { mode: 0o700 });
  fs.writeFileSync(join(directory, 'pet.json'), JSON.stringify({ id: 'artist-pet', version: '1.0.0', model: 'pet.glb', avatar: withAvatar ? 'portrait.webp' : 'missing.webp', license: 'CC0-1.0' }), { mode: 0o600 });
  fs.writeFileSync(join(directory, 'pet.glb'), fs.readFileSync('packages/pet-runtime/assets/starter.glb'), { mode: 0o600 });
  if (withAvatar) { const avatar = Buffer.alloc(12); avatar.write('RIFF', 0, 'ascii'); avatar.write('WEBP', 8, 'ascii'); fs.writeFileSync(join(directory, 'portrait.webp'), avatar, { mode: 0o600 }); }
  return directory;
}

describe('pet folder import', () => {
  it('inspects the fixed model and a manifest-declared custom avatar', () => {
    const result = inspectPetFolder(folder());
    expect(result).toMatchObject({ ok: true, preview: { avatar: 'custom', avatarFile: 'portrait.webp', modelBytes: fs.statSync('packages/pet-runtime/assets/starter.glb').size } });
  });

  it('falls back when the declared avatar is missing', () => {
    const result = inspectPetFolder(folder(false));
    expect(result).toMatchObject({ ok: true, preview: { avatar: 'fallback', avatarFile: null } });
  });

  it.each([
    ['missing model', (directory: string) => fs.rmSync(join(directory, 'pet.glb'))],
    ['invalid model', (directory: string) => fs.writeFileSync(join(directory, 'pet.glb'), 'not glb')],
    ['header-only model', (directory: string) => {
      const bytes = Buffer.alloc(12); bytes.write('glTF'); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(12, 8);
      fs.writeFileSync(join(directory, 'pet.glb'), bytes);
    }],
    ['unsafe manifest model', (directory: string) => fs.writeFileSync(join(directory, 'pet.json'), JSON.stringify({ id: 'artist-pet', version: '1', model: '../pet.glb', license: 'CC0' }))],
  ])('rejects %s', (_label, change) => {
    const directory = folder(); change(directory); expect(inspectPetFolder(directory)).toMatchObject({ ok: false });
  });

  it('preserves an existing unregistered destination on installation failure', () => {
    const data = root(); const store = new PetAssetsStore(data); const result = inspectPetFolder(folder());
    if (!result.ok) throw new Error('fixture did not inspect');
    const destination = join(store.directory, 'artist-pet'); fs.mkdirSync(destination);
    fs.writeFileSync(join(destination, 'user-data.txt'), 'keep me');
    expect(installPetFolder(result.preview, store)).toBeNull();
    expect(fs.readFileSync(join(destination, 'user-data.txt'), 'utf8')).toBe('keep me');
  });

  it('does not replace even an empty destination', () => {
    const data = root(); const store = new PetAssetsStore(data); const result = inspectPetFolder(folder());
    if (!result.ok) throw new Error('fixture did not inspect');
    const destination = join(store.directory, 'artist-pet'); fs.mkdirSync(destination);
    const before = fs.statSync(destination);
    expect(installPetFolder(result.preview, store)).toBeNull();
    expect(fs.statSync(destination).ino).toBe(before.ino);
    expect(fs.readdirSync(destination)).toEqual([]);
  });

  it('preserves files added during metadata-save failure and refuses to adopt the residue', () => {
    const data = root(); const store = new PetAssetsStore(data); const result = inspectPetFolder(folder());
    if (!result.ok) throw new Error('fixture did not inspect');
    const destination = join(store.directory, 'artist-pet');
    const save = vi.spyOn(store, 'saveImported').mockImplementation(() => {
      fs.writeFileSync(join(destination, 'user-data.txt'), 'keep me');
      return false;
    });
    try {
      expect(installPetFolder(result.preview, store)).toBeNull();
      expect(fs.readFileSync(join(destination, 'user-data.txt'), 'utf8')).toBe('keep me');
      expect(installPetFolder(result.preview, store)).toBeNull();
      expect(save).toHaveBeenCalledOnce();
      expect(store.snapshot().records.map(record => record.id)).toEqual(['starter']);
    } finally { save.mockRestore(); }
  });

  it('copies the validated folder and persists only application metadata', () => {
    const data = root(); const source = folder(); const store = new PetAssetsStore(data); const result = inspectPetFolder(source);
    if (!result.ok) throw new Error('fixture did not inspect');
    expect(installPetFolder(result.preview, store)?.id).toBe('artist-pet');
    expect(fs.existsSync(join(data, 'pet-assets', 'artist-pet', 'pet.glb'))).toBe(true);
    expect(fs.existsSync(join(data, 'pet-assets', 'artist-pet', 'portrait.webp'))).toBe(true);
    expect(new PetAssetsStore(data).snapshot().records.map(record => record.id)).toEqual(['starter', 'artist-pet']);
    expect(installPetFolder(result.preview, new PetAssetsStore(data))).toBeNull();
  });
});
