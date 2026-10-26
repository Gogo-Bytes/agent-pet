import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validatePetGlb } from './pet-glb.js';

function glb(document: unknown, binaryBytes = 0): Buffer {
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const bytes = Buffer.alloc(20 + padded.length + (binaryBytes ? 8 + Math.ceil(binaryBytes / 4) * 4 : 0));
  bytes.write('glTF'); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); padded.copy(bytes, 20);
  if (binaryBytes) {
    bytes.writeUInt32LE(Math.ceil(binaryBytes / 4) * 4, 20 + padded.length);
    bytes.writeUInt32LE(0x004e4942, 24 + padded.length);
  }
  return bytes;
}

it('accepts the bundled starter and a self-contained minimal document', () => {
  expect(validatePetGlb(readFileSync('packages/pet-runtime/assets/starter.glb'))).toBe(true);
  expect(validatePetGlb(glb({ asset: { version: '2.0' } }))).toBe(true);
});
it('accepts a forest shared between scenes without cloning node parents', () => {
  expect(validatePetGlb(glb({ asset: { version: '2.0' }, nodes: [{ children: [1] }, {}, {}],
    scenes: [{ nodes: [0, 2] }, { nodes: [0] }], scene: 0 }))).toBe(true);
});
it.each([
  { nodes: [{ children: [0] }] },
  { nodes: [{ children: [1] }, { children: [0] }] },
  { nodes: [{ children: [2] }, { children: [2] }, {}] },
  { nodes: [{ children: [1, 1] }, {}] },
  { nodes: [{ children: [1] }] },
  { nodes: [{ children: [-1] }] },
  { nodes: [{ children: [0.5] }] },
  { nodes: [{ children: '0' }] },
  { nodes: [{ mesh: 0 }] },
  { nodes: [{ skin: 0 }] },
  { nodes: [{}], scenes: [{ nodes: [1] }] },
  { nodes: [{}], scenes: [{ nodes: [0, 0] }] },
  { nodes: [{ children: [1] }, {}], scenes: [{ nodes: [1] }] },
  { scenes: [{}], scene: 1 },
  { nodes: Array.from({ length: 129 }, (_, index) => index < 128 ? { children: [index + 1] } : {}) },
])('rejects invalid node graphs or references: %j', graph => {
  expect(validatePetGlb(glb({ asset: { version: '2.0' }, ...graph }))).toBe(false);
});

function accessorGlb(accessor: Record<string, unknown>, view: Record<string, unknown> = {}): Buffer {
  return glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 64 }],
    bufferViews: [{ buffer: 0, byteLength: 64, ...view }],
    accessors: [{ bufferView: 0, count: 2, componentType: 5126, type: 'VEC3', ...accessor }],
  }, 64);
}
it('accepts tightly packed, interleaved, zero-filled and padded matrix accessors', () => {
  expect(validatePetGlb(accessorGlb({}))).toBe(true);
  expect(validatePetGlb(accessorGlb({}, { byteStride: 32 }))).toBe(true);
  expect(validatePetGlb(glb({ asset: { version: '2.0' }, accessors: [{ count: 2, componentType: 5126, type: 'VEC3' }] }))).toBe(true);
  expect(validatePetGlb(accessorGlb({ count: 1, componentType: 5121, type: 'MAT3' }, { byteLength: 11 }))).toBe(true);
});
it.each([
  [{ bufferView: 1 }, {}],
  [{ byteOffset: 56 }, {}],
  [{ byteOffset: 2 }, {}],
  [{ count: 6 }, {}],
  [{ componentType: 9999 }, {}],
  [{ type: 'VEC5' }, {}],
  [{ normalized: true }, {}],
  [{}, { byteStride: 8 }],
  [{}, { byteStride: 256 }],
  [{}, { byteStride: 14 }],
  [{}, { byteStride: 64 }],
  [{}, { byteOffset: 2, byteLength: 62 }],
  [{ count: 1, componentType: 5121, type: 'MAT3' }, { byteLength: 9 }],
])('rejects invalid accessor layout %j / %j', (accessor, view) => {
  expect(validatePetGlb(accessorGlb(accessor, view))).toBe(false);
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
