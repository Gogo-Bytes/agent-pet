import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validatePetGlb } from './pet-glb.js';

function glb(document: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const bytes = Buffer.alloc(20 + padded.length);
  bytes.write('glTF'); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); padded.copy(bytes, 20);
  return bytes;
}

it('accepts the bundled starter and a self-contained minimal document', () => {
  expect(validatePetGlb(readFileSync('packages/pet-runtime/assets/starter.glb'))).toBe(true);
  expect(validatePetGlb(glb({ asset: { version: '2.0' } }))).toBe(true);
});
it('rejects header-only, truncated, trailing, and incorrectly sized containers', () => {
  const bytes = glb({ asset: { version: '2.0' } });
  for (const invalid of [bytes.subarray(0, 12), bytes.subarray(0, -1), Buffer.concat([bytes, Buffer.alloc(4)])]) {
    expect(validatePetGlb(invalid)).toBe(false);
  }
  const badChunk = Buffer.from(bytes); badChunk.writeUInt32LE(0xffffffff, 12);
  expect(validatePetGlb(badChunk)).toBe(false);
});
it.each([
  { asset: { version: '1.0' } },
  { asset: { version: '2.0' }, buffers: [{ byteLength: 10, uri: 'https://example.invalid/model.bin' }] },
  { asset: { version: '2.0' }, images: [{ uri: 'data:image/png;base64,AAAA' }] },
  { asset: { version: '2.0' }, extensionsUsed: ['KHR_draco_mesh_compression'] },
  { asset: { version: '2.0' }, nodes: Array.from({ length: 513 }, () => ({})) },
  { asset: { version: '2.0' }, accessors: [{ count: 1000001 }] },
  { asset: { version: '2.0' }, bufferViews: [{ buffer: 0, byteLength: 4 }] },
])('rejects external resources, unsupported extensions and over-budget metadata: %j', document => {
  expect(validatePetGlb(glb(document))).toBe(false);
});
