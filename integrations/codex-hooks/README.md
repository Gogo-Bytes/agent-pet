# Codex CLI hook input boundary

`normalize.ts` accepts bounded JSON and emits metadata facts. Transport, standalone hook command and shared-state projection are now implemented and tested with isolated self-owned processes. Main/Renderer registration and daily configuration installation are not yet enabled; the current dev does not connect to Codex.

The 2026-10-19 [official hook contract](https://learn.chatgpt.com/docs/hooks) supplies native session/turn/tool identities. These are Main-private, not UI IDs. Input projection drops prompts, paths, tool arguments/results, message text and model names. Unknown events are ignored; malformed known events are rejected. No input is logged.

Design decisions:

- A returned tool result is not success. Classify canonical Bash/apply_patch only; unknown tools remain `other`, without inspecting command text.
- Submission, approval checks, compaction requests and Stop are candidates, not definitive working/waiting/completed states. Other hooks may affect execution.
- Preserve the explicit interruption fact and turn identity. Never treat session exit as cancellation or completion.
- Preserve any supplied child identity. Subagent lifecycle is deferred; a parent session ID alone cannot prove root-thread attribution.
- Never infer process lifetime from a short-lived hook. Future transport must verify the actual host, bind a run, anonymize IDs, and handle ordering/deduplication before Application receives observations.

Tests use synthetic inputs. The earlier installed CLI version check (0.163.0) does not prove this current documented contract is supported there. Native compatibility, hook trust, passive process binding, private authenticated delivery, preserving existing hook configuration, UI and real actions remain separate stages. Do not bypass hook trust or use a new app-server process to claim observation of an existing CLI. Desktop stays out of this stage.

Validation: `pnpm test integrations/codex-hooks/normalize.test.ts integrations/claude-hooks/normalize.test.ts --maxWorkers=1` (58 passed), `pnpm typecheck`, `pnpm --filter @agent-pet/desktop build` (source build only). No dependencies, daily configuration reads/writes, Agent execution, model requests or packaging.

## Bounded installed-CLI check harness

`test-support/cli-check.mjs` prepares only fixed version/help commands in an exclusive temporary profile. It never executes on import; its explicit entry requires authorization under the [precise preview](../../docs/CODEX-CLI-COMPATIBILITY-CHECK-PREVIEW.md). Seven self-owned process/filesystem tests cover output limits, deadlines, secret-free summaries and bounded installation links. Together with input tests: 40 passed; typecheck and desktop source build passed. After precise authorization, the installed CLI returned version 0.163.0 and help successfully; help mentions hooks. No hook was loaded or interactive session started. See the preview for measured output sizes and remaining limits.

## End-to-end isolated implementation (2026-10-19)

- `transport.ts`: separate Codex route and strict provider codec over the shared authenticated loopback runtime. Unknown/retired runs are refused by the externally supplied host binding gate. Socket closure never invents Agent exit.
- `command.ts` / `command-entry.ts`: bounded stdin, metadata projection before sending, silent exit0 on observer failure, no filesystem or Agent control. `hook-source.ts` produces additive inert documents; it never installs or trusts hooks.
- `observations.ts`: native session/turn/tool IDs stay private; Application gets random aliases and the existing provider-neutral facts. Canonical tool results give two-second recent activity, explicit root interruption gives a cancellation occurrence; neither creates success/error bubbles. Pre-hooks/approval/Stop do not establish working/waiting/completed. Child/old/unseen events are ignored. Native compatibility and child attribution still require real evidence.
- Up to32 host runs,32 native sessions/run,256 turns/session and1024 tool tombstones/session; saturation refuses new task facts rather than accepting evicted replay. Retired host/session identities stay retired. SessionEnd, run retirement and stop clear timers. Multiple distinct native sessions are not type-deduplicated.
- `bridge.ts` composes receiver→mapper→existing SessionObservation; Main must supply independently verified host ownership/liveness. This interface cannot grant itself permission to observe arbitrary existing Codex processes.
- `test-support/native-start-check.mjs`: prepared native empty-thread/hook loading check with network confined to loopback, no task, no trust bypass. Requires the separate [precise preview](../../docs/CODEX-NATIVE-START-CHECK-PREVIEW.md) authorization. It tests only the new isolated host, not CLI/desktop attachment.

Self-owned subprocess tests prove command→authenticated callback→shared pet presentation, cancellation, path quoting and quiet failure. Synthetic mapper tests cover independent identities, deduplication, old/child facts, resource bounds and cleanup/reentrant stop. These are not real Codex acceptance or proof that a pet asset has every animation.

Validation for this slice: final full `pnpm test --maxWorkers=1` 1226 passed /1 skipped /102 files; `pnpm typecheck` and `pnpm --filter @agent-pet/desktop build` passed. The retained skip and existing Three.js duplicate-import warnings are unchanged. A final Claude invalid-run compatibility assertion is also covered by the focused transport rerun. No application package or daily native activation was performed.

Independent review reproduced two cleanup defects before commit: a closed group leader could cancel descendant escalation, and a throwing consumer could interrupt remaining session cleanup. The probe now retains its owned-group termination promise; the mapper isolates consumer failures. Added descendant heartbeat and multi-session failing-subscriber regressions. The initial immediate PID-removal assertion was invalid for asynchronous process reaping; the replacement asserts that the known-live descendant stops executing, without removing the failing scenario. Independent focused recheck:17 passed.

Native attempt: the original sandbox profile was rejected before initialization; no hook facts arrived. A bounded system-true reproduction identified invalid literal host syntax. The corrected IPv4 `localhost:*` profile passes an actual macOS test: loopback connects, external TEST-NET-1 is denied with EPERM.13 harness tests, typecheck and source build pass. No Codex retry yet; the initial result remains in the original directory, and the separate r1 attempt awaits precise authorization.

The authorized r1 attempt initialized successfully but thread/start was rejected; no hook facts arrived. The old probe intentionally retained no error message/code, so the rejection cause is still unknown. The prepared r2 harness first exports the installed version's protocol schema, accepts only an explicit read-only enum, and records fixed RPC categories/codes. See the new [precise schema-check preview](../../docs/CODEX-SCHEMA-VERIFY-PREVIEW.md); r2 has not run.

本次准备代码验证：20项检查程序测试、pnpm typecheck、desktop源码build通过；未执行r2、未打包。

Authorized r2: generated schema selects `read-only`; initialization and an empty thread succeeded, explaining the old `readOnly` parameter rejection. No hook callback arrived, so native activation still has not passed. The prepared `hook-status-check.mjs` reuses the r2 configuration and checks exact observer/document identity before a read-only hooks/list. It records only counts and fixed trust categories, never changes trust or creates a thread.25 harness tests, typecheck and source build pass; see [precise status-check scope](../../docs/CODEX-HOOK-STATUS-CHECK-PREVIEW.md).
