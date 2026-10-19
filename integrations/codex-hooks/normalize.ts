/** Passive input only. No transport, filesystem, hook output or Agent control. */
export const MAX_CODEX_HOOK_BYTES = 64 * 1024;
export type CodexToolActivity = 'writing' | 'executing' | 'other';
type Identity = { providerSessionId: string; turnId?: string; childId?: string };
export type CodexHookFact = Identity & (
  | { kind: 'session-started'; source: 'startup' | 'resume' | 'clear' | 'compact' | 'fork' }
  | { kind: 'session-ended' }
  | { kind: 'turn-submitted' | 'turn-interrupted'; turnId: string }
  | { kind: 'tool-requested' | 'tool-returned'; turnId: string; toolCallId: string; activity: CodexToolActivity }
  | { kind: 'approval-check'; turnId: string; activity: CodexToolActivity }
  | { kind: 'stop-requested'; turnId: string; alreadyContinued: boolean }
  | { kind: 'compact-requested' | 'compact-finished'; turnId: string; trigger: 'manual' | 'auto' }
);
export type CodexHookResult =
  | { status: 'accepted'; fact: CodexHookFact }
  | { status: 'ignored'; reason: 'event' }
  | { status: 'invalid'; reason: 'size' | 'json' | 'shape' | 'identity' | 'fields' };
const events = new Set(['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'Interrupt',
  'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'PreCompact', 'PostCompact']);
const invalidFields = { status: 'invalid', reason: 'fields' } as const;
function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function activity(name: string): CodexToolActivity {
  // Classify canonical names only. Do not inspect shell text, MCP names or tool output.
  return name === 'Bash' ? 'executing' : name === 'apply_patch' ? 'writing' : 'other';
}
/** Facts remain Main-private. A future receiver must authenticate the process and anonymize IDs.
 * PostToolUse may contain failed output; Stop may be continued by another hook.
 * No transcript, prompt, arguments, result, error text, model or paths survive projection.
 */
export function normalizeCodexHook(input: string): CodexHookResult {
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > MAX_CODEX_HOOK_BYTES)
    return { status: 'invalid', reason: 'size' };
  let value: unknown;
  try { value = JSON.parse(input); } catch { return { status: 'invalid', reason: 'json' }; }
  if (!object(value)) return { status: 'invalid', reason: 'shape' };
  if (typeof value.hook_event_name !== 'string' || !events.has(value.hook_event_name))
    return { status: 'ignored', reason: 'event' };
  if (!identifier(value.session_id)) return { status: 'invalid', reason: 'identity' };
  for (const key of ['turn_id', 'agent_id']) {
    if (value[key] !== undefined && !identifier(value[key])) return { status: 'invalid', reason: 'identity' };
  }
  const base: Identity = { providerSessionId: value.session_id,
    ...(typeof value.turn_id === 'string' ? { turnId: value.turn_id } : {}),
    ...(typeof value.agent_id === 'string' ? { childId: value.agent_id } : {}) };
  const accepted = (fact: CodexHookFact): CodexHookResult => ({ status: 'accepted', fact });
  if (value.hook_event_name === 'SessionStart') {
    const source = value.source;
    if (source !== 'startup' && source !== 'resume' && source !== 'clear' && source !== 'compact' && source !== 'fork')
      return invalidFields;
    return accepted({ ...base, kind: 'session-started', source });
  }
  if (value.hook_event_name === 'SessionEnd')
    return value.reason === 'other' ? accepted({ ...base, kind: 'session-ended' }) : invalidFields;
  if (!identifier(value.turn_id)) return { status: 'invalid', reason: 'identity' };
  const turn = { ...base, turnId: value.turn_id };
  switch (value.hook_event_name) {
    case 'UserPromptSubmit': return accepted({ ...turn, kind: 'turn-submitted' });
    case 'Interrupt': return accepted({ ...turn, kind: 'turn-interrupted' });
    case 'PreToolUse':
    case 'PostToolUse':
      if (!identifier(value.tool_name) || !identifier(value.tool_use_id)) return invalidFields;
      return accepted({ ...turn, kind: value.hook_event_name === 'PreToolUse' ? 'tool-requested' : 'tool-returned',
        toolCallId: value.tool_use_id, activity: activity(value.tool_name) });
    case 'PermissionRequest':
      return identifier(value.tool_name) ? accepted({ ...turn, kind: 'approval-check', activity: activity(value.tool_name) }) : invalidFields;
    case 'Stop':
      return typeof value.stop_hook_active === 'boolean' ? accepted({ ...turn, kind: 'stop-requested', alreadyContinued: value.stop_hook_active }) : invalidFields;
    case 'PreCompact':
    case 'PostCompact':
      if (value.trigger !== 'manual' && value.trigger !== 'auto') return invalidFields;
      return accepted({ ...turn, kind: value.hook_event_name === 'PreCompact' ? 'compact-requested' : 'compact-finished', trigger: value.trigger });
    default: return { status: 'ignored', reason: 'event' };
  }
}
