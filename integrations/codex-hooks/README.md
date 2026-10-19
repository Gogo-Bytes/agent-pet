# Codex CLI hook input boundary

Stage 1 only: `normalize.ts` accepts bounded JSON and emits metadata facts. It has no filesystem, transport, hook output, installation or Main/Renderer registration. Nothing in the current dev connects to Codex yet.

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
