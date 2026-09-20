export type PiBridgeConfig = {
  endpoint: string;
  token: string;
};

export function readPiBridgeConfig(
  env: Record<string, string | undefined>,
): PiBridgeConfig | undefined {
  const endpoint = env.AGENT_PET_PI_ENDPOINT?.trim();
  const token = env.AGENT_PET_PI_TOKEN?.trim();
  if (!endpoint || !token || token.length < 16 || token.length > 256) return undefined;
  return { endpoint, token };
}
