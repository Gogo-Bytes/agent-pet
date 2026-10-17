import { describe, expect, it } from 'vitest';
import { MAX_CLAUDE_HOOK_BYTES, normalizeClaudeHook } from './normalize.js';

const payload = (event: string, fields: Record<string, unknown> = {}) => JSON.stringify({
  session_id: 'session-a', hook_event_name: event, ...fields,
});
const tool = { tool_use_id: 'tool-a', tool_name: 'Read' };

describe('Claude passive hook facts (synthetic official-shape fixtures, no real Agent execution)', () => {
  it('keeps only a session id and source, without treating resume or compact as a new process', () => {
    for (const source of ['startup', 'resume', 'clear', 'compact']) {
      expect(normalizeClaudeHook(payload('SessionStart', { source, cwd: '/private/project', transcript_path: '/private/session' })))
        .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'session-started', source } });
    }
  });

  it('separates request, approval check and actual permission prompt', () => {
    const request = normalizeClaudeHook(payload('PreToolUse', tool));
    expect(request).toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a',
      kind: 'tool-requested', activity: 'reading', toolCallId: 'tool-a' } });
    // The native PermissionRequest schema deliberately has no tool_use_id.
    expect(normalizeClaudeHook(payload('PermissionRequest', { tool_name: 'Read', tool_input: { private: 'PRIVATE' } })))
      .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'approval-check', activity: 'reading' } });
    expect(normalizeClaudeHook(payload('Notification', { notification_type: 'permission_prompt', message: 'PRIVATE' })))
      .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'permission-prompt' } });
    for (const notification_type of ['idle_prompt', 'auth_success', 'future-type']) {
      expect(normalizeClaudeHook(payload('Notification', { notification_type }))).toEqual({ status: 'ignored', reason: 'notification' });
    }
    expect(JSON.stringify(request)).not.toMatch(/working|waiting_input|supported/);
  });

  it.each([['Read', 'reading'], ['Write', 'writing'], ['Edit', 'writing'], ['MultiEdit', 'writing'],
    ['NotebookEdit', 'writing'], ['Grep', 'searching'], ['Glob', 'searching'], ['Bash', 'executing'],
    ['mcp__private__sensitive_name', 'other']])('classifies %s without exposing the native tool name', (tool_name, activity) => {
    expect(normalizeClaudeHook(payload('PostToolUse', { ...tool, tool_name, tool_response: { private: 'PRIVATE' } })))
      .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'tool-succeeded', toolCallId: 'tool-a', activity } });
  });

  it('never promotes a local tool error or abort into a turn failure or whole-turn cancellation', () => {
    for (const is_interrupt of [undefined, false, true]) {
      expect(normalizeClaudeHook(payload('PostToolUseFailure', { ...tool, is_interrupt, error: 'PRIVATE aborted failure text' })))
        .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'tool-failed',
          toolCallId: 'tool-a', activity: 'reading', interrupted: is_interrupt ?? null } });
    }
    expect(normalizeClaudeHook(payload('PostToolUseFailure', { ...tool, is_interrupt: 'true' }))).toEqual({ status: 'invalid', reason: 'fields' });
  });

  it('keeps real API failure categories separate from tool failures and strips arbitrary error strings', () => {
    for (const error of ['rate_limit', 'authentication_failed', 'max_output_tokens', 'server_error']) {
      expect(normalizeClaudeHook(payload('StopFailure', { error, error_details: 'PRIVATE', last_assistant_message: 'PRIVATE' })))
        .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'turn-failed', failure: error } });
    }
    expect(normalizeClaudeHook(payload('StopFailure', { error: 'PRIVATE unexpected stack trace' })))
      .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'turn-failed', failure: 'unknown' } });
  });

  it('does not turn an attempted Stop into completed-unread, including continuations and background work', () => {
    for (const stop_hook_active of [false, true]) {
      expect(normalizeClaudeHook(payload('Stop', { stop_hook_active, last_assistant_message: 'PRIVATE' })))
        .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'response-stopped',
          continuedByHook: stop_hook_active, backgroundWork: null } });
    }
    expect(normalizeClaudeHook(payload('Stop', { stop_hook_active: false, background_tasks: [], session_crons: [] })))
      .toMatchObject({ fact: { backgroundWork: false } });
    for (const lists of [{ background_tasks: [{ command: 'PRIVATE' }] }, { session_crons: [{ prompt: 'PRIVATE' }] }]) {
      expect(normalizeClaudeHook(payload('Stop', { stop_hook_active: true, ...lists }))).toMatchObject({ fact: { backgroundWork: true } });
    }
  });

  it('does not interpret SessionEnd as a successful, failed or cancelled task', () => {
    for (const reason of ['prompt_input_exit', 'clear', 'logout', 'other', 'PRIVATE']) {
      expect(normalizeClaudeHook(payload('SessionEnd', { reason })))
        .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'session-ended' } });
    }
  });

  it('excludes subagent completions and unrelated future hooks from the parent turn', () => {
    for (const event of ['SubagentStop', 'TaskCompleted', 'SubagentStart', 'FutureEvent']) {
      expect(normalizeClaudeHook(payload(event, { last_assistant_message: 'PRIVATE' })))
        .toEqual({ status: 'ignored', reason: 'event' });
    }
  });

  it('preserves explicit prompt and child correlation without guessing missing identity or using agent_type', () => {
    expect(normalizeClaudeHook(payload('PostToolUse', { ...tool, prompt_id: 'prompt-a', agent_id: 'child-a', agent_type: 'PRIVATE' })))
      .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'tool-succeeded',
        toolCallId: 'tool-a', activity: 'reading', promptId: 'prompt-a', childId: 'child-a' } });
    expect(normalizeClaudeHook(payload('UserPromptSubmit', { agent_type: 'custom-root-agent', prompt_id: null, agent_id: null })))
      .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'turn-submitted' } });
    for (const field of ['prompt_id', 'agent_id']) {
      expect(normalizeClaudeHook(payload('UserPromptSubmit', { [field]: 'bad\nidentity' }))).toEqual({ status: 'invalid', reason: 'identity' });
    }
  });

  it('retains safe prompt/compaction facts without accessing or forwarding their text', () => {
    for (const [event, kind] of [['UserPromptSubmit', 'turn-submitted'], ['PreCompact', 'compact-started'], ['PostCompact', 'compact-finished']]) {
      expect(normalizeClaudeHook(payload(event!, { prompt: 'PRIVATE', custom_instructions: 'PRIVATE', compact_summary: 'PRIVATE' })))
        .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind } });
    }
  });

  it('bounds bytes before parsing, including multibyte payloads and malformed over-limit input', () => {
    const prefix = payload('UserPromptSubmit');
    expect(normalizeClaudeHook(prefix + ' '.repeat(MAX_CLAUDE_HOOK_BYTES - Buffer.byteLength(prefix))).status).toBe('accepted');
    for (const input of [prefix + ' '.repeat(MAX_CLAUDE_HOOK_BYTES), '你'.repeat(MAX_CLAUDE_HOOK_BYTES / 2), '{'.repeat(MAX_CLAUDE_HOOK_BYTES + 1)]) {
      expect(normalizeClaudeHook(input)).toEqual({ status: 'invalid', reason: 'size' });
    }
  });

  it.each(['null', '[]', '1', '"PRIVATE"'])('rejects a non-object payload: %s', input => {
    expect(normalizeClaudeHook(input)).toEqual({ status: 'invalid', reason: 'shape' });
  });

  it('rejects malformed, missing, oversized and control-character identifiers without echoing input', () => {
    expect(normalizeClaudeHook('{PRIVATE')).toEqual({ status: 'invalid', reason: 'json' });
    for (const session_id of [null, '', ' padded ', 'x'.repeat(257), 'bad\nidentifier', 'bad\u0085id']) {
      expect(normalizeClaudeHook(payload('UserPromptSubmit', { session_id }))).toEqual({ status: 'invalid', reason: 'identity' });
    }
    for (const fields of [{}, { ...tool, tool_use_id: '' }, { ...tool, tool_name: 42 }]) {
      expect(normalizeClaudeHook(payload('PreToolUse', fields))).toEqual({ status: 'invalid', reason: 'fields' });
    }
    expect(normalizeClaudeHook(payload('SessionStart', { source: 'future' }))).toEqual({ status: 'invalid', reason: 'fields' });
    expect(normalizeClaudeHook(payload('Stop', { stop_hook_active: 'false' }))).toEqual({ status: 'invalid', reason: 'fields' });
    expect(normalizeClaudeHook(payload('Stop', { stop_hook_active: false, background_tasks: {} }))).toEqual({ status: 'invalid', reason: 'fields' });
    expect(normalizeClaudeHook(payload('Stop', { stop_hook_active: false, session_crons: Array(257).fill({}) }))).toEqual({ status: 'invalid', reason: 'fields' });
  });

  it('cannot expose secrets from ignored or accepted raw fields, including special object keys', () => {
    const privateFields = JSON.parse('{"__proto__":{"polluted":"PRIVATE"},"constructor":"PRIVATE","prototype":"PRIVATE"}');
    for (const [event, required] of [['UserPromptSubmit', {}], ['PostToolUse', tool], ['PostToolUseFailure', tool],
      ['Stop', { stop_hook_active: false }], ['StopFailure', { error: 'server_error' }]] as const) {
      const result = normalizeClaudeHook(payload(event, { ...privateFields, ...required, prompt: 'PRIVATE',
        cwd: '/PRIVATE', transcript_path: '/PRIVATE', tool_input: { token: 'PRIVATE' }, tool_response: 'PRIVATE',
        last_assistant_message: 'PRIVATE', message: 'PRIVATE' }));
      expect(result.status).toBe('accepted');
      expect(JSON.stringify(result)).not.toContain('PRIVATE');
      expect(JSON.stringify(result)).not.toMatch(/__proto__|constructor|prototype|transcript|prompt|tool_input|tool_response/);
    }
    expect(Object.getPrototypeOf({}).polluted).toBeUndefined();
  });
});
