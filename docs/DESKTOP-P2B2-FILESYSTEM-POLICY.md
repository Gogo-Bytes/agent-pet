# P2b.2a — native filesystem primitives (dormant, incomplete P2b.2)

**This is the approved bounded P2b.2a slice, not P2b.2 completion, production activation, recovery approval, or permission to proceed to P2c.** Public managed service/client entrances and `productionPolicy` still unconditionally reject `acl-unverified`. There is no activation flag. No Main, renderer, preload, extension, installer, real pi configuration, home/cache resolver or Agent execution was added.

P2b.2a baseline status: implementation, independent code/retrievability review and parent-run verification complete for that bounded slice; no blocking slice findings. The resource/lifetime prerequisite below is a subsequent reduced-scope change; independent review found no issues within that reduced scope. Production gates below remain open.

## Resource/lifetime prerequisite after `22f866f` — not P2b.2b integration

The supervisor explicitly approved this smaller repair **before edits/build/tests**, after the worker escalated that the complete P2b.2b integration could not be safely delivered within its execution budget. This is the sole accepted reduced implementation scope, not a safe-write/transaction delivery. The full approved P2b.2b design (native transactions → shared authorization/core/client → synthetic-only UDS → Application) remains the follow-up plan; **all of that integration is outstanding**. No speculative port, new native method/version, mutation, bootstrap, recovery or production activation was added.

Concrete red evidence on rebuilt baseline C:

- The historical-open test retained closed wrappers and failed with `handle-limit` before completing 600 explicit open/close cycles. This was the documented 256-wrapper usability limitation, not a newly discovered isolation exploit.
- 65 simultaneously open fixture roots retained **260 actual descriptors** (four pinned segments per root), below the old 256-wrapper ceiling. Thus that ceiling did not establish a 256-descriptor budget. The baseline was still finitely bounded by its wrapper/segment limits.
- Both new tests failed; the existing 11 native tests passed. Evidence: `/tmp/agent-pet-native-resource-red.log` in this development run.

The C implementation now independently tracks at most **256 active capabilities**, **256 owned descriptors**, and **4096 allocated native wrappers** per addon environment. Root ancestors each consume a descriptor; the root fd alias is counted/closed only once. Allocation/open refusal happens before exceeding the relevant budget; partial walks and failed opens/flocks return their acquired resources. Explicit close immediately frees active capacity and successful-close descriptor capacity, idempotently. Wrapper memory/parent references remain counted until finalization, so holding arbitrarily many closed wrappers still fails with `wrapper-limit`; this is not an unlimited no-GC guarantee. Closed wrappers cannot decrement live counts again during GC. These are addon/environment limits, **not process-wide/OS-wide fd limits**; separate Workers have separate budgets.

A syscall close failure still returns `close-uncertain`, never retries the fd number, and conservatively retains that descriptor's budget charge until environment teardown. This prevents uncertain close from freeing capacity speculatively; it cannot prove the underlying fd or lock was released. No close/allocation/N-API fault injection was added, and those failure branches are not dynamically proven by these tests.

New isolated resource tests enumerate `/dev/fd` names for relative count measurements without opening/reading descriptor contents. Local `fd(4)` and `close(2)` were inspected; no private syscall or dependency is used. They verify 600 retained-wrapper explicit-close cycles without GC, the exact 256-fd ceiling, 300 failed partial root walks with capacity recovery, 4200 failed root/child/argument calls without fd leaks, segment-limit rollback, the 4096-wrapper ceiling and GC recovery without double accounting, ordinary live-handle GC, and 600 failed flocks. Existing root-close/GC/process/SIGKILL lease tests remain. New real Workers acquire the fixture lease, close the parent root and discard the JS lease reference; an independent process remains busy until normal or forced **Worker environment teardown**, then acquires the same inode while the host remains alive and the fixture `owner/` remains. These Workers are test fixtures, not the future asynchronous core architecture.

