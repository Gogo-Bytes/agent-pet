const MAX_MODEL_BYTES = 64 * 1024 * 1024;
const MAX_JSON_BYTES = 1024 * 1024;
const COLLECTION_LIMITS: Record<string, number> = {
  nodes: 512, meshes: 128, accessors: 2048, bufferViews: 2048,
  materials: 128, textures: 64, images: 64, animations: 64, skins: 64, scenes: 16,
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function unsigned(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
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
    for (const view of (document.bufferViews ?? []) as Record<string, unknown>[]) {
      const offset = view.byteOffset ?? 0;
      if (view.buffer !== 0 || !unsigned(offset) || !unsigned(view.byteLength) ||
          view.byteLength === 0 || offset + view.byteLength > bufferLength) return false;
    }
    let elements = 0;
    for (const accessor of (document.accessors ?? []) as Record<string, unknown>[]) {
      if (!unsigned(accessor.count) || accessor.count === 0) return false;
      elements += accessor.count;
      if (elements > 1000000) return false;
    }
    return true;
  } catch { return false; }
}
