# Agent Pet pi extension

当前部署路线与验收见 [本地 macOS/pi MVP 执行计划](../../docs/MVP-EXECUTION-PLAN.md)。本页说明已存在的 legacy opt-in 扩展，不是 managed 客户端或自动安装器；真实目标加载/配置操作须另获精确范围授权，完整端到端尚未验收。

This is an opt-in, read-only pi extension for the local bridge. It is intentionally
self-contained and does not depend on the Agent Pet npm workspace.

## What it does

- Sends only Session/process identity, a display-name/project fallback, coarse
  lifecycle status, work id, sequence number and timestamp.
- Observes `session_start`, `agent_start`, `message_end`, `agent_settled`,
  `session_info_changed` and `session_shutdown`.
- Treats `agent_settled` plus `ctx.isIdle()` as the point at which a work cycle
  may become completed/error.
- Sends no prompt, response, thinking, tool input/output, transcript path,
  environment, provider credential or raw event payload. The legacy bridge's
  configured capability token is included in every protocol frame; it is not
  managed auth/ack or cryptographic server authentication.
- Does not register tools or commands, modify messages, control the agent, or
  block pi on bridge availability.

## Explicit configuration supply (M1 temporary-target slice)

`renderConfiguredPiExtension({ endpoint, token })` in `configured-source.ts` returns
self-contained TypeScript source from this directory's fixed `index.ts`. It embeds
validated, JSON-serialized configuration in one data slot; the event state machine
and builtin-only imports are unchanged. It accepts no executable code/source path
and performs no target writes. The generated extension needs no workspace imports,
manual environment exports, or generation helper at runtime. The helper itself is
currently source-only and requires its adjacent `index.ts` at generation time;
it is not yet a packaged desktop resource.

The M2 temporary-only `PiTemporaryDeployment` helper in
`apps/desktop/src/main/pi-temp-deployment.ts` consumes that text once per preview.
An explicitly injected configuration root maps to `extensions/agent-pet.ts`
(pi 0.85.1's installed `docs/extensions.md`, read in full, documents this layout).
Read-only bounded preview and cancellation, host-held single-use confirmation,
revalidation, exclusive 0600 creation and identity/content-matched withdrawal are
tested on disposable roots. Conflicts, loading obstacles and uncertain write/close
failures are preserved, not adopted or overwritten; only unchanged, empty directories
created by that apply may be removed. Failure can leave residual files/directories.
Ownership is in memory only: losing the host means residuals are unknown, not
permission to delete them. No HOME discovery, settings/trust changes, Main activation,
real pi launch or runtime unloading is implemented. This is local no-clobber behavior,
not same-UID attacker isolation or a production installer. A configuration target is
not a pi installation, and placement proves neither loading nor connection.
Generated text contains a capability token: treat it as a private target credential,
not a log, diagnostic, Renderer payload, snapshot, committed file or public bundle.

`configured-source.test.ts` loads the generated extension in a Node child with an
empty environment, using synthetic hooks and a real isolated PiBridgeAdapter socket
and Application, including loading the actual M2-applied `agent-pet.ts` file.
It verifies working/completed/error/ack, serialized data safety,
no overwrite, and bounded natural exit with absent/detached bridges. Existing env,
reconnect and no-replay tests remain. This is not actual pi TUI acceptance. Main still
uses its existing explicit environment opt-in; daily configuration supply, real
deployment and source-independent application packaging remain M2–M5 work.

## Explicit local development test

The desktop Adapter must already be running with the same endpoint and token.
The user must explicitly load this file in an existing idle pi TUI, for example
with pi's documented `-e`/extension mechanism or by placing a trusted copy in
pi's extension directory, then use `/reload` when pi permits it.

```sh
AGENT_PET_PI_ENDPOINT=/tmp/agent-pet-pi.sock \
AGENT_PET_PI_TOKEN=replace-with-the-same-random-token \
pi -e ./integrations/pi-extension/index.ts
```

Do not run this command automatically. Loading an extension grants it the full
permissions of pi; inspect and trust this source before loading it. Busy
streaming/compaction sessions may reject `/reload`, and events before loading
are intentionally not reconstructed.

## Reconnection

Each socket connection starts with a fresh `hello` containing the current working
or idle baseline and work identity. Connection failures retry from 250 ms up to
5 seconds; retries and sockets do not keep pi alive. Pending socket writes are
bounded; there is no historical event queue. Work that finishes while disconnected
is not replayed as a new unread notification. Shutdown cancels retries. This
behavior is covered using real sockets and synthetic pi callbacks, not a live TUI.
Only TUI mode enables observation.

Still pending: real `/reload` identity continuity, multiple real pi processes,
retry-period cancellation, connection health UI and Windows pipe security checks.

`session_shutdown` is connection cleanup, not task completion. The desktop side
keeps `openSession` unsupported until the original terminal window can be
reliably located.
