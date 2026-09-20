# pi read-only adapter

This package implements the Agent Pet side of a local newline-delimited JSON
bridge. It does not start pi, resume a pi session, read session JSONL, send
prompts, or modify pi configuration.

## Protocol

The pi extension sends only:

- `hello`: process/session identity, name/project fallback, current coarse status
- `lifecycle`: `working`, `completed`, `error`, `idle`, or `offline`, with an optional work id
- `session_info_changed`: a renamed session
- `heartbeat`: connection lease only

Every message includes `schemaVersion`, a capability token, monotonic `seq`,
process/session identity and `sentAt`. Unknown fields are rejected. Prompts,
responses, tool payloads, transcript paths, credentials and raw provider data
are not part of the accepted protocol.

`PiBridgeAdapter` listens on a configured Unix-domain socket or Windows named
pipe. The endpoint and token are supplied by the future explicit opt-in
installation flow; this package does not create or write pi configuration.
`openSession()` intentionally returns `unsupported` until a reliable mapping to
the original terminal window exists.

The current implementation is protocol/adapter code only. It is not yet wired
to the desktop process and no pi extension is bundled or installed.
