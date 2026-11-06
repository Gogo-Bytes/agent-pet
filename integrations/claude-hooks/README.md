# Claude Code passive observation

Current path: normal-start hooks → OS-bound `native-presence.ts` → Main-private
`observations.ts` → Configurations/Application → shared pet presentation. Supported
installation scope is **macOS, npm Claude Code 2.1.301, native bin/claude.exe layout**.
Other versions, official-install/Homebrew layouts and desktop/remote/background hosts
are unverified, not enabled merely because discovery finds a path. Task priorities
and native checks are tracked through the [MVP entry](../../docs/MVP-EXECUTION-PLAN.md).

## Setup, discovery and restart

Configure once, then run `claude` normally. The selected configuration is normally
`~/.claude`, or a project's `.claude` for that project; setup does not change HOME,
CLAUDE_CONFIG_DIR, shell/PATH, cwd or Agent arguments. Main never launches/reloads Claude.
Automatic discovery supplies a revalidated Main-owned installation candidate; multiple
entries for the same native program are deduplicated. Custom targets retain a manual
flow. Discovery reads bounded metadata, not configuration, credentials or sessions,
and does not execute candidates. GUI discovery does not fix a terminal's PATH.

Setup separately requests target-read consent, previews `settings.json` changes, then
confirms only owned hooks. Current task mode registers12 groups. Legacy presence-only
records retain one SessionStart until an explicit upgrade; resume never silently
updates observer source or adds task hooks. New setup/upgrade requires a new Claude
session. An already-running process without a startup callback to the new receiver
is not automatically adopted.

App restart validates materials/hooks and resumes unpaused observation, rotating
private receiver information. Explicit pause stays paused. Pause/app exit stops
observation, not Claude. Removal withdraws only exact unchanged owned hooks and product
metadata; runtime files stay available to already-loaded hook snapshots. Changed or
ambiguous references preserve both hook and product record for review.

## File ownership and shared settings

`claude-user-hook.ts` parses at most64KiB UTF-8 JSON and splices owned entries without
rewriting unrelated bytes, ordering, large numbers or existing hook semantics. Duplicate
keys, disableAllHooks, unsafe identity/permissions/links, changed targets and pending
writes fail closed. Target/ancestor evidence is rechecked around exclusive pending,
fsync and checked rename; original shared-file permissions are retained. Comparison
and rename are not atomic CAS against an external editor: do not concurrently save
settings during installation. Never restore an entire backup over later edits.

Private `userData/claude-normal-<configurationUUID>` is0700 with0600 observer.cjs,
activation.json, hook.json, settings-before.json and receipt.json. Original settings
bytes (literal null for an absent file) may contain secrets: never send them to
Renderer/logs/Git. Upgrade preserves SessionStart and adds11 owned groups only after
saving `upgrade-before.json`, prospective ownership and replacement observer/activation/
receipt; uncertain failure preserves materials. Withdrawal requires all owned groups
unambiguous and unchanged, not partial removal reported as success.

