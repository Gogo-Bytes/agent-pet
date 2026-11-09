# Codex CLI passive observation

Current path: native command hooks → protected activation → independently verified
macOS host identity → private mapper → Configurations/Application/Home/desktop.
Compatibility is limited to the checked **standalone0.163.0 layout**, not all install
methods/versions or Codex Desktop. Task priorities are in the [MVP entry](../../docs/MVP-EXECUTION-PLAN.md).

## Connection setup: scan once, never pick a program file

Main owns revalidatable installation discovery evidence, not an executable picker or
Renderer-supplied program path. The resolver survives preview cancellation while its
scan identity, entry/standalone layout and target remain valid. Preview and confirmation
recheck CLI/host paths and layout; this does not bind program inode identity or detect a
replacement at the same accepted path/layout, and is not binary attestation. A stale
scan/window, changed resolved program path/layout or proven target/hooks change requires
rescan. Hook-plan directory/file identity and bytes are checked before private setup and
again after asynchronous observer initialization; unreadable/uncertain failures are not
reported as proven stale evidence.

An existing unconfigured record continues read consent and exact hook preview, not just
“view configuration”. Custom-target preparation accepts only the opaque configuration ID;
Main binds it to the scan's captured target and rejects wrong-provider/removed/changed IDs.
It never substitutes the default target. Configured records restore validated saved
executable evidence without mandatory rescan or duplicate installation.

