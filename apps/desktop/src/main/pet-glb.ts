import { petImagePixels } from './pet-image-budget.js';

const MAX_MODEL_BYTES = 64 * 1024 * 1024;
const MAX_JSON_BYTES = 1024 * 1024;
const COLLECTION_LIMITS: Record<string, number> = {
  nodes: 512, meshes: 128, accessors: 2048, bufferViews: 2048,
  materials: 128, textures: 64, images: 64, animations: 64, skins: 64, scenes: 16, cameras: 64, samplers: 64,
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function unsigned(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const ACCESSOR_SHAPES: Record<string, readonly [number, number]> = {
  SCALAR: [1, 1], VEC2: [1, 2], VEC3: [1, 3], VEC4: [1, 4], MAT2: [2, 2], MAT3: [3, 3], MAT4: [4, 4],
};

function validAccessor(accessor: Record<string, unknown>, views: Record<string, unknown>[]): boolean {
  if (typeof accessor.componentType !== 'number' || !Object.hasOwn(COMPONENT_BYTES, accessor.componentType) ||
      typeof accessor.type !== 'string' || !Object.hasOwn(ACCESSOR_SHAPES, accessor.type)) return false;
  const component = COMPONENT_BYTES[accessor.componentType]!;
  const [columns, rows] = ACCESSOR_SHAPES[accessor.type]!;
  if ('normalized' in accessor && (typeof accessor.normalized !== 'boolean' ||
      (accessor.normalized && (accessor.componentType === 5125 || accessor.componentType === 5126)))) return false;
  const offset = accessor.byteOffset ?? 0;
  if (!unsigned(offset) || offset % component) return false;
  if (!('bufferView' in accessor)) return offset === 0;
  if (!index(accessor.bufferView, views.length)) return false;
  const view = views[accessor.bufferView]!;
  const viewOffset = view.byteOffset ?? 0;
  if (!unsigned(viewOffset) || (viewOffset + offset) % component) return false;
  const columnBytes = columns > 1 ? Math.ceil(rows * component / 4) * 4 : rows * component;
  if (columns > 1 && (viewOffset + offset) % 4) return false;
  const stride = view.byteStride ?? columnBytes * columns;
  if (!unsigned(stride) || stride < columnBytes * columns || stride % component) return false;
  // Matrix columns are 4-byte aligned; padding after the final column may be omitted.
  const span = columnBytes * (columns - 1) + rows * component;
  return unsigned(accessor.count) && unsigned(view.byteLength) &&
    offset + (accessor.count - 1) * stride + span <= view.byteLength;
}

function index(value: unknown, length: number): value is number {
  return unsigned(value) && value < length;
}

function validNodeGraph(document: Record<string, unknown>): boolean {
  const nodes = (document.nodes ?? []) as Record<string, unknown>[];
  const parents = new Array<number>(nodes.length).fill(-1);
  for (const [parent, node] of nodes.entries()) {
    for (const [field, collection] of [['mesh', 'meshes'], ['skin', 'skins'], ['camera', 'cameras']] as const) {
      if (field in node && !index(node[field], ((document[collection] ?? []) as unknown[]).length)) return false;
    }
    if ('children' in node) {
      if (!Array.isArray(node.children)) return false;
      for (const child of node.children) {
        if (!index(child, nodes.length) || parents[child] !== -1) return false;
        parents[child] = parent;
      }
    }
  }
  // Walk every node, including unreachable ones; cycles also exceed this depth budget.
  for (let node = 0; node < nodes.length; node++) {
    let depth = 0;
    for (let ancestor = node; ancestor !== -1; ancestor = parents[ancestor]!) {
      if (++depth > 128) return false;
    }
  }
  const scenes = (document.scenes ?? []) as Record<string, unknown>[];
  if ('scene' in document && !index(document.scene, scenes.length)) return false;
  for (const scene of scenes) {
    if (!('nodes' in scene)) continue;
    if (!Array.isArray(scene.nodes) || new Set(scene.nodes).size !== scene.nodes.length ||
        !scene.nodes.every(node => index(node, nodes.length) && parents[node] === -1)) return false;
  }
  return true;
}

function validGeometryBudget(document: Record<string, unknown>): boolean {
  const accessors = (document.accessors ?? []) as Record<string, unknown>[];
  const meshes = (document.meshes ?? []) as Record<string, unknown>[];
  const materials = (document.materials ?? []) as unknown[];
  const costs: { draws: number; vertices: number; indices: number }[] = [];
  let primitives = 0, loadedVertices = 0, loadedIndices = 0;
  for (const mesh of meshes) {
    if (!Array.isArray(mesh.primitives) || !mesh.primitives.length) return false;
    primitives += mesh.primitives.length;
    if (primitives > 256) return false;
    const cost = { draws: mesh.primitives.length, vertices: 0, indices: 0 };
    for (const primitive of mesh.primitives) {
      if (!object(primitive) || !object(primitive.attributes) ||
          !index(primitive.attributes.POSITION, accessors.length)) return false;
      const position = accessors[primitive.attributes.POSITION]!;
      if (position.type !== 'VEC3' || position.componentType !== 5126 || !unsigned(position.count)) return false;
      const attributes = Object.values(primitive.attributes);
      if (attributes.length > 16 || !attributes.every(id => index(id, accessors.length) &&
          accessors[id]!.count === position.count)) return false;
      if ('mode' in primitive && !index(primitive.mode, 7)) return false;
      if ('material' in primitive && !index(primitive.material, materials.length)) return false;
      let drawElements = position.count;
      if ('indices' in primitive) {
        if (!index(primitive.indices, accessors.length)) return false;
        const indices = accessors[primitive.indices]!;
        if (indices.type !== 'SCALAR' || ![5121, 5123, 5125].includes(indices.componentType as number) ||
            indices.normalized === true || !unsigned(indices.count)) return false;
        drawElements = indices.count;
      }
      let targets = 0;
      if ('targets' in primitive) {
        if (!Array.isArray(primitive.targets) || primitive.targets.length > 8) return false;
        targets = primitive.targets.length;
        for (const target of primitive.targets) {
          if (!object(target) || !Object.keys(target).length ||
              !Object.entries(target).every(([name, id]) => ['POSITION', 'NORMAL', 'TANGENT'].includes(name) &&
                index(id, accessors.length) && accessors[id]!.type === 'VEC3' &&
                accessors[id]!.componentType === 5126 && accessors[id]!.count === position.count)) return false;
        }
      }
      cost.vertices += position.count * (1 + targets);
      cost.indices += drawElements;
    }
    loadedVertices += cost.vertices; loadedIndices += cost.indices;
    if (loadedVertices > 500000 || loadedIndices > 500000) return false;
    costs.push(cost);
  }
  let draws = 0, vertices = 0, indices = 0;
  // Count all nodes, not only the default scene, so scene selection cannot bypass the budget.
  for (const node of (document.nodes ?? []) as Record<string, unknown>[]) {
    if (!('mesh' in node)) continue;
    const cost = costs[node.mesh as number]!;
    draws += cost.draws; vertices += cost.vertices; indices += cost.indices;
    if (draws > 256 || vertices > 500000 || indices > 500000) return false;
  }
  return true;
}

function validAnimationBudget(document: Record<string, unknown>): boolean {
  const nodes = (document.nodes ?? []) as Record<string, unknown>[];
  const accessors = (document.accessors ?? []) as Record<string, unknown>[];
  let joints = 0;
  for (const skin of (document.skins ?? []) as Record<string, unknown>[]) {
    if (!Array.isArray(skin.joints) || !skin.joints.length || skin.joints.length > 128 ||
        new Set(skin.joints).size !== skin.joints.length || !skin.joints.every(id => index(id, nodes.length))) return false;
    joints += skin.joints.length;
    if (joints > 1024 || ('skeleton' in skin && !index(skin.skeleton, nodes.length))) return false;
  }
  let channels = 0, keyframes = 0, outputElements = 0;
  for (const animation of (document.animations ?? []) as Record<string, unknown>[]) {
    if (!Array.isArray(animation.samplers) || !animation.samplers.length || animation.samplers.length > 256 ||
        !Array.isArray(animation.channels) || !animation.channels.length || animation.channels.length > 256) return false;
    channels += animation.channels.length;
    if (channels > 1024) return false;
    for (const sampler of animation.samplers) {
      if (!object(sampler) || !index(sampler.input, accessors.length) || !index(sampler.output, accessors.length)) return false;
      const input = accessors[sampler.input]!;
      if (!unsigned(input.count) || input.count > 10000) return false;
      keyframes += input.count;
      if (keyframes > 100000) return false;
    }
    for (const channel of animation.channels) {
      if (!object(channel) || !index(channel.sampler, animation.samplers.length) || !object(channel.target) ||
          !index(channel.target.node, nodes.length)) return false;
      const sampler = animation.samplers[channel.sampler] as Record<string, unknown>;
      const output = accessors[sampler.output as number]!;
      const [columns, rows] = ACCESSOR_SHAPES[output.type as string]!;
      outputElements += (output.count as number) * columns * rows;
      if (outputElements > 1000000) return false;
    }
  }
  return true;
}

function validTextureBudget(document: Record<string, unknown>, views: Record<string, unknown>[], binary: Buffer): boolean {
  const images = (document.images ?? []) as Record<string, unknown>[];
  const imagePixels: number[] = [];
  const limit = 16 * 1024 * 1024;
  let decoded = 0, textured = 0;
  for (const image of images) {
    if (!index(image.bufferView, views.length)) return false;
    const view = views[image.bufferView]!;
    if ('byteStride' in view) return false;
    const start = (view.byteOffset ?? 0) as number;
    const pixels = petImagePixels(binary.subarray(start, start + (view.byteLength as number)), image.mimeType);
    if (pixels === null || (decoded += pixels) > limit) return false;
    imagePixels.push(pixels);
  }
  const samplers = (document.samplers ?? []) as unknown[];
  for (const texture of (document.textures ?? []) as Record<string, unknown>[]) {
    if (!index(texture.source, images.length) ||
        ('sampler' in texture && !index(texture.sampler, samplers.length))) return false;
    textured += imagePixels[texture.source]!;
    if (textured > limit) return false;
  }
  return true;
}

/** Preliminary container/resource checks only, not full glTF or decoded GPU-budget validation. */
export function validatePetGlb(bytes: Buffer): boolean {
  try {
    if (bytes.length < 20 || bytes.length > MAX_MODEL_BYTES || bytes.toString('ascii', 0, 4) !== 'glTF' ||
        bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) return false;
    const jsonLength = bytes.readUInt32LE(12);
    if (!jsonLength || jsonLength > MAX_JSON_BYTES || jsonLength % 4 ||
        bytes.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLength > bytes.length) return false;
    let binaryLength = 0;
    const end = 20 + jsonLength;
    if (end !== bytes.length) {
      if (end + 8 > bytes.length || bytes.readUInt32LE(end + 4) !== 0x004e4942) return false;
      binaryLength = bytes.readUInt32LE(end);
      if (binaryLength % 4 || end + 8 + binaryLength !== bytes.length) return false;
    }
    const document: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, end)));
    if (!object(document) || !object(document.asset) || document.asset.version !== '2.0') return false;
    // No URI scheme or extension is admitted until its resource/decoder budget is implemented.
    const pending: unknown[] = [document];
    let visited = 0;
    while (pending.length) {
      if (++visited > 20000) return false;
      const value = pending.pop();
      if (Array.isArray(value)) pending.push(...value);
      else if (object(value)) {
        if ('uri' in value || 'extensions' in value || 'sparse' in value) return false;
        pending.push(...Object.values(value));
      }
    }
    for (const name of ['extensionsUsed', 'extensionsRequired']) {
      if (name in document && (!Array.isArray(document[name]) || document[name].length !== 0)) return false;
    }
    for (const [name, limit] of Object.entries(COLLECTION_LIMITS)) {
      if (name in document && (!Array.isArray(document[name]) || document[name].length > limit ||
          !document[name].every(object))) return false;
    }
    if (!validNodeGraph(document)) return false;
    let bufferLength = 0;
    if ('buffers' in document) {
      if (!Array.isArray(document.buffers) || document.buffers.length > 1) return false;
      if (document.buffers.length) {
        const buffer: unknown = document.buffers[0];
        if (!object(buffer) || !unsigned(buffer.byteLength) || buffer.byteLength > binaryLength ||
            binaryLength - buffer.byteLength > 3) return false;
        bufferLength = buffer.byteLength;
      }
    }
    if (binaryLength && !bufferLength) return false;
    const views = (document.bufferViews ?? []) as Record<string, unknown>[];
    for (const view of views) {
      const offset = view.byteOffset ?? 0;
      if (view.buffer !== 0 || !unsigned(offset) || !unsigned(view.byteLength) ||
          view.byteLength === 0 || offset + view.byteLength > bufferLength) return false;
      if ('byteStride' in view && (!unsigned(view.byteStride) || view.byteStride < 4 ||
          view.byteStride > 252 || view.byteStride % 4)) return false;
    }
    let elements = 0;
    for (const accessor of (document.accessors ?? []) as Record<string, unknown>[]) {
      if (!unsigned(accessor.count) || accessor.count === 0 || !validAccessor(accessor, views)) return false;
      elements += accessor.count;
      if (elements > 1000000) return false;
    }
    const binary = bytes.subarray(end + 8);
    return validGeometryBudget(document) && validAnimationBudget(document) && validTextureBudget(document, views, binary);
  } catch { return false; }
}
