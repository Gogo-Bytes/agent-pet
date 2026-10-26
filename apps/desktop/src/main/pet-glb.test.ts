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

function animationDocument() {
  return { asset: { version: '2.0' }, nodes: [{}], buffers: [{ byteLength: 8 }],
    bufferViews: [{ buffer: 0, byteLength: 8 }],
    accessors: [{ bufferView: 0, count: 2, componentType: 5126, type: 'SCALAR' },
      { count: 2, componentType: 5126, type: 'VEC3' }],
    animations: [{ samplers: [{ input: 0, output: 1 }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }],
  };
}
function animatedGlb(document: unknown, times = [0, 1]): Buffer {
  const bytes = glb(document, 8);
  const offset = 28 + bytes.readUInt32LE(12);
  bytes.writeFloatLE(times[0]!, offset); bytes.writeFloatLE(times[1]!, offset + 4);
  return bytes;
}
it('accepts ordinary animation and cubic spline output cardinality', () => {
  expect(validatePetGlb(animatedGlb(animationDocument()))).toBe(true);
  const document = animationDocument(); document.accessors[1]!.count = 6;
  const animation = { ...document.animations[0], samplers: [{ input: 0, output: 1, interpolation: 'CUBICSPLINE' }] };
  expect(validatePetGlb(animatedGlb({ ...document, animations: [animation] }))).toBe(true);
});
it('leaves clip duration and interpolation to the existing GLTF loader', () => {
  expect(validatePetGlb(animatedGlb(animationDocument(), [0, 7200]))).toBe(true);
});
it.each([
  { samplers: [{ input: 9, output: 1 }] },
  { samplers: [{ input: 0, output: 9 }] },

  { channels: [{ sampler: 9, target: { node: 0, path: 'translation' } }] },
  { channels: [{ sampler: 0, target: { node: 9, path: 'translation' } }] },

  { channels: Array.from({ length: 257 }, () => ({ sampler: 0, target: { node: 0, path: 'translation' } })) },

])('retains animation reference and allocation guards: %j', change => {
  const document = animationDocument();
  expect(validatePetGlb(animatedGlb({ ...document, animations: [{ ...document.animations[0], ...change }] }))).toBe(false);
});

it('bounds joint counts including the total across skins', () => {
  const document = { asset: { version: '2.0' }, nodes: Array.from({ length: 129 }, () => ({})),
    skins: [{ joints: Array.from({ length: 128 }, (_, index) => index) }] };
  expect(validatePetGlb(glb(document))).toBe(true);
  expect(validatePetGlb(glb({ ...document, skins: [{ joints: Array.from({ length: 129 }, (_, index) => index) }] }))).toBe(false);
  expect(validatePetGlb(glb({ ...document, skins: Array(8).fill(document.skins[0]) }))).toBe(true);
  expect(validatePetGlb(glb({ ...document, skins: Array(9).fill(document.skins[0]) }))).toBe(false);
});


it('accepts joint references and an optional inverse bind accessor', () => {
  expect(validatePetGlb(glb({ asset: { version: '2.0' }, nodes: [{}], skins: [{ joints: [0] }] }))).toBe(true);
  expect(validatePetGlb(glb({ asset: { version: '2.0' }, nodes: [{}], skins: [{ joints: [0], inverseBindMatrices: 0 }],
    accessors: [{ count: 1, type: 'MAT4', componentType: 5126 }] }))).toBe(true);
});
it.each([
  { joints: [] }, { joints: [1] }, { joints: [0, 0] }, { joints: [0], skeleton: 1 },
  { joints: Array(129).fill(0) },
])('rejects invalid skin references: %j', skin => {
  expect(validatePetGlb(glb({ asset: { version: '2.0' }, nodes: [{}], skins: [skin] }))).toBe(false);
});

function texturedGlb(width = 1, height = 1, textureCount = 1, imageCount = 1): Buffer {
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=', 'base64');
  // Header-only budget fixtures; these are not claimed to decode to the patched dimensions.
  image.writeUInt32BE(width, 16); image.writeUInt32BE(height, 20);
  const bytes = glb({ asset: { version: '2.0' }, buffers: [{ byteLength: image.length }],
    bufferViews: [{ buffer: 0, byteLength: image.length }],
    images: Array.from({ length: imageCount }, () => ({ bufferView: 0, mimeType: 'image/png' })),
    textures: Array.from({ length: textureCount }, () => ({ source: 0 })),
  }, image.length);
  image.copy(bytes, 28 + bytes.readUInt32LE(12));
  return bytes;
}
it('accepts embedded image metadata within the pixel budget', () => {
  expect(validatePetGlb(texturedGlb())).toBe(true);
  expect(validatePetGlb(texturedGlb(4096, 4096))).toBe(true);
});
it.each([
  [4097, 1, 1, 1],
  [4096, 4096, 2, 1],
  [4096, 4096, 0, 2],
])('rejects oversized images or repeated texture allocations: %j', (width, height, textures, images) => {
  expect(validatePetGlb(texturedGlb(width, height, textures, images))).toBe(false);
});
it.each([
  { images: [{ bufferView: 0, mimeType: 'image/png' }] },
  { textures: [{ source: 0 }] },
  { images: [{ bufferView: -1, mimeType: 'image/jpeg' }] },
])('rejects dangling embedded image and texture references: %j', document => {
  expect(validatePetGlb(glb({ asset: { version: '2.0' }, ...document }))).toBe(false);
});

function geometry(nodes = 1, vertices = 3, primitives = 1, indices?: number) {
  return { asset: { version: '2.0' },
    accessors: [{ count: vertices, componentType: 5126, type: 'VEC3' },
      ...(indices === undefined ? [] : [{ count: indices, componentType: 5123, type: 'SCALAR' }])],
    meshes: [{ primitives: Array.from({ length: primitives }, () => ({ attributes: { POSITION: 0 },
      ...(indices === undefined ? {} : { indices: 1 }) })) }],
    nodes: Array.from({ length: nodes }, () => ({ mesh: 0 })),
  };
}
it('accepts bounded shared meshes and indexed geometry', () => {
  expect(validatePetGlb(glb(geometry(10, 300)))).toBe(true);
  expect(validatePetGlb(glb(geometry(2, 100, 1, 300)))).toBe(true);
  expect(validatePetGlb(glb(geometry(256)))).toBe(true);
  expect(validatePetGlb(glb(geometry(100, 5000)))).toBe(true);
  expect(validatePetGlb(glb(geometry(100, 3, 1, 5000)))).toBe(true);
});
it.each([
  ['draw calls', geometry(257)],
  ['instanced vertices', geometry(100, 6000)],
  ['instanced indices', geometry(100, 3, 1, 6000)],
  ['primitive count', geometry(1, 3, 257)],
  ['unused geometry', { ...geometry(0, 600000) }],
])('rejects excessive %s', (_name, document) => {
  expect(validatePetGlb(glb(document))).toBe(false);
});
it.each([
  { attributes: { POSITION: 2 } },
  { attributes: {} },
  { attributes: { POSITION: 0, NORMAL: 2 } },
  { attributes: { POSITION: 0 }, indices: 0 },
  { attributes: { POSITION: 0 }, indices: 2 },
  { attributes: { POSITION: 0 }, mode: 7 },
  { attributes: { POSITION: 0 }, material: 0 },
  { attributes: { POSITION: 0 }, targets: Array.from({ length: 9 }, () => ({ POSITION: 0 })) },
  { attributes: { POSITION: 0 }, targets: [{ POSITION: 2 }] },
])('rejects invalid primitive references or excessive morph targets: %j', primitive => {
  expect(validatePetGlb(glb({ ...geometry(), meshes: [{ primitives: [primitive] }] }))).toBe(false);
});

it('counts morph target vertices in the workload budget', () => {
  const mesh = { primitives: [{ attributes: { POSITION: 0 }, targets: [{ POSITION: 0 }] }] };
  expect(validatePetGlb(glb({ ...geometry(1, 250000), meshes: [mesh] }))).toBe(true);
  expect(validatePetGlb(glb({ ...geometry(1, 250001), meshes: [mesh] }))).toBe(false);
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
