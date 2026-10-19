import type { Readable } from 'node:stream';
import { readHookInput } from '../hook-runtime/input.js';
import { MAX_CODEX_HOOK_BYTES } from './normalize.js';
import { deliverCodexHook, type CodexDeliveryResult } from './transport.js';
export type CodexHookEnvironment = {
  AGENT_PET_CODEX_URL?: string; AGENT_PET_CODEX_TOKEN?: string; AGENT_PET_CODEX_RUN_ID?: string;
};
/** Owns only stdin. No Agent files, outputs, instructions or automatic retries. */
export async function runCodexHook(input: Readable, environment: CodexHookEnvironment): Promise<CodexDeliveryResult> {
  const url = environment.AGENT_PET_CODEX_URL, token = environment.AGENT_PET_CODEX_TOKEN,
    runId = environment.AGENT_PET_CODEX_RUN_ID;
  if (!url || !token || !runId) return 'invalid';
  const message = await readHookInput(input, MAX_CODEX_HOOK_BYTES);
  if (message === undefined) return 'invalid';
  try { return await deliverCodexHook({ url, token, runId, input: message }); }
  catch { return 'unavailable'; }
}