Current verification: the parent independently rebuilt the addon and reran **19/19 native tests; 38 files / 366 Vitest tests; typecheck; desktop build; whitespace check**, all passing. The reviewer inspected the complete reduced diff and evidence but did not execute tests. Native output remains ignored. Existing Three.js duplicate-import warning persists. Validated sources are committed as a separate local repair; no push, dependency changes, account/system changes or real configuration access. Desktop build is not Electron addon loading evidence. Native syscall fault testing, API-v2 guarded mutations/durability, real native-backed authority transactions and vertical Application integration remain unimplemented; current-uid fixture tests are not cross-user isolation evidence. The original production gates at the end of this document are unchanged.

Baseline: `5dcfb8076f6c47bfa854c5bbb84ecf25587f1f07`. Supervisor approved the dependency-free, nonprivileged C Node-API form and the smaller inspection/rooted-read/lease slice **before edits or compilation**. No dependencies were installed. Recovery/revoke-all remains a proposal requiring owner approval; this slice contains no recovery/reset API, ownership-manifest transaction, authority mutation, claim removal, or namespace decision.

## Implemented, and deliberately not integrated

| Path | Responsibility |
| --- | --- |
| `packages/adapter-pi/native/managed-darwin/managed-darwin.c` | Opaque directory/file/lease handles; component-wise `openat`; exact fd evidence; bounded reads; existing-inode `flock` |
| `native/managed-darwin/build.mjs` | Explicit developer-only build with existing `/usr/bin/clang` and matching installed Node headers; no download or automatic runtime build |
| `src/managed/native-darwin.ts` | Internal fixed development-resource loader and typed versioned primitives; no public package export or arbitrary addon-path argument |
| `src/managed/darwin-policy.ts` | Conservative, role-specific ACL/owner/mode/mount acceptance of fresh evidence |
| `native/managed-darwin/{native-check,lease-child,resource-child,lease-worker}.mjs`, `fixture-acl.c` | Isolated native/resource/Worker tests and separately compiled test-only ACL fixture writer; the fixtures are not product helpers |
| `src/managed/darwin-policy.test.ts` | Explicitly synthetic policy decisions; not native isolation evidence |

The old `PrivateFiles`, service, client and authorization store are **unchanged**. In particular, their pathname mutations did not become descriptor-rooted merely because native evidence now exists. Native primitives are not wired into the old policy seam. No new claim that the dormant P2b.1 service is ACL-secured is made. Queued revoke/rotate versus stop poison, module-lifetime publication revision, no offline replay, durable barriers, and the final clean claim-release exception remain as documented in [P2b.1](DESKTOP-P2B-LOCAL-CONNECTION.md).

## Descriptor and resource contract

- Root input is an explicit canonical absolute path, at most 4095 UTF-8 bytes / 64 directory segments. No `realpath`, OS home lookup, `confstr`, environment override or symlink exception. `openat` walks with `O_DIRECTORY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC` and retains every ancestor descriptor.
- Child names are single nonempty components, at most 255 UTF-8 bytes, without slash/NUL/`.`/`..`. A type-tagged native object is required; plain objects, wrong kinds and closed handles fail. Children retain parents; explicit parent close invalidates descendants, without releasing their still-open lease descriptors.
- Root/parent/leaf identities are rebound using `fstat` and rooted `fstatat(..., AT_SYMLINK_NOFOLLOW)` before/after inspections and reads. Detached/replaced roots/parents/leaves fail. Identity uses BigInt dev/ino/link count/size; signed BigInt nanosecond timestamps are range-checked rather than truncated. Evidence also includes uid/gid/mode, ACL entries/principal UUIDs/flags, filesystem type, fsid pair and mount flags.
- Regular child opens require current uid, exact 0600, regular type, one link and size <=256 KiB; directory children require current uid/0700. Root/ancestor acceptance is a separate TS policy decision, not automatically granted by `openRoot`.
- Bounded reads use `pread` on the inspected descriptor with a max+1 limit, unchanged size/link/mtime/ctime and root binding checks, and return before/after evidence alongside bytes. They **do not authorize secret use**: a future integrated caller must accept the complete ancestor/private policy and fresh operation evidence before admission/publication/token transmission. Ancestor ACLs are available through `ancestors(root)`, not silently cached as verified.
- Resource prerequisite supersedes the original 256-total-wrapper rule: at most 256 active capabilities, 256 owned descriptors (including ancestors), and 4096 allocated wrappers per addon environment; max ACL entries 128. Explicit close frees active resources, not wrapper memory; finalization frees wrapper capacity. Close is idempotent; an explicit syscall close failure reports `close-uncertain` and retains its conservative descriptor-budget charge without retrying a possibly reused fd. GC closes ordinary handles; a lease has a native strong self-reference until explicit close or environment/process teardown. No raw fd is exposed. All error messages/codes are fixed, without paths, secret values or raw OS messages.
- These calls are synchronous and kernel I/O may stall. Test subprocess timeouts bound tests, **not arbitrary kernel syscall cancellation**. Bounded asynchronous work, queued-work/lease lifetime and poison integration are still required before Main use. This is not a same-uid sandbox.

