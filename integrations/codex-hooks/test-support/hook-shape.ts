import type { Readable } from 'node:stream';
import { closeSync, constants, openSync, fstatSync, writeSync } from 'node:fs';
import { normalizeCodexHook, MAX_CODEX_HOOK_BYTES } from '../normalize.js';
const events = new Set(['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','Interrupt','PreCompact','PostCompact']);
const sources = new Set(['startup','resume','clear','compact','fork','new','initial','start']);
const typeOf = (value: unknown) => value === undefined ? 'missing' : value === null ? 'null' : typeof value === 'string' ? 'string' : 'other';
/** Structural metadata only. Never retain identity values, prompt, paths, tools or unknown strings. */
export function hookShape(input: string) {
  const normalized = normalizeCodexHook(input);
  let value: Record<string,unknown> = {};
  try { const parsed: unknown = JSON.parse(input); if(parsed && typeof parsed==='object' && !Array.isArray(parsed))value=parsed as Record<string,unknown>; } catch { /* fixed categories below */ }
  return { event: typeof value.hook_event_name==='string' && events.has(value.hook_event_name) ? value.hook_event_name : 'unknown',
    sessionIdType:typeOf(value.session_id),turnIdType:typeOf(value.turn_id),agentIdType:typeOf(value.agent_id),
    source:typeof value.source==='string' && sources.has(value.source) ? value.source : typeOf(value.source),
    reason: value.reason==='other'?'other':typeOf(value.reason),
    normalized:normalized.status,detail:normalized.status==='accepted'?normalized.fact.kind:normalized.reason };
}
/** The caller exclusively prepares the owned record. No creation, following links or arbitrary text writes. */
export function recordHookShape(file: string,input: string): void {
  let fd: number | undefined;
  try {
    const owner=process.getuid?.();
    if(owner===undefined)return;
    fd=openSync(file,constants.O_WRONLY|constants.O_APPEND|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const stat=fstatSync(fd);
    if(!stat.isFile() || stat.uid!==owner || stat.nlink!==1 || (stat.mode&0o7777)!==0o600 || stat.size>16*1024-1024)return;
    const summary=JSON.stringify(hookShape(input.length>MAX_CODEX_HOOK_BYTES?input.slice(0,MAX_CODEX_HOOK_BYTES+1):input))+'\n';
    writeSync(fd,summary);
  } catch { /* Diagnostic failure never affects the observer or Agent. */ }
  finally { if(fd!==undefined) { try { closeSync(fd); } catch { /* Observer must stay silent. */ } } }
}

/** Observe a bounded stdin copy without consuming, changing or destroying the original stream. */
export function observeHookShape(input: Readable, record: (input: string) => void): void {
  const chunks: Buffer[] = [];
  let bytes = 0, done = false;
  const finish = () => {
    if (done) return;
    done = true;
    input.off('data', data); input.off('end', finish); input.off('close', finish);
    try { record(bytes > MAX_CODEX_HOOK_BYTES ? ' '.repeat(MAX_CODEX_HOOK_BYTES + 1) : Buffer.concat(chunks).toString('utf8')); }
    catch { /* A diagnostic failure cannot break the Agent observer. */ }
    chunks.length = 0;
  };
  const data = (chunk: Buffer | string) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_CODEX_HOOK_BYTES) finish(); else chunks.push(buffer);
  };
  input.on('data', data); input.once('end', finish); input.once('close', finish);
}
