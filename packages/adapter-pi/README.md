# pi read-only adapter

This package implements the Agent Pet side of a local newline-delimited JSON
bridge. It does not start pi, resume a pi session, read session JSONL, send
prompts, or modify pi configuration.

## Development protocol (unchanged)

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
pipe. Its endpoint and token are supplied by explicit development environment
configuration, not managed authorization; this package does not create or write
pi configuration.
`openSession()` intentionally returns `unsupported` until a reliable mapping to
the original terminal window exists.

The desktop Main wires this Adapter when explicit endpoint/token configuration
is valid; see `../../apps/desktop/README.md`. The opt-in extension source is
`../../integrations/pi-extension/index.ts`, with loading instructions in its
README. It is not automatically installed or loaded. Real extension callbacks →
isolated socket → Application and reconnect are covered by integration tests;
these are not live pi TUI or Windows acceptance.

## Dormant managed mechanism (P2b.1)

The separate `@agent-pet/adapter-pi/managed` entry exports
`createManagedPiService` and `connectManagedPiClient`. Both currently reject with
`acl-unverified` **before parameter inspection, filesystem access or socket
activity**. There is no production activation switch, Main wiring, installation
control, extension deployment, or fallback to the development bridge.

Internal `src/managed/` modules are exercised only against synthetic private
roots with a test-only ACL/mount policy. They implement per-target credentials,
authoritative pending/enabled/revoked state, durable publication, recovery
barriers, strict pre-session auth/ack, discovery, bounded real UDS transport and
a one-attempt client. Managed session IDs include auth-set/target namespaces;
legacy IDs and events remain unchanged. Credential existence alone never grants
admission. Revoke immediately denies/closes peers, then persists, then cleans
owned credentials; uncertain failures retain a claim that blocks restart.

**Mechanism core implemented; real activation remains blocked.** A verified
P2b.2 ACL/mount/recovery backend and native evidence are mandatory **before P2c**.
Mode/owner fixtures are not native ACL isolation or sudden-power-loss proof;
no same-uid/root isolation or cryptographic server authentication is promised.
Node's observed `server.close()` unlink of a replaced socket leaf is explicitly
unresolved, not disguised as safe owned cleanup. See
[the P2b.1 contract and evidence limits](../../docs/DESKTOP-P2B-LOCAL-CONNECTION.md).

Tests: `pnpm exec vitest run packages/adapter-pi/src/managed`. These use temporary
filesystem targets/UDS only and include a deliberately killed test subprocess.
No real pi installation, configuration or process is used.
