import { join } from 'node:path';
import { fail } from './errors.js';
import { exact, PROTOCOL, validId } from './protocol.js';
import type { FilesReader, FileReceipt } from './files-port.js';
export type Discovery = { schema: 1; protocolVersion: 2; authSetId: string; generation: string; instance: string; credentialLayout: 1 };
export const DISCOVERY_BYTES = 4096;
export function parseDiscovery(value: unknown, authSetId: string): Discovery {
  if (!exact(value, ['schema', 'protocolVersion', 'authSetId', 'generation', 'instance', 'credentialLayout']) ||
      value.schema !== 1 || value.protocolVersion !== PROTOCOL || value.authSetId !== authSetId || !validId(value.authSetId) ||
      !validId(value.generation) || !validId(value.instance) || value.credentialLayout !== 1) fail('unauthorized');
  return value as Discovery;
}
export function endpoint(runtimeRoot: string, instance: string): string {
  if (!validId(instance)) fail('unsupported-path');
  const path = join(runtimeRoot, instance, 's');
  if (Buffer.byteLength(path) > 100) fail('path-too-long');
  return path;
}
export async function readDiscovery(files: FilesReader, authSetId: string): Promise<{ discovery: Discovery; owned: FileReceipt }> {
  const result = await files.read(join(files.storageRoot, 'discovery.json'), DISCOVERY_BYTES, 'discovery-read');
  return { discovery: parseDiscovery(result.value, authSetId), owned: result.owned };
}
