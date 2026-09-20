# Agent Pet pi extension

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
  environment, credential or raw event payload.
- Does not register tools or commands, modify messages, control the agent, or
  block pi on bridge availability.

## Explicit local test

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
