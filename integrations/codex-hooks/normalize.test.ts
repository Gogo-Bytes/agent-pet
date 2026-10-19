import { describe, expect, it } from 'vitest';
import { MAX_CODEX_HOOK_BYTES, normalizeCodexHook } from './normalize.js';
const payload = (hook_event_name: string, fields: Record<string, unknown> = {}) => JSON.stringify({
  hook_event_name, session_id: 'session-a', turn_id: 'turn-a', ...fields,
});
const tool = { tool_name: 'Bash', tool_use_id: 'call-a' };
describe('Codex passive facts: synthetic documented payloads, no installed Agent', () => {
  it.each(['startup', 'resume', 'clear', 'compact', 'fork'])('retains %s without inventing a process', source => {
    expect(normalizeCodexHook(payload('SessionStart', { source, turn_id: undefined }))).toEqual({
      status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'session-started', source },
    });
  });
  it('strips private content instead of exposing it through accepted facts', () => {
    expect(normalizeCodexHook(payload('PostToolUse', { ...tool, cwd: 'SECRET', model: 'SECRET',
      transcript_path: 'SECRET', prompt: 'SECRET', tool_input: { command: 'SECRET' },
      tool_response: { text: 'SECRET', exit_code: 1 }, error: 'SECRET', unknown: 'SECRET' }))).toEqual({
      status: 'accepted', fact: { providerSessionId: 'session-a', turnId: 'turn-a',
        kind: 'tool-returned', activity: 'executing', toolCallId: 'call-a' },
    });
  });
  it.each([['Bash', 'executing'], ['apply_patch', 'writing'], ['Edit', 'other'], ['Read', 'other'],
    ['mcp__fs__read', 'other'], ['future_tool', 'other']])('classifies canonical %s conservatively', (tool_name, activity) => {
    expect(normalizeCodexHook(payload('PreToolUse', { ...tool, tool_name }))).toMatchObject({
      fact: { kind: 'tool-requested', activity },
    });
  });
  it('does not promote approval checks to waiting or Stop to success', () => {
    expect(normalizeCodexHook(payload('PermissionRequest', { tool_name: 'Bash' }))).toEqual({ status: 'accepted',
      fact: { providerSessionId: 'session-a', turnId: 'turn-a', kind: 'approval-check', activity: 'executing' } });
    for (const stop_hook_active of [true, false]) {
      expect(normalizeCodexHook(payload('Stop', { stop_hook_active, last_assistant_message: 'SECRET' })))
        .toMatchObject({ fact: { kind: 'stop-requested', alreadyContinued: stop_hook_active } });
    }
  });
  it('preserves actual interrupt and turn identities without treating session exit as cancellation', () => {
    expect(normalizeCodexHook(payload('Interrupt'))).toMatchObject({ fact: { kind: 'turn-interrupted', turnId: 'turn-a' } });
    expect(normalizeCodexHook(payload('UserPromptSubmit'))).toMatchObject({ fact: { kind: 'turn-submitted', turnId: 'turn-a' } });
    expect(normalizeCodexHook(payload('SessionEnd', { reason: 'other', turn_id: undefined })))
      .toEqual({ status: 'accepted', fact: { providerSessionId: 'session-a', kind: 'session-ended' } });
  });
  it('keeps child identity separate and ignores subagent lifecycle instead of completing its parent', () => {
    expect(normalizeCodexHook(payload('PostToolUse', { ...tool, agent_id: 'child-a' })))
      .toMatchObject({ fact: { childId: 'child-a' } });
    for (const event of ['SubagentStart', 'SubagentStop', 'StopFailure', 'PostToolUseFailure', 'Future'])
      expect(normalizeCodexHook(payload(event))).toEqual({ status: 'ignored', reason: 'event' });
  });
  it.each(['manual', 'auto'])('separates requested and finished compaction: %s', trigger => {
    expect(normalizeCodexHook(payload('PreCompact', { trigger }))).toMatchObject({ fact: { kind: 'compact-requested', trigger } });
    expect(normalizeCodexHook(payload('PostCompact', { trigger }))).toMatchObject({ fact: { kind: 'compact-finished', trigger } });
  });
  it('rejects missing turn identity without falling back to Claude prompt_id', () => {
    for (const event of ['UserPromptSubmit', 'Interrupt', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'PreCompact', 'PostCompact'])
      expect(normalizeCodexHook(payload(event, { ...tool, turn_id: undefined, prompt_id: 'prompt-a' })))
        .toEqual({ status: 'invalid', reason: 'identity' });
  });
  it.each(['', ' x', 'x\n', 'x\u0000', 'x'.repeat(257), null, 12])('rejects invalid identifiers %j', id => {
    for (const key of ['session_id', 'turn_id', 'agent_id'])
      expect(normalizeCodexHook(payload('Interrupt', { [key]: id }))).toEqual({ status: 'invalid', reason: 'identity' });
  });
  it.each([
    ['SessionStart', { source: 'future' }], ['SessionEnd', { reason: 'failed' }],
    ['Stop', { stop_hook_active: 'false' }], ['PreCompact', { trigger: 'future' }],
    ['PostToolUse', { tool_name: 'Bash' }], ['PreToolUse', { ...tool, tool_name: '' }],
    ['PermissionRequest', {}],
  ])('rejects malformed known event %s', (event, fields) => {
    expect(normalizeCodexHook(payload(event, fields))).toEqual({ status: 'invalid', reason: 'fields' });
  });
  it('bounds UTF-8 bytes and rejects malformed JSON or non-object inputs', () => {
    expect(normalizeCodexHook('你'.repeat(MAX_CODEX_HOOK_BYTES / 2))).toEqual({ status: 'invalid', reason: 'size' });
    expect(normalizeCodexHook('{')).toEqual({ status: 'invalid', reason: 'json' });
    for (const input of ['null', '[]', 'true', '1', '"str"'])
      expect(normalizeCodexHook(input)).toEqual({ status: 'invalid', reason: 'shape' });
  });
});
