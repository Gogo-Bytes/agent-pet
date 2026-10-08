# pi read-only adapter

当前范围/进度/下一步统一见 [本地 macOS/pi MVP 执行计划](../../docs/MVP-EXECUTION-PLAN.md)。legacy 开发 bridge 已存在，managed 公开入口仍 fail-closed；两者不混称生产接入。旧 P2c 完整安全准入不再是本地 MVP gate，但未验证项、生产 guard 与数据保留测试不变。

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
responses, tool payloads, transcript paths, provider credentials and raw provider
data are not part of the accepted protocol. The bridge capability token above is
transport authentication data, not a pi/provider credential.

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

The P2b.1 service/store/client modules are exercised only against synthetic private
roots with a test-only ACL/mount policy. They implement per-target credentials,
authoritative pending/enabled/revoked state, durable publication, recovery
barriers, strict pre-session auth/ack, discovery, bounded real UDS transport and
a one-attempt client. Managed session IDs include auth-set/target namespaces;
legacy IDs and events remain unchanged. Credential existence alone never grants
admission. Revoke immediately denies/closes peers, then persists, then cleans
owned credentials; uncertain failures retain a claim that blocks restart.

**Mechanism core implemented; public managed activation remains blocked.** The
old strict production route required P2b.2 ACL/mount/recovery and native evidence
before P2c. Current local MVP sequencing instead follows M1–M5; this does not
authorize bypassing the public guard or claim those security gates passed.
Mode/owner fixtures are not native ACL isolation or sudden-power-loss proof;
no same-uid/root isolation or cryptographic server authentication is promised.
Node's observed `server.close()` unlink of a replaced socket leaf is explicitly
unresolved, not disguised as safe owned cleanup. See
[the P2b.1 contract and evidence limits](../../docs/DESKTOP-P2B-LOCAL-CONNECTION.md).

Tests: `pnpm exec vitest run packages/adapter-pi/src/managed`. These use temporary
filesystem targets/UDS only and include a deliberately killed test subprocess.
No real pi installation, configuration or process is used.

### Internal native/Worker integration (not production activation)

Internal `native/managed-darwin/` and `src/managed/{native-darwin,darwin-policy}.ts`
provide C Node-API primitives. Later `darwin-files-port.ts`, `service.ts` and
`worker/` integrate native storage with the existing Core/AuthStore in fixtures;
this is no longer merely an unintegrated read/lease slice. B4.3 has historical
Electron Worker evidence; B4.4a has staged-resource evidence, not a packaged app.
There is still no public native activation, Main managed wiring, managed extension
deployment or recovery API. Full production security gates remain unverified;
D6.1 is a completed bounded harness, not D6 admission. See
[stage evidence](../../docs/DESKTOP-P2-IMPLEMENTATION.md) and
[filesystem/D6 boundaries](../../docs/DESKTOP-P2B2-FILESYSTEM-POLICY.md).

Explicit developer-only commands (existing Darwin compiler/SDK/matching installed
Node headers required; no downloads or runtime compilation):

```sh
pnpm --filter @agent-pet/adapter-pi build:native:darwin
pnpm --filter @agent-pet/adapter-pi test:native:darwin
```

The native suite is separate from `pnpm test`; generated binaries stay in ignored
`out/`. The test-only ACL fixture writer is not a shipped product helper.