The selected target is actual CODEX_HOME (normally `~/.codex`, not a project's `.codex`).
Read consent permits only bounded target hooks.json (64KiB) and ancestor/program metadata;
separate confirmation appends10 owned command hooks. The read-only preview lists the exact
target and events plus the actual append-group shape (command type, timeout2), with only
the private command replaced by an explicitly non-executable redaction. Neither existing
private hooks nor activation/token paths are sent to Renderer. Existing JSON values/unrelated bytes,
config.toml, login and shell remain unchanged. Codex's native `/hooks` trust review is
independent: Agent Pet does not write trust, run Codex or approve tasks.

`protected-json-file.ts` and `codex-user-hook.ts` reject duplicate keys, unsafe links/
permissions, pending writes, ambiguous or modified own references. Only complete unchanged
owned groups are withdrawn. `codex-registration-store.ts` keeps0700/0600 private state,
receipt and original-hook backup; writes compare the first receipt-validated bytes, never
adopt a concurrent edit as a new overwrite baseline. No full backup restore over user edits.
Unknown/partial files remain; shared-file rename is not external-editor CAS. A change found
before private setup creates no registration/runtime material. If evidence changes or setup
fails after initialization, observation stops but disabled registration/runtime evidence is
retained; rescan does not authorize cleanup or adoption of those residues.

`codex-connection.ts` owns explicit confirm/cancel/resume/pause/removal. Resume validates
original hooks, program and private materials; paused state persists. Exit stops observation,
not Agent. Removal preserves runtime material that already-loaded hooks may still use.
Main owns one-use plans/generations; Renderer gets no execution API or private activation.
Common preservation and authorization rules: [security boundaries](../../docs/SECURITY-BOUNDARIES.md).

## Startup and host identity

`native-hook-entry.ts` rereads the fixed private activation on every invocation; normal
startup needs no connection environment variables. `hook-runtime/private-activation.ts`
checks schema/provider/address,700/600/current owner, complete bounded ancestor metadata,
no-follow/nonblock, one link, size and before/after identity. Observer failure silently
exits0 without emitting hook decisions or interfering with Agent output.

`native-host.ts` validates the hook executable and exact host through at most16 ancestors,
UID/PID/birth time/full executable path and a second full-chain check. No process-list,
argv/env/cwd/transcript read or name-based match. Default daemon executable can differ
from the CLI: Main's `codex-executable.ts` resolves the fixed version's packages/app-server-daemon
entry and bounded legacy layout metadata, never background log bodies. Upgrade/path
mismatch requires revalidation, not accepting an arbitrary “codex” process.

`native-receiver.ts` authenticates loopback route/headers/authority and bounded input,
with16 peers/queued checks and a1500ms absolute deadline; stop fences late validation.
`native-presence.ts` holds random host-run IDs, independent sessions,32 runs/32 sessions/
1024 recent events, and retired identities. Saturation retires the run rather than
throwing away tombstones. Every event is independently host-verified. Host death/PID reuse
clears it; daemon liveness alone does not prove any CLI window or Session is online.

A first verified non-startup fact may establish an unknown baseline, not a fabricated
SessionStart or success. An empty CLI does not promise an immediate Pet. For0.163.0,
SessionStart is [queued at session creation](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/session/session.rs#L1954)
and [drained in the first turn](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/session/turn.rs#L333),
with a [first-turn ordering test](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/tests/suite/hooks.rs#L1580).
Waiting longer at an empty thread is not a valid startup-hook test. SessionEnd can follow
archival/deletion or idle-session cleanup, not necessarily terminal closure; see
[official lifecycle](https://learn.chatgpt.com/docs/hooks#sessionend). Shared-daemon sessions
and host lifetimes are distinct.

## Facts and privacy

`normalize.ts` accepts bounded JSON and returns only native identity and enum facts.
Prompts, paths, tool arguments/results, message text and model names are discarded;
unknown events are ignored, malformed known events rejected, input never logged.
`observations.ts` keeps native session/turn/tool IDs private and publishes random aliases
in the configuration namespace. Each session retains at most256 turns/1024 tool tombstones;
saturation refuses new facts rather than permitting replay. Old/unseen/child facts never
attach to a guessed current turn. SessionEnd/retire/stop clear timers; throwing/rejected
consumers cannot interrupt remaining cleanup. Publication is best-effort, not a transaction.

- Canonical Bash and apply_patch results give2-second recent executing/writing feedback,
  not proof the tool is still running. Unknown tools stay other, without command parsing.
- Explicit root Interrupt produces a cancellation occurrence; session exit does not.
- Submission, PreToolUse, approval checks, compaction requests and Stop do not establish
  sustained working/waiting/compacting or completed-unread. Tool return is not task success.
- No reliable general command/model error, read/search, thinking/responding or retry fact
  is synthesized. Missing result/timeout is not an error signal. See [versioned error
  boundary](../../docs/CODEX-ERROR-FEEDBACK-LIMIT.md) and [fine capability limits](../../docs/PROVIDER-ANIMATION-EVIDENCE.md).
- Missing animations follow the shared optional catalog; a fact does not prove a clip exists.

Transport reuses the authenticated hook runtime with a separate provider codec/route and
external trusted run gate. Sender narrows before sending, receiver validates again;
short-lived hook closure is not Agent exit. Legacy environment-based command/hook generators
remain library/test seams, not the ordinary-start connection path.

## Unsupported observation alternatives

Do not start a new App Server/SDK to claim attachment to an existing CLI. Connecting to
an existing daemon is also not the current production observation protocol: a client
`includeTurns=false` can still receive Thread.preview; model sandbox=read-only is not a
read-only protocol permission. Merely dropping body fields after IPC receipt does not mean
“never read content”. [Status broadcast](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server/src/thread_status.rs#L223)
and [message scope](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server/src/outgoing_message.rs#L747)
require independent privacy/authentication review before any new observer.

[legacy notify](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/hooks/src/legacy_notify.rs#L13)
contains input/assistant bodies, while [tool telemetry](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/otel/src/events/session_telemetry.rs#L1256)
can contain arguments/output despite disabling prompt logging. Neither, nor rollout/SQLite
or process scans, is a substitute for the current bounded hook surface.

## Development checks

Official [hooks](https://learn.chatgpt.com/docs/hooks) are rolling documentation; fixed
source links above use0.163.0 commit83086188ae0614bd882818ff1aa23f3194962012, not proof
of installed binary identity. Canonical Bash naming is backed by the
[unified_exec adapter](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/tools/handlers/unified_exec.rs#L81).

```sh
pnpm exec vitest run integrations/codex-hooks --maxWorkers=1
```

Tests cover synthetic normalization, real self-owned subprocess/loopback delivery,
host fixtures, tombstones, concurrency and shared presentation. Main-side setup regressions
are source-named `codex-connection`, `codex-executable`, `configuration-ipc` and preload tests.
These do not certify real Codex/native UI/GPU or every install mode.

`test-support/` contains explicit native probes, mock model, trust/account/network helpers.
Their old fixed profiles/commands are not reusable approval: inspect exact target and
credential/network scope and obtain authorization before execution; never install a
blocking test hook into daily use or bypass native trust. A local mock or continue:false
does not itself guarantee zero external traffic during native initialization/prewarm.