## ACL absence: positive public API evidence, not errno guessing

Actual pristine APFS fixtures exposed an important Darwin API detail: `acl_get_fd_np(fd, ACL_TYPE_EXTENDED)` returned NULL/ENOENT, rather than an allocated zero-entry ACL. The installed `acl_get(3)` man page alone did not justify accepting this as empty. An investigated `fgetattrlist` query omitted `ATTR_CMN_EXTENDED_SECURITY` on pristine fixtures; omitted attributes can also mean unsupported. **Neither result was converted to ACL acceptance. No getattrlist decoder or fallback ships.**

The implemented minimal chain is public `filesec_init` → successful `fstatx_np(fd, ..., filesec)` → successful `filesec_query_property(FILESEC_ACL)` → `filesec_get_property(FILESEC_ACL)` only when present. Each call's failure stays a failure. A fresh filesec object, pre/post fd metadata, local APFS and ownership-enabled mount evidence are required. Nonzero query output is truth, not assumed to equal 1 (actual present value was 32). Present ACLs are freed with `acl_free`; filesec objects with `filesec_free`. No `FILESEC_ACL_RAW`, private syscall, or internal struct access is used.

Source rationale is the official Apple Libc tree pinned at `71bbe350ab79eef58113991d817ccc6165061a64`:

