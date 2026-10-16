import type { Readable } from 'node:stream';
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
  const message = await readMessage(input);
  if (message === undefined) return 'invalid';
  try { return await deliverClaudeHook({ url, token, runId, input: message }); }
  catch { return 'unavailable'; }
}

function readMessage(input: Readable): Promise<string | undefined> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    let size = 0, settled = false;
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.pause();
      input.off('data', data); input.off('end', end); input.off('error', error); input.off('close', close);
      // An I/O error can already be queued when size/time limits settle. Keep a
      // silent guard until destroying our owned stream has actually closed it.
      const ignoreError = () => {};
      const closed = () => {
        clearImmediate(afterPendingEvents);
        input.off('error', ignoreError); input.off('close', closed);
      };
      // `closed` can become true before its queued error/close events fire.
      // An already-closed stream may never emit another close, so defer that
      // cleanup until Node has drained those pending events.
      const afterPendingEvents = setImmediate(() => { if (input.closed) closed(); });
      input.on('error', ignoreError);
      input.once('close', closed);
      input.destroy();
      const message = accepted ? Buffer.concat(chunks).toString('utf8') : undefined;
      chunks.length = 0;
      resolve(message);
    };
    const data = (chunk: unknown) => {
      if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string') { finish(false); return; }
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_CLAUDE_HOOK_BYTES) finish(false);
      else chunks.push(bytes);
    };
    const end = () => finish(true), error = () => finish(false), close = () => finish(false);
    // Bound incomplete stdin independently of the sender's network deadline.
    const timer = setTimeout(() => finish(false), 1000);
    if (input.destroyed || input.readableEnded) { finish(false); return; }
    input.on('data', data); input.once('end', end); input.once('error', error); input.once('close', close);
  });
}
