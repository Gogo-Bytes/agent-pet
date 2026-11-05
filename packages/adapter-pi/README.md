# pi read-only adapter

This package receives a local newline-delimited JSON bridge. It never starts/resumes
pi, reads Session JSONL, sends prompts or writes Agent configuration. Current priorities
are in [MVP](../../docs/MVP-EXECUTION-PLAN.md); legacy and dormant managed protocols are
separate, not fallback security modes.

## Legacy bridge

`PiBridgeAdapter` takes an explicit endpoint/token from authorized desktop setup or the
separate dev environment route; it listens on UDS or the Windows named-pipe abstraction.
The abstraction does not certify Windows security/compatibility. The self-contained
[extension](../../integrations/pi-extension/README.md) owns native pi event interpretation.

Frames carry schemaVersion, capability token, monotonic seq, process/Session identity
and sentAt. Kinds include hello (working/idle/name baseline), lifecycle, metadata,
companion facts/capabilities and optional heartbeat. Unknown fields are rejected; no
prompt, response, tool body, transcript, provider credential or raw vendor payload is
accepted. The frame token is bridge authentication data, not a provider credential.

Authenticated peers count as online only after valid hello. Multiple peers in one
configuration preserve independent Session ownership; partial peer exit does not mark
the configuration offline. Only hello admits a new owner, not unread-preserving baseline
metadata; superseded updates/close cannot reclaim it. Distinct start calls own distinct
peer sets. Same-socket identity replacement clears the old Session before new baseline.

Unauthenticated idle peers time out; authenticated idle timeout is disabled for old
extensions that do not heartbeat. Heartbeat is optional metadata, not a negotiated lease
or a dead-process detector. Resource/frame/rate bounds remain in the executable protocol.
Transport loss clears current activities, not already-held unread; reconnect never replays
offline completed/error into fresh unread. stop fences buffered observations/late callbacks,
drains its server and emits one final disconnect; repeated stops share completion.
Open Session remains unsupported until the original terminal can be reliably located.

## Dormant managed mechanism

`@agent-pet/adapter-pi/managed` exports createManagedPiService/connectManagedPiClient,
but both reject `acl-unverified` **before parameter inspection, filesystem or socket
activity**. productionPolicy also rejects. No activation flag, Main managed wiring,
managed extension deployment, automatic recovery or legacy fallback is available.

Internal Core/AuthStore/FilesPort implement per-target pending/enabled/revoked authority,
scoped credentials, durable claims/transactions, discovery, auth/ack and bounded real UDS
against fixtures. Credential existence never grants admission. Revoke immediately denies/
closes peers, then persists, then selectively cleans; uncertainty retains a durable barrier.
Native storage/Worker integration exists internally, not as a production promise.

[Security boundaries](../../docs/SECURITY-BOUNDARIES.md#休眠-managed-核心) own the protocol,
receipt/transaction/OwnerClaim order, descriptor and ACL policy, Worker fencing and limits.
**Full D6 remains BLOCKED** despite the current-account harness. Mode/owner/ACL fixtures
cannot prove other-user denial or power-loss durability. No same-UID/root sandbox or
cryptographic server authentication is promised. Node Server.close may unlink a replaced
socket leaf; this remains an explicit unresolved production boundary, not safe owned cleanup.

## Development checks

```sh
pnpm exec vitest run packages/adapter-pi
pnpm --filter @agent-pet/adapter-pi build:native:darwin
pnpm --filter @agent-pet/adapter-pi test:native:darwin
pnpm test:d61
```

The explicit native suite needs existing Darwin clang/SDK/matching installed Node headers,
with no downloads/runtime compilation. Generated addon output remains ignored; the ACL
fixture writer is test-only, not a product helper. Native tests are separate from ordinary
Vitest. Synthetic Core/UDS and self-owned processes are not real pi/native GUI acceptance.

D6 runner exit1 means failed/incomplete, exit2 means blocked (including prerequisites),
never production admission. Its sanitized evidence excludes credentials/token hashes,
raw errors, account identities and production paths. The harness deliberately retains a
lease-death owner barrier even when invoked through full tests; it must not be swept away.
Unknown objects, pending work or cleanup uncertainty preserve fixture roots after handles/
children settle. [D6 rules](../../docs/SECURITY-BOUNDARIES.md#d6-与生产发布延期未通过)
apply to tests too; deleting documentation does not authorize deleting fixtures or guards.
