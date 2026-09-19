import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBundledPet } from './model.js';

function fixture(): ArrayBuffer {
  return Uint8Array.from(readFileSync(new URL('../assets/starter.glb', import.meta.url))).buffer;
}
const bindings = { idle: 'Idle', working: 'Work', success: 'Success', error: 'Error' };

describe('bundled GLB animation runtime', () => {
  it('loads real GLB geometry and advances embedded animation tracks', async () => {
    const pet = await parseBundledPet(fixture(), bindings);
    const root = pet.root.getObjectByName('Pet')!;
    expect(pet.root.getObjectByName('Head')).toBeDefined();
    pet.update(.1);
    pet.update(.1);
    expect(root.position.y).toBeGreaterThan(0);
    pet.setMotion('success');
    for (let i = 0; i < 4; i++) pet.update(.1);
    expect(root.position.y).toBeGreaterThan(.2);
    pet.dispose();
  });

  it('falls back to Idle when an optional clip is absent', async () => {
    const pet = await parseBundledPet(fixture(), { idle: 'Idle', working: 'Missing' });
    pet.setMotion('working');
    for (let i = 0; i < 4; i++) pet.update(.1);
    const root = pet.root.getObjectByName('Pet')!;
    expect(root.position.y).toBeGreaterThan(0);
    expect(root.position.y).toBeLessThan(.04);
    pet.dispose();
  });

  it('rejects a missing required idle clip', async () => {
    await expect(parseBundledPet(fixture(), { idle: 'Missing' })).rejects.toThrow('Required idle');
  });

  it('disposes safely twice and stops updates', async () => {
    const pet = await parseBundledPet(fixture(), bindings);
    pet.dispose();
    const before = pet.root.getObjectByName('Pet')!.position.clone();
    pet.dispose();
    pet.setMotion('success');
    pet.update(.1);
    expect(pet.root.getObjectByName('Pet')!.position).toEqual(before);
  });
});
