import type { Readable } from 'node:stream';
import { readHookInput } from '../hook-runtime/input.js';
import { MAX_CLAUDE_HOOK_BYTES } from './normalize.js';
import { deliverClaudeHook, type ClaudeDeliveryResult } from './transport.js';

export type ClaudeHookEnvironment = {
  AGENT_PET_CLAUDE_URL?: string;
  AGENT_PET_CLAUDE_TOKEN?: string;
  AGENT_PET_CLAUDE_RUN_ID?: string;
};

/** Takes exclusive ownership of native stdin (close events enabled), never transcript files.
 * Readables suppressing close events with delayed destruction are outside this input contract.
 * An inherited run ID still needs
 * an independent trusted receiver binding; this command cannot create one.
 */
export async function runClaudeHook(input: Readable, environment: ClaudeHookEnvironment): Promise<ClaudeDeliveryResult> {
  const url = environment.AGENT_PET_CLAUDE_URL;
  const token = environment.AGENT_PET_CLAUDE_TOKEN;
  const runId = environment.AGENT_PET_CLAUDE_RUN_ID;
  if (!url || !token || !runId) return 'invalid';
  const message = await readHookInput(input, MAX_CLAUDE_HOOK_BYTES);
  if (message === undefined) return 'invalid';
  try { return await deliverClaudeHook({ url, token, runId, input: message }); }
  catch { return 'unavailable'; }
}