- [posix1e/acl_file.c](https://github.com/apple-oss-distributions/Libc/blob/71bbe350ab79eef58113991d817ccc6165061a64/posix1e/acl_file.c): `acl_get_fd_np` conflates the extended-stat and property-get stages.
- [gen/filesec.c](https://github.com/apple-oss-distributions/Libc/blob/71bbe350ab79eef58113991d817ccc6165061a64/gen/filesec.c): `filesec_get_property(FILESEC_ACL)` reports ENOENT when its valid bit is absent; public `filesec_query_property` separates that state from a failed syscall.
- [sys/statx_np.c](https://github.com/apple-oss-distributions/Libc/blob/71bbe350ab79eef58113991d817ccc6165061a64/sys/statx_np.c): successful extended stat populates filesec properties and clears ACL validity when no ACL is recorded.

Supervisor supplied this official-source reconciliation. Local declarations: macOS 14.4 SDK `sys/stat.h:416`, `sys/fcntl.h:578–623`, `sys/acl.h`. Published source is **not proof that it exactly matches the installed binary**. Runtime corroboration here is only Node 22.22.3 / Darwin 25.1.0 arm64: pristine and explicitly empty ACL fixtures reported absent; deny/allow fixtures reported present; removing an ACL returned to absent. This is a scoped “no recorded ACL” result on supported APFS, not a universal filesystem claim or atomic snapshot under hostile same-uid mutation.

Present ACLs use official `acl_get_entry`, tag/qualifier/permission-mask/flag APIs. Darwin iteration returns **0 for an entry**, `-1/EINVAL` at end, not Linux's positive-success convention. Tests cover 1, 3 and 128 entries. All 32 flag bits are queried through the public API; unknown flags/tags/permissions fail policy. No text parser or principal/group membership inference is used.

## Conservative ACL and APFS policy

Sensitive directories/files retain exact owner/mode/type/link checks. Any allow ACE is rejected, including inherited and inherit-only allows. Recognized deny-only ACLs are accepted **subject to successful actual operations**. Ancestors may have deny-delete ACLs or read/search-only allows; allow rights for write/add-file, append/add-directory, delete/delete-child, attributes/xattrs/security writes or owner changes are rejected regardless of principal. Unsupported configuration does not mean “proven compromised.”

Policy accepts known ACL permission bits `0x103ffe`, entry inheritance flags `0x1f0`, and global NO_INHERIT `0x20000`; deferred inheritance and unknown semantics fail. This is conservative access-policy acceptance, not a complete effective-rights interpreter. Successful access by the current uid is never proof of denial to another uid.

`fstatfs` must identify **local APFS with ownership honored**. TS common tolerated flag mask is `0x9d90f09e`: synchronous, noexec, nosuid, nodev, cprotect, local, quota, rootfs, deprecated dovolfs, dontbrowse, journaled, no-user-xattr, multilabel, nofollow, noatime, strictatime. Private writable objects additionally reject readonly and snapshot. Ancestors may be readonly/snapshot (`0x40000001`); each segment keeps its own fsid, rather than requiring system/data volumes to be identical.

Installed public `sys/mount.h` defines CPROTECT as content-protection support, MULTILABEL as individual MAC-label support, and DOVOLFS as deprecated volfs support. These three feature bits were separately reviewed/tolerated after actual fixture mask `0x04909080` was observed. They neither prove isolation nor bypass other checks; MAC/content protection failures remain failures. DOVOLFS acceptance is **not** alternate-namespace security validation. Ignore-ownership, nonlocal, union, async, exported, deferred writes, automounted and every unknown bit remain rejected. APFS acceptance is not fsync/power-loss certification.

The fixture root's actual ACL/mount evidence passes private-directory policy. Its full temporary ancestor chain is **not a production-root approval**: `/private/tmp` is shared sticky, and this slice has no sticky-ancestor policy exception. Native ancestor inspection works, but production namespace/system-alias policy is deliberately unresolved.

## Writer lease is not crash recovery

`acquireWriter(root)` opens only the existing empty private `writer.lock` inode and takes nonblocking `flock(LOCK_EX | LOCK_NB)`. It does not create, unlink, rename, repair or recreate a lock. Tests provision one explicit fixture inode; production lock initialization and namespace are not implemented. Contention, unsafe objects, missing files and failed opens never mutate the inode. All cooperating writers must eventually use the same stable lock namespace, independent of app copies/channels.

Actual tests cover same-process duplicate opens, independently opened process descriptors, a live nonresponding holder, explicit close, GC, child-process exit and SIGKILL. The subsequent resource prerequisite additionally verifies normal and forced Worker/environment teardown while the host process stays alive (see above); this does not implement asynchronous core/Worker ownership or cancellation. Closing the parent root alone does not release the live lease. Process death releases the lock, while a synthetic `owner/` remains untouched. **This does not implement recovery or prove writer exclusivity for P2b.1, which is not integrated.** A kernel lease must complement, never replace, the durable uncertainty barrier.

## Evidence and reproduction

The counts/review history in the bullets below describe the original P2b.2a delivery. The subsequent prerequisite's red/green results and pending review status are recorded above; the reproduction commands remain the same.

Existing tools only: Apple clang 15.0.0 (`clang-1500.3.9.4`), macOS SDK 14.4, installed matching Node 22.22.3 headers; arm64 build, Node-API 8, deployment build target macOS 11. The build target is not runtime support evidence for macOS 11, x64, Electron or a packaged app. Build output is under ignored `native/managed-darwin/out/`; no binary is part of the patch.

```sh
pnpm --filter @agent-pet/adapter-pi build:native:darwin
pnpm --filter @agent-pet/adapter-pi test:native:darwin
pnpm test
pnpm typecheck
pnpm --filter @agent-pet/desktop build
git diff --check
```

- Native suite: **11 tests passed**. Actual APFS/ACL APIs, rooted reads and replacement rejection, malformed args/forged handles, symlink/FIFO/hardlink/mode rejection, lease concurrency and killed subprocess. Native policy checks use the actual TS policy against real evidence. Separately labeled Vitest policy fixtures cover rejected mount/ACL combinations and a synthetic >2^53 inode; no claim that the machine produced that giant inode.
- Full regression: 38 files / 366 tests (335 existing + 31 new policy tests). Existing Three.js duplicate-import warning remains. Desktop build/typecheck pass; building the desktop is **not native Electron loading evidence** because production never imports the addon.
- Initial diagnostics failed closed on absent ACL; resolved with the public filesec chain. Early native test failures corrected a normalized-boolean query assumption, a root-ancestor-count assertion, and cleanup of an inherited deny-delete fixture. The latter genuinely prevented `rmdir`; cleanup now clears ACLs only on explicitly tracked owned fixture objects through the test helper. The single known leftover was removed. No ancestor ACL was changed.
- The parent independently reran both native commands, all 366 regressions, typecheck, desktop build and whitespace checks successfully. The independent reviewer inspected source/evidence but did not execute those commands. Native failure-injection, allocation/close/resource-exhaustion and concurrent ACL/mount mutation coverage is not exhaustive.
- No dependency graph/lockfile change, installation, real config/secret/session access, endpoint discovery, GUI/App/pi launch, sudo/account manipulation, or service/login/keychain work. All native data/ACL changes are synthetic fixture-only. Validated sources are committed locally as an independent stage; no push or native binary commit.

## Hard gates retained before P2c or production

1. Integrate descriptor-rooted creation/publication/replacement/removal/sync on inspected capabilities; bind complete fresh ancestor/leaf evidence to each operation and lifecycle. No shim that checks native ACL then mutates by Node pathname.
2. Define stable production authority/lock/runtime namespaces and reviewed aliases without implicit cache/home mutation; production lock provisioning, claim manifest and persisted discovery ownership intent are missing.
3. Obtain owner approval for any revoke-all recovery consequence, then implement bounded preview/consent freshness, lease fencing, durable revocation/cleanup and full crash matrix. Missing/corrupt/legacy authority must remain blocked. No reset/new authSetId proposal was implemented.
4. Actual socket-leaf ACL inspection/identity binding and Node/Electron token-zero-byte tests are missing from this slice. Socket pathnames cannot be opened as ordinary fds; no O_EVTONLY workaround exists here. P2b.1 Node `Server.close()` replacement-leaf unlink remains unresolved and needs explicit review acceptance under verified private directories.
5. **Dedicated cross-user evidence is mandatory, not a release footnote.** Smallest owner-authorized test: in an isolated fixture workspace, use an **existing second ordinary account** (owner-authorized login/session, not sudo/account creation in this run) to attempt directory traversal, synthetic credential/discovery reads, and a real synthetic UDS connection. Include a separately permitted ACL-positive-control fixture granting that uid the tested access and demonstrate the test detects it; then restore fixture isolation and show actual denial. Owner/mode mismatches and this run's current-uid allow/deny ACLs are not substitutes and imply nothing about malicious same-uid security.
6. Native async/cancellation/handle lifetime integration; injected native syscall/error branches and race fault coverage across managed transactions; supported Node/Electron/OS/architecture matrix; installed resource location, signing/library validation, packaging and external-Node delivery. No runtime downloads or arbitrary addon locator.
7. Ordered fsync/F_FULLFSYNC and failure behavior on the supported filesystem, with accurate power-loss limitations. This slice has no native write/sync publication API and makes no new durability claim. Process kill is not power loss or snapshot anti-rollback.

Other ordinary OS users remain the target isolation boundary. Malicious same-uid/root actors, complete snapshot rollback, and atomic socket authentication are not promised. Default public managed activation remains blocked until the required security evidence **and** integration/consent/release gates are actually satisfied and reviewed.
