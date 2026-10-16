# Claude Code observation input — stage 1

**Implemented and isolated-tested input normalization only. Not a connected Adapter,
installed hook, Main receiver, or native compatibility acceptance.** Nothing in this
directory is loaded by the running desktop or Claude Code. There is no executable
hook command or hook configuration to install at this stage.

`normalizeClaudeHook()` accepts one JSON payload capped at 64 KiB (UTF-8 bytes),
then returns a new object containing only bounded IDs, fixed categories and booleans.
It returns enum-only rejection reasons and does not log its input. Unknown event and
notification names are ignored. No prompt, path, tool arguments/results, assistant
text, free-form tool error or permission decision reaches its output. It does not
open `transcript_path`, discover files, contact a receiver, or write to Agent stdout.

The approved installation check found package metadata for Claude Code 2.1.143.
The candidate first host is its interactive CLI. This is metadata evidence, not an
execution or hook-loading test. The current [official hook reference](https://code.claude.com/docs/en/hooks)
contains newer-version fields too; absent optional fields remain unknown.
[Official release notes](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#2178)
record the addition of `StopFailure` in 2.1.78; this is supporting release evidence,
not proof that the user's active process is this installation or loaded our code.

## Facts and their limits

| Native event | Safe fact | Prohibited inference |
| --- | --- | --- |
| SessionStart | Session id and startup/resume/clear/compact source | `compact` does not prove a new process run |
| UserPromptSubmit | Submission attempted | Other hooks can still reject it; model execution is unproven |
| PreToolUse | Tool requested, ID and activity category | Permission may still be pending; execution is unproven |
| PermissionRequest | Approval check and activity category | No tool_use_id exists here; do not invent one or auto-approve |
| Notification.permission_prompt | Native permission reminder | Other notifications, including idle_prompt, do not prove waiting_input |
| PostToolUse | Tool succeeded | Does not complete the whole turn |
| PostToolUseFailure | Tool failed, optional interrupt boolean | Tool failure/abort is not whole-turn failure/cancellation |
| StopFailure | Turn failure category; unrecognized value becomes unknown | Never parse the displayed error string or emit Agent instructions |
| Stop | Response stopped candidate; prior hook continuation, optional background-work facts | Another Stop hook may continue work; no completed-unread emitted |
| SessionEnd | Session ended | Not task success, failure, or cancellation |
| PreCompact / PostCompact | Native compaction boundary | Not proof of turn completion or capabilities before observation |

Unknown tools become `other`; their names and content are discarded. Only explicit
Read, Write, Edit, MultiEdit, NotebookEdit, Grep, Glob and Bash names are classified.
SubagentStop and TaskCompleted are ignored; they cannot complete a parent Session.
This module does not publish SessionObservation, grant capabilities or pick animation
clips. It cannot add online pets to the home scene.

## Next independently verifiable stage

Before enabling the product flow, implement an authenticated, bounded passive hook
receiver and delivery envelope; bind configuration/run/work identity and ordering at
that boundary. Short-lived hook clients closing must not mark the Agent offline.
Validate duplicate/late events, multiple concurrent sessions, pending permission
resolution, Stop-hook continuation and true terminal evidence. If final success or
cancellation cannot be proven from the permitted native surface, report the limit;
do not use a timer, parse conversation content, or start a replacement Agent.

Then add the Provider controller behind Configurations with preview, explicit consent,
safe install/withdrawal ownership and existing-hook preservation. It must retain pi's
deployment, restart, managed guard and data-preservation behavior. Actual files,
activation/reload requirements and rollback must be reviewable before requesting
authorization for real configuration changes. Codex and Antigravity remain separate
future adapters and host/version acceptance matrices.

## Verification

`pnpm exec vitest run integrations/claude-hooks/normalize.test.ts` tests official-shape
synthetic payloads, never real Agent input. Coverage includes permission events without
tool IDs, local error vs turn failure, missing optional fields, Stop continuation,
unknown and oversized/malformed inputs, UTF-8 limits, special JSON keys and private
content stripping. It cannot prove actual Agent loading or runtime event support.

No dependencies, installation, running Agent, configuration access, model request,
UI changes, dev restart or application package is required for this stage.
