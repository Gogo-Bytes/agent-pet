import source from './index.ts?raw';

export type PiExtensionConfig = {
  endpoint: string;
  token: string;
};

const configSlot = 'undefined /* AGENT_PET_EXPLICIT_CONFIG */';

/** Returns a self-contained TS extension; callers own authorized placement and secret handling. */
export async function renderConfiguredPiExtension(config: PiExtensionConfig): Promise<string> {
  const endpoint = typeof config.endpoint === 'string' ? config.endpoint.trim() : '';
  const token = typeof config.token === 'string' ? config.token.trim() : '';
  if (!endpoint || endpoint.includes('\0') || token.length < 16 || token.length > 256) {
    throw new Error('Invalid pi extension configuration');
  }

  // Fixed, trusted implementation at generation time only. No caller-provided code/path,
  // workspace import in the artifact, or second copy of the event state machine.
  if (source.split(configSlot).length !== 2) {
    throw new Error('Pi extension configuration slot must occur exactly once');
  }
  const serialized = JSON.stringify({ endpoint, token })
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  // A callback avoids replacement-string interpolation of dollar sequences in data.
  return source.replace(configSlot, () => serialized);
}