Shared rules: [security boundaries](../../docs/SECURITY-BOUNDARIES.md).
Durable identity/migration: [architecture](../../docs/ARCHITECTURE-DESIGN.md#durable-connection-identity-and-restart).

## Native presence and private identities

`native-hook-entry.ts` reads its protected activation and at most64KiB stdin,
normalizes before sending and silently exits0 on observation failure. Main verifies
the reported hook PID's complete bounded ancestor chain using `native-process-probe.c`:
UID, exact executable, PID/PPID and microsecond birth identity, followed by a full
chain recheck. It then polls only confirmed Claude identities each second, at most32
runs. No process-list, argv/env/cwd/transcript access, process-name guess or ps fallback.
PID reuse, disappearance or failed identity queries clear observation; hook exit,
SessionEnd and Stop do not prove native-process exit. Multiple runs remain independent.

The macOS libproc helper is version-sensitive. Before listening it performs one bounded
3-second self-identity readiness check; actual ancestry checks retain250ms and peer
limits. Cold startup can exceed readiness and must fail closed, not relax Agent checks.
Dev/build compile the helper with existing clang; this is not cross-platform certification.

Schema1 supplies presence only. Schema2 pins current native session identity and rejects
retired sessions; up to32 session IDs/run,16 pending verification tasks,1024 recent event
IDs. Full-body arrival ordering is not native causal ordering. `observations.ts` privately
correlates session/prompt/tool IDs and gives Application random aliases scoped by
configuration/run. Each session retains at most256 prompts/1024 resolved-tool tombstones;
saturation stops new task facts rather than evicting replay protection. Missing/old/child
identities never attach to a guessed latest prompt.

## Facts and prohibited inferences

`normalize.ts` returns only bounded IDs, enum categories and booleans, never input logs,
paths, prompt/assistant text, tool parameters/results, raw errors or permission decisions.
Unknown event/notification names are ignored. Optional fields absent in the native version
remain unknown. Root agent_type is not child identity; SubagentStop/TaskCompleted cannot
complete the parent.

| Native input | Current projection / constraint |
| --- | --- |
| SessionStart | Bind root Session; compact/resume/clear are not new OS processes |
| UserPromptSubmit | Associate prompt, not proven execution |
| PreToolUse / PermissionRequest | Requested tool / approval check; no fabricated tool ID or running state |
| Notification.permission_prompt | Reminder, not paired sustained waiting; idle_prompt does not prove waiting |
| PostToolUse | Matching current prompt/tool: Read, Write/Edit/MultiEdit/NotebookEdit, Grep/Glob or Bash give2-second recent feedback, not sustained work or turn completion |
| PostToolUseFailure | tool_error only with is_interrupt explicitly false; missing/true does not imply whole-turn cancellation |
| StopFailure | Matching known prompt gives generic error/unread; unknown category stays unknown, no body parsing |
| Stop / PreCompact / PostCompact | Clear/associate facts as supported, not whole-task success or ongoing compaction |
| SessionEnd / OS exit / pause | Clear feedback/observation at the appropriate identity layer, not success/failure/cancellation |

No supported completion, whole-turn cancellation, thinking/responding, sustained waiting
or business retry is inferred from these precursors. `max_output_tokens` is accepted by
the normalizer but not classified as output_limited; [version/source boundary](../../docs/PROVIDER-ANIMATION-EVIDENCE.md).
Unknown task state is not known idle; same-work unknown updates retain already-held
error unread, while new work does not inherit it. Old presence-only records stay task-unknown.

Feedback timers are owned before callbacks; stop/retire clears all runs even if a consumer
throws/rejects. Replacement rechecks closed/run/current after disconnect callbacks so
reentry cannot revive a stopped mapper or overwrite a newer Session. Publication is
best-effort, not transactions, ACK/retry or repair of partially delivered notifications.

## Transport and compatibility helpers

`transport.ts` / shared hook runtime use ephemeral127.0.0.1, a private token, strict
route/authority/headers/body bounds, no browser Origin, redirects or response instructions.
The receiver independently validates narrowed metadata and requires an external trusted
run binding (`acceptRun === true`); requests cannot register themselves. Retired bindings
are checked before deduplication. `onFact` commits synchronously and returns undefined;
failed/async commits are not acknowledged/cached. Bounded event deduplication is not
exactly-once delivery. Hook-client closure is not Agent exit.

Legacy `command-entry.ts` uses only its three explicit AGENT_PET_CLAUDE connection
variables and bounded stdin; normal production uses private activation instead.
`runClaudeHook` exclusively owns its input, pauses/destroys it after settlement and keeps
an error guard through queued close delivery; custom emitClose:false asynchronous streams
are unsupported. Only dedicated entry modules exit the process; never import them in Main.
`plugin-source.ts` generates inert plugin documents, not installation or trust.

`launcher.ts` / `launcher-entry.ts` / `presence-channel.ts` are retained user-terminal
compatibility helpers, not current onboarding or Main Agent-launch authority. They bind
a direct child with per-invocation UUID/token, strip inherited AGENT_PET_* credentials,
retain stdio/argv and stop observation without killing Claude. Detached/re-exec descendants
and background mode are unsupported; do not turn them into an automatic fallback.

## Sources and development checks

[Official hooks](https://code.claude.com/docs/en/hooks), [plugins](https://code.claude.com/docs/en/plugins)
and [setup](https://code.claude.com/docs/en/setup) are rolling references, not proof that
all fields/install modes work in2.1.301. [Release notes](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#2178)
record StopFailure introduction, not the exact native classification contract.

Source-named tests cover normalization, transport, native binding, observations and
Main registration/upgrade/withdrawal. For isolated module regression:

```sh
pnpm exec vitest run integrations/claude-hooks --maxWorkers=1
```

Synthetic inputs/self-owned processes do not establish real hook loading, native timing,
GPU animation or full deployment acceptance. Real targets and test-support launchers
require a fresh exact preview and authorization; no old command grants that permission.
