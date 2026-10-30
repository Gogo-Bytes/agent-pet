import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { availablePetActions, createPetArtistTemplate, petActionCatalog, petActionIds, resolvePetAnimation, validatePetManifest } from './index.js';

describe('shared optional action vocabulary', () => {
  it('describes triggers rather than prescribing clip names or gestures, including the public catalog', () => {
    expect(petActionCatalog.success.label).toBe('任务完成');
    expect(petActionCatalog.error.label).toBe('发生错误');
    expect(petActionCatalog.waiting_input.label).toBe('等待输入');
    expect(petActionCatalog.connected.label).toBe('Agent 已连接');
    expect(JSON.parse(readFileSync('packages/pet-runtime/templates/action-catalog.json', 'utf8')).actions).toEqual(petActionCatalog);
    expect(resolvePetAnimation('success', { success: 'ArtistDance' }, ['ArtistDance'])?.clip).toBe('ArtistDance');
  });
  it('removes the unused sleeping trigger while accepting older pet packages', () => {
    expect(petActionIds).not.toContain('sleeping');
    expect(createPetArtistTemplate().animations).not.toHaveProperty('sleeping');
    expect(resolvePetAnimation('sleeping', { idle: 'Idle' }, ['Idle'])).toBeNull();
    expect(validatePetManifest({ id: 'old-pet', version: '1', model: 'pet.glb', license: 'CC0',
      animations: { sleeping: 'Sleep', idle: 'Idle' } })).toMatchObject({ valid: true, manifest: { animations: { idle: 'Idle' } } });
    const result = validatePetManifest({ id: 'old-pet', version: '1', model: 'pet.glb', license: 'CC0', animations: { sleeping: 'Sleep' } });
    expect(result.valid && result.manifest.animations).toEqual({});
  });
  it('exports a complete versioned artist template with no required animation', () => {
    const template = createPetArtistTemplate();
    expect(Object.keys(template.animations)).toEqual(petActionIds);
    expect(Object.values(template.animations).every(value => value === null)).toBe(true);
    expect(validatePetManifest({ ...template, license: 'CC0-1.0' }).valid).toBe(true);
    template.animations.idle = 'ArtistIdle';
    expect(createPetArtistTemplate().animations.idle).toBeNull();
  });
  it('resolves actual clip availability, coarse fallbacks and a final static pose', () => {
    const mappings = { reading: 'Missing', working: 'ArtistWork', idle: null };
    expect(resolvePetAnimation('reading', mappings, ['ArtistWork'])).toMatchObject({ action: 'working', clip: 'ArtistWork' });
    expect(resolvePetAnimation('reading', mappings, [])).toBeNull();
    expect(resolvePetAnimation('error', mappings, ['ArtistWork'])).toBeNull();
    expect(resolvePetAnimation('Idle', {}, [])).toBeNull();
    expect(availablePetActions(mappings, ['ArtistWork'])).toEqual(['working']);
    expect(availablePetActions({ idle: ' ' }, [' '])).toEqual([]);
  });
  it.each(['__proto__', 'constructor', 'toString', 'future-action'])('ignores unknown request %s without throwing', request => {
    expect(resolvePetAnimation(request, { idle: 'Idle' }, ['Idle'])).toBeNull();
  });
  it('keeps every fallback finite, valid and semantically separate from success/error', () => {
    for (const id of petActionIds) {
      const fallback = petActionCatalog[id].fallback;
      expect(new Set(fallback).size).toBe(fallback.length);
      for (const value of fallback) { expect(petActionIds).toContain(value); expect(value).not.toBe(id); }
      expect(fallback).not.toContain('success'); expect(fallback).not.toContain('error');
    }
  });
  it('accepts old and future-catalog assets, sanitizes bad optional slots, and rejects incompatible document schemas', () => {
    const base = { id: 'artist', version: '1', model: 'pet.glb', license: 'CC0' };
    expect(validatePetManifest(base)).toMatchObject({ valid: true });
    expect(validatePetManifest({ ...base, schemaVersion: 2, actionCatalogVersion: 99,
      animations: { working: 'ArtistWork', error: 3, idle: '', futureAction: 'New' } })).toMatchObject({
        valid: true, manifest: { animations: { working: 'ArtistWork', error: null, idle: null } },
      });
    expect(validatePetManifest({ ...base, schemaVersion: 99 }).valid).toBe(false);
    expect(validatePetManifest({ ...base, actionCatalogVersion: -1 }).valid).toBe(false);
    for (const animations of [null, [], 17]) expect(validatePetManifest({ ...base, animations })).toMatchObject({ valid: true, manifest: { animations: {} } });
    for (const value of [null, {}, { ...base, id: 3 }, { ...base, model: '../pet.glb' }]) expect(validatePetManifest(value).valid).toBe(false);
  });
});
