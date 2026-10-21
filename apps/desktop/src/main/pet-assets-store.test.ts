import * as fs from 'node:fs';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { PetAssetsStore } from './pet-assets-store.js';
import type { PetAsset } from '../shared/pet-assets.js';

function root() { return fs.realpathSync(mkdtempSync(join(tmpdir(), 'agent-pet-assets-'))); }
function imported(id = 'fox') : PetAsset {
  return { id, source: 'imported', importedAt: '2026-10-20T00:00:00.000Z', manifest: {
    schemaVersion: 2, actionCatalogVersion: 1, id, version: '1.0.0', model: 'pet.glb', license: 'CC0-1.0',
  } };
}

describe('PetAssetsStore', () => {
  it('always exposes the bundled starter without persisting it', () => {
    const directory = root();
    const store = new PetAssetsStore(directory);
    expect(store.error).toBe(false);
    expect(store.snapshot().records.map(record => record.id)).toEqual(['starter']);
    expect(fs.existsSync(join(directory, 'pet-assets', 'registry.json'))).toBe(false);
  });

  it('atomically persists imported metadata and restores it', () => {
    const directory = root();
    const store = new PetAssetsStore(directory);
    expect(store.saveImported(imported())).toBe(true);
    expect(store.snapshot().records.map(record => record.id)).toEqual(['starter', 'fox']);
    const restored = new PetAssetsStore(directory);
    expect(restored.error).toBe(false);
    expect(restored.snapshot().records[1]).toEqual(imported());
    expect(readFileSync(join(directory, 'pet-assets', 'registry.json'), 'utf8')).toContain('"fox"');
    expect(fs.statSync(join(directory, 'pet-assets')).mode & 0o777).toBe(0o700);
    expect(fs.statSync(join(directory, 'pet-assets', 'registry.json')).mode & 0o777).toBe(0o600);
  });

  it('removes imported assets atomically', () => {
    const directory = root();
    const store = new PetAssetsStore(directory);
    expect(store.saveImported(imported())).toBe(true);
    const assetDirectory = join(directory, 'pet-assets', 'fox');
    fs.mkdirSync(assetDirectory, { mode: 0o700 });
    fs.writeFileSync(join(assetDirectory, 'pet.glb'), 'glb', { mode: 0o600 });
    expect(store.removeImported('fox')).toBe(true);
    expect(store.snapshot().records.map(record => record.id)).toEqual(['starter']);
    expect(fs.existsSync(assetDirectory)).toBe(false);
  });

  it('rejects duplicate and starter imports', () => {
    const directory = root();
    const store = new PetAssetsStore(directory);
    expect(store.saveImported(imported())).toBe(true);
    expect(store.saveImported(imported())).toBe(false);
    expect(store.saveImported({ ...imported('starter'), id: 'starter' })).toBe(false);
  });

  it('fails closed on an invalid registry and preserves its bytes', () => {
    const directory = root();
    const assets = join(directory, 'pet-assets');
    fs.mkdirSync(assets, { mode: 0o700 });
    const path = join(assets, 'registry.json');
    fs.writeFileSync(path, '{"version":1,"records":[{"bad":true}]}', { mode: 0o600 });
    const before = readFileSync(path);
    const store = new PetAssetsStore(directory);
    expect(store.error).toBe(true);
    expect(store.snapshot().records.map(record => record.id)).toEqual(['starter']);
    expect(readFileSync(path)).toEqual(before);
  });

  it('does not persist unsupported manifest model paths', () => {
    const directory = root();
    const store = new PetAssetsStore(directory);
    expect(store.saveImported({ ...imported(), manifest: { ...imported().manifest, model: '../pet.glb' } })).toBe(false);
    expect(store.snapshot().records).toHaveLength(1);
  });
});
