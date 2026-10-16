# Claude Code passive observation — isolated stages 1–3

**Normalization, local delivery and a standalone hook command are implemented for isolated verification. Not a connected
Adapter, installed hook, Main registration, or native compatibility acceptance.** Nothing
in this directory is loaded by the running desktop or Claude Code. Generated plugin documents
are not an installation or an authorization to load them.

`normalizeClaudeHook()` accepts one JSON payload capped at 64 KiB (UTF-8 bytes),
then returns a new object containing only bounded IDs, fixed categories and booleans. Explicit native
`prompt_id` and child `agent_id` are retained as `promptId`/`childId` when present;
missing identity stays absent. Root `agent_type` is not child identity.
It returns enum-only rejection reasons and does not log its input. Unknown event and
notification names are ignored. No prompt, path, tool arguments/results, assistant
text, free-form tool error or permission decision reaches its output. It does not
open `transcript_path`, discover files, contact a receiver, or write to Agent stdout.

The approved isolated version/help check returned Claude Code 2.1.143 and advertised
`--plugin-dir`. The candidate first host is its interactive CLI. This is version/help
evidence, not a hook-loading test. The current [official hook reference](https://code.claude.com/docs/en/hooks)
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

## Authenticated local delivery

`transport.ts` exposes `startClaudeHookReceiver()` and `deliverClaudeHook()`. The sender
normalizes raw input before sending; the receiver independently validates a strict,
flat metadata schema. It listens only on an ephemeral 127.0.0.1 HTTP port, requires a
private token and rejects browser Origin headers, alternate routes/authorities and raw
payload fields. The sender refuses external destinations, redirects and response-body
instructions; it has a bounded wait and performs no automatic retry or Agent output.
This new callback transport does not replace or weaken pi's socket/managed paths.

A trusted invocation binding must already exist outside this module. `acceptRun` must
return exactly true for the supplied per-invocation UUID; the request cannot register
itself. Native conversation IDs, hook-process PIDs and whichever SessionStart arrived
last are not run identity. Retired bindings are checked even for duplicate events.
Per-run event IDs are deduplicated within a bounded recent window, not an exactly-once
or causal-ordering guarantee. It cannot attach delayed data to a guessed latest work.

`onFact` must commit synchronously and return undefined; both its type and runtime
reject async results. Rejected promises are consumed without logging their contents,
and failed commits are not acknowledged or cached. It must not partially commit and
then throw: the sender has no transaction over external effects. Shutdown invalidates
processing before external validation/callback reentry and closes partial peers.
Individual hook client closure never declares Agent offline or completed. Callback
facts do not grant observation capabilities or publish SessionObservation.

Resource bounds and rejection behavior live in the executable constants/schema and
`transport.test.ts`. This is token-authenticated loopback metadata delivery, not proof
of cross-user isolation, peer process identity, trusted hook activation or production
security acceptance. No credential persistence/installer is implemented yet.

## Standalone command and plugin documents

`command-entry.ts` is a dedicated, compiled Node hook process. It reads only the three
`AGENT_PET_CLAUDE_URL`, `AGENT_PET_CLAUDE_TOKEN` and `AGENT_PET_CLAUDE_RUN_ID`
environment values plus one bounded stdin message. It does not read files, enumerate
environment variables or persist credentials. Missing binding data, malformed/oversized
input, stdin failure/deadline and receiver failures remain silent and exit0. An inherited
run UUID is not authority: the receiver still requires its independent trusted binding.
The command does not emit decisions, context, prompts, logs or retry instructions.

`runClaudeHook` takes exclusive ownership of an input stream when configuration is
present. The supported input is native stdin with close events enabled; custom streams
that suppress close while destroying asynchronously are not supported and may retain
guard listeners. The dedicated command exits immediately after settlement.
Settlement pauses/destroys that stream. A queued I/O error can outlive the
stream's `closed` flag, so a silent error guard remains through close-event delivery,
with deferred cleanup for an already-closed input. The library function never exits
the process; only the dedicated entry does. Do not import that entry in Main.

`createClaudePluginDocuments` is a pure document generator: the standard
`.claude-plugin/plugin.json` and `hooks/hooks.json` contain passive command hooks, a
quoted absolute Node executable and a runtime path under `${CLAUDE_PLUGIN_ROOT}`.
No credential, run identity, setting overwrite, permission decision or Agent launch is
embedded. Synthetic shell tests cover literal spaces/quotes/metacharacters; installed
Claude's variable expansion and event support still require native acceptance.

Tests compile the entry with the existing Vite toolchain and run it in fresh Node
children against test-owned loopback receivers. This proves the command behavior,
not Claude plugin validation/loading or config/run/work correlation. No production
plugin builder, installer, invocation launcher or Provider controller exists yet.

## Next independently verifiable stage

Before enabling the product flow, validate/load the native plugin and bind
configuration/run/work identity at the transport interface. Short-lived hook clients closing must not mark the Agent offline.
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

`pnpm exec vitest run integrations/claude-hooks/normalize.test.ts integrations/claude-hooks/transport.test.ts integrations/claude-hooks/command.test.ts` tests official-shape
synthetic payloads, never real Agent input. Coverage includes permission events without
tool IDs, local error vs turn failure, missing optional fields, Stop continuation,
unknown and oversized/malformed inputs, UTF-8 limits, special JSON keys and private
content stripping. Actual loopback tests cover authentication, unknown/retired runs,
strict schema, duplicate events, sink failure/reentry, peer/body bounds, deadlines,
client failure and idempotent stop. They cannot prove native Agent loading, invocation
binding, work correlation or runtime event support.

No dependencies, installation, running Agent, configuration access, model request,
UI changes, dev restart or application package is required for this stage.
