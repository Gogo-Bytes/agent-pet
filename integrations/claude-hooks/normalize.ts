/** Passive hook input boundary. No filesystem, transport, Agent control or hook output. */
export const MAX_CLAUDE_HOOK_BYTES = 64 * 1024;
export type ClaudeToolActivity = 'reading' | 'writing' | 'searching' | 'executing' | 'other';
export const claudeFailureKinds = ['rate_limit', 'overloaded', 'authentication_failed', 'oauth_org_not_allowed',
  'account_on_hold', 'billing_error', 'invalid_request', 'model_not_found', 'server_error',
  'max_output_tokens', 'cloud_credential_error', 'unknown'] as const;
export type ClaudeFailureKind = typeof claudeFailureKinds[number];

/** These are native facts, not authoritative Session terminal states. */
export type ClaudeHookFact = { providerSessionId: string } & (
  | { kind: 'session-started'; source: 'startup' | 'resume' | 'clear' | 'compact' }
  | { kind: 'session-ended' }
  | { kind: 'turn-submitted' }
  | { kind: 'tool-requested' | 'tool-succeeded'; toolCallId: string; activity: ClaudeToolActivity }
  | { kind: 'approval-check'; activity: ClaudeToolActivity }
  | { kind: 'tool-failed'; toolCallId: string; activity: ClaudeToolActivity; interrupted: boolean | null }
  | { kind: 'permission-prompt' }
  | { kind: 'response-stopped'; continuedByHook: boolean; backgroundWork: boolean | null }
  | { kind: 'turn-failed'; failure: ClaudeFailureKind }
  | { kind: 'compact-started' | 'compact-finished' }
);
export type ClaudeHookResult =
  | { status: 'accepted'; fact: ClaudeHookFact }
  | { status: 'ignored'; reason: 'event' | 'notification' }
  | { status: 'invalid'; reason: 'size' | 'json' | 'shape' | 'identity' | 'fields' };

const events = new Set(['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'PreCompact', 'PostCompact']);
const toolActivities = new Map<string, ClaudeToolActivity>([
  ['Read', 'reading'], ['Write', 'writing'], ['Edit', 'writing'], ['MultiEdit', 'writing'],
  ['NotebookEdit', 'writing'], ['Grep', 'searching'], ['Glob', 'searching'], ['Bash', 'executing'],
]);
const invalidFields = { status: 'invalid', reason: 'fields' } as const;
function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Receives one bounded JSON hook payload; only explicit metadata survives this call.
 * It never follows transcript_path or examines prompt/tool_input/tool_response or tool error text.
 * StopFailure.error is a category, not the free-form PostToolUseFailure.error text.
 * The future authenticated receiver must supply run/work identity and delivery ordering separately.
 */
export function normalizeClaudeHook(input: string): ClaudeHookResult {
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > MAX_CLAUDE_HOOK_BYTES) {
    return { status: 'invalid', reason: 'size' };
  }
  let value: unknown;
  try { value = JSON.parse(input); } catch { return { status: 'invalid', reason: 'json' }; }
  if (!object(value)) return { status: 'invalid', reason: 'shape' };
  if (typeof value.hook_event_name !== 'string' || !events.has(value.hook_event_name)) {
    return { status: 'ignored', reason: 'event' };
  }
  if (!identifier(value.session_id)) return { status: 'invalid', reason: 'identity' };
  const providerSessionId = value.session_id;
  const accepted = (fact: ClaudeHookFact): ClaudeHookResult => ({ status: 'accepted', fact });
  switch (value.hook_event_name) {
    case 'SessionStart': {
      const source = value.source;
      if (source !== 'startup' && source !== 'resume' && source !== 'clear' && source !== 'compact') return invalidFields;
      return accepted({ providerSessionId, kind: 'session-started', source });
    }
    case 'SessionEnd':
      // Exiting, clearing or disappearing never means success, failure or cancellation.
      return accepted({ providerSessionId, kind: 'session-ended' });
    case 'UserPromptSubmit':
      // Another hook may still reject submission; this is not proof that the model started.
      return accepted({ providerSessionId, kind: 'turn-submitted' });
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure': {
      if (!identifier(value.tool_use_id) || typeof value.tool_name !== 'string' ||
          !identifier(value.tool_name)) return invalidFields;
      const tool = { providerSessionId, toolCallId: value.tool_use_id,
        activity: toolActivities.get(value.tool_name) ?? 'other' as const };
      if (value.hook_event_name === 'PostToolUseFailure') {
        if (value.is_interrupt !== undefined && typeof value.is_interrupt !== 'boolean') return invalidFields;
        // A tool abort is not evidence that the whole turn was cancelled.
        return accepted({ ...tool, kind: 'tool-failed', interrupted: value.is_interrupt ?? null });
      }
      const kind = value.hook_event_name === 'PreToolUse' ? 'tool-requested' : 'tool-succeeded';
      return accepted({ ...tool, kind });
    }
    case 'PermissionRequest':
      // This event has no tool_use_id; never invent a correlation with a pending tool.
      return identifier(value.tool_name) ? accepted({ providerSessionId, kind: 'approval-check',
        activity: toolActivities.get(value.tool_name) ?? 'other' }) : invalidFields;
    case 'Notification':
      // idle_prompt is a reminder, not authoritative waiting_input. Other notification text is dropped.
      return value.notification_type === 'permission_prompt' ? accepted({ providerSessionId, kind: 'permission-prompt' })
        : { status: 'ignored', reason: 'notification' };
    case 'Stop': {
      if (typeof value.stop_hook_active !== 'boolean') return invalidFields;
      const tasks = value.background_tasks, crons = value.session_crons;
      if ((tasks !== undefined && (!Array.isArray(tasks) || tasks.length > 256)) ||
          (crons !== undefined && (!Array.isArray(crons) || crons.length > 256))) return invalidFields;
      const hasWork = (Array.isArray(tasks) && tasks.length > 0) || (Array.isArray(crons) && crons.length > 0);
      // Other Stop hooks can continue the turn. No completed-unread claim here.
      return accepted({ providerSessionId, kind: 'response-stopped', continuedByHook: value.stop_hook_active,
        backgroundWork: hasWork ? true : Array.isArray(tasks) && Array.isArray(crons) ? false : null });
    }
    case 'StopFailure': {
      if (typeof value.error !== 'string' || value.error.length === 0) return invalidFields;
      const failure = claudeFailureKinds.find(kind => kind === value.error) ?? 'unknown';
      return accepted({ providerSessionId, kind: 'turn-failed', failure });
    }
    case 'PreCompact':
    case 'PostCompact':
      return accepted({ providerSessionId, kind: value.hook_event_name === 'PreCompact' ? 'compact-started' : 'compact-finished' });
    default:
      return { status: 'ignored', reason: 'event' };
  }
}
