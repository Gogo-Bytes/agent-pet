# Desktop development

当前范围、进度与下一步见 [本地 macOS/pi MVP 执行计划](../../docs/MVP-EXECUTION-PLAN.md)。此页开发命令不是安装许可；完整真实端到端仍待验收，managed 入口仍关闭。

## Desktop overlay refinement (2026-10-15)

Desktop App uses one R3F Canvas with mesh hover events. The overlay has no pet-name
label; the legacy stored `names` key remains readable for schema compatibility.
The canonical material is `src/renderer/shared/ui/Glass.tsx`/`glass.css`, shared
with management. The overlay uses GlassToolbar/GlassAction and panel GlassButton,
with a high-contrast variant and compact shared elevation. The compact glass toolbar waits for Main's native mouse-region acknowledgement,
keeps a short model-to-controls handoff, and releases on blur/hide/unmount.
Main owns hit testing and applies the macOS nonactivating panel/workspace/topmost
policy on show/restore. Other apps' full-screen/Spaces behavior needs native acceptance.

The new package is staged, not substituted for the running user app, so its pi
receiver stays intact. Commands, screenshots and native automation limits:
[overlay evidence](../../docs/DESKTOP-OVERLAY-REFINEMENT-ACCEPTANCE.md).

## Local macOS packaging (M5)

The authorized local packaging path uses `electron-builder@26.15.3` and the existing
Electron/Vite output. It targets the current Apple Silicon host (`arm64`) and emits
an unpacked `Agent Pet.app` outside the source tree when `AGENT_PET_BUILD_DIR` points
to a fresh directory:

```sh
AGENT_PET_BUILD_DIR=/tmp/agent-pet-m5-unique pnpm package:mac
```

The package contains the Electron runtime, bundled Main/preload/renderer output and
`starter.glb` in `app.asar`; it does not bundle pi, managed Worker/native code, source,
or workspace dependencies. The package has no signing identity configured. Local
execution may therefore be blocked by Gatekeeper, and a successful local smoke is
not a signed/distributed-app acceptance. Packaging does not read HOME/pi config or
start a bridge unless the user explicitly performs the existing setup; the smoke
check uses a fresh profile with the pi bridge environment unset.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @agent-pet/desktop dev
pnpm --filter @agent-pet/desktop build
```

Main and sandboxed preload are bundled as CommonJS (`out/main/index.cjs`,
`out/preload/index.cjs`). Workspace runtime dependencies are bundled into main;
the application does not require Node to execute workspace TypeScript.

## Renderer entrypoint and verification boundary

`src/renderer/index.html` loads `src/renderer/main.tsx`: one React root, R3F/Drei
Canvas, and feature CSS Modules with shared tokens. The former imperative
`index.ts`, scene wrapper and `style.css` have been removed. Main remains the
window-layout and hit-policy authority; Application owns Session/unread state.

The renderer loads the bundled project-authored `starter.glb` robot with embedded
animations. The opt-in pi Adapter is wired to Main; without valid configuration, the initial Session snapshot is empty. No other Agent
is connected. Tests exercise the actual pi extension over isolated local sockets,
not a running pi TUI.

See `../../docs/RENDERER-R4-ACCEPTANCE.md` for current automated checks, historical
user/native evidence and pending acceptance. Windows, hardware GPU/power and the
full native-window matrix remain unverified; a build or DOM test is not native
acceptance.

## Real pi connection verification (2026-10-14)

The actual packaged app and installed pi 0.85.1 passed isolated A/B deployment,
idle hello, concurrent peers, independent configurations, rename persistence,
explicit resume after clean app restart, saved disablement and selective withdrawal.
Persisted disabled copy stays accurate after explicit inspection and preserves
resume errors. Full tests: 630 passed / 1 skipped; typecheck/build/package passed.
See [real pi evidence](../../docs/PI-LIVE-CONNECTION-ACCEPTANCE.md) for actual screenshots,
final package, retained data and the first pi startup tool-download scope violation.
This does not accept real model-task/error matrices, login-item changes, GPU,
imports, managed production safety or release.

## Formal management UI (2026-10-14)

Finder-launched installation discovery includes the fixed `$HOME/.nvm/versions/node`
directory (64 entries, newest 16 version directories) as well as the bounded GUI
PATH and standard bins. It reads installation metadata only, never executes pi,
loads shell profiles or reads daily `.pi` credentials. Partial scans remain visible.
Discovery groups supported pi installations sharing the Main-resolved default
configuration into one action. A scoped in-page dialog shows Main's default target
and asks read consent before `prepareDetected(scanId, requestId)` accepts a current,
verified host scan ID and resolves `$HOME/.pi/agent`. Main then
revalidates the installation and prepares the existing deployment preview. Users
do not choose a folder, type, or name. The separate preview confirmation still
owns deployment/listening; cancel creates no extension. Once approved preparation
saves non-secret configuration metadata, cancelling its preview retains that
unconnected record for retry. Project/custom targets retain the manual flow.
Main invalidates pending preparation on close/navigation; cancellation uses a typed
request id and releases both the visible wait and IPC reply independently of delayed
IO. The underlying filesystem reader stays single-flight until it settles. Late
work/cancellation revokes only its matching preview id, preserving newer previews.
Checks accept bounded additive string package sources under the verified pi 0.85.1
loading semantics without executing or modifying them. Nonempty top-level extension
rules, unknown package shapes, ignore and ownership guards remain. Actual daily
configuration was inspected read-only; deployment was deferred by the user. See
[rules/cancellation evidence](../../docs/PI-RULES-CANCEL-ACCEPTANCE.md).
Missing owned extensions yield `already-absent`:
clear the validated private receipt and product configuration without deleting target
directories or unknown files. Unreadable, replaced and edited paths retain safeguards;
failed persistence cannot report successful removal. See
[discovery/removal verification](../../docs/PI-DISCOVERY-REMOVAL-ACCEPTANCE.md).

On macOS, management uses the native `hiddenInset` title bar with system traffic
lights at the upper left. The shared header reserves their space and fills the
window without a second outer frame. Native close keeps the existing background
preference behavior. Other platforms retain the HTML window-control fallback.

`management.html` / `management/main.tsx` now render the approved four-page companion
interface: home, pets, connections and settings. The former Radix admin layout is
replaced; shared controls, Icons and glass materials live in `management/components`.
The production renderer never imports `prototype/` or a mock bridge.

`createManagementStore` owns one subscription per settings/configurations/session
channel. `CompanionScene` keeps one Canvas across home and pets, uses the real cached
starter GLB, and separates instance transforms/mixers from shared asset resources.
HomeScene owns the multi-configuration floor and selection; PetPreviewScene contains
only the centered audition pet with responsive camera framing. Names edit directly
at the upper-left heading. GlassDrawer uses shared material, scene bounds, native
modality through exit, reduced-motion closure and opener focus restoration.
See [revision evidence](../../docs/PET-SCENE-REVISION-ACCEPTANCE.md) for real screenshots,
final package and limits.

Home projection preserves configuration identities and only includes online pi
connections. HTML keyboard focus and model clicks use the same projection.

Main's `Configurations` + bounded non-secret `ConfigurationsStore` hold independent
named configurations; pi uses separate existing PiConnection/PiConnectionStore
instances with configuration-scoped Session IDs. Legacy saved deployments remain
explicitly represented. Availability, peer connection and task status are distinct.
Native-selected or separately approved pasted locations are canonicalized without
following symbolic links; duplicate targets are blocked. Deployed targets cannot be
silently retargeted. Removal selectively withdraws only unchanged owned files and
keeps changed/unknown data and retryable records.

Preferences schema v2 migrates v1 on read, saves atomically, and applies rendering,
entry/lifecycle, pet and reminder options. Main enforces at least one Tray/Dock entry;
failed Dock show retains Tray. Login remains an explicit system API operation.
Restore defaults preserves configurations, assets, bindings and pet name. Size
changes save the final release/keyboard value rather than dropping a drag mid-save.

Run formal Electron with `pnpm --filter @agent-pet/desktop dev`; default startup keeps
the console closed, so use the Tray/Dock entry. Build with
`pnpm --filter @agent-pet/desktop build`. For isolated browser UI checks only:

```sh
pnpm exec vite --config apps/desktop/vite.management-review.config.ts
# http://127.0.0.1:4175/management-review.html?case=online  (empty/error also supported)
```

That entry imports actual formal components/CSS/GLB but injects a test-only in-memory
bridge; it cannot deploy or start a receiver and is excluded from Electron rollup.
See [formal migration evidence](../../docs/MANAGEMENT-MIGRATION-ACCEPTANCE.md) for
screenshots, commands, native interaction limitations and remaining capabilities.
Only pi and one bundled pet are truly implemented; imports/new Providers and
automatic project-configuration discovery remain gaps, accurately shown in UI.

The scan result now keeps configuration identity/actions above a separate native
installation disclosure. Two installations sharing a default target produce one
action; saved targets open their existing configuration. Narrow windows place the
action on its own row. Actual Electron screenshots, keyboard checks and test-boundary
responsive evidence: [scan UI revision](../../docs/PI-SCAN-VISUAL-ACCEPTANCE.md).
This UI review does not authorize or certify a daily pi deployment.

Connection details use the right pane directly, with inline renaming and separate
inspection, location and connection-management sections. Deployment review and
removal confirmation retain their existing semantics. See the
[flat detail UI evidence](../../docs/CONNECTION-DETAIL-FLAT-ACCEPTANCE.md) for
responsive checks, staged package and native verification limits. The user's
currently connected app was kept running; switching to the new package is pending.

## pi detection and read-only preflight (P2a)

Historical P2a APIs expose detect/rescan, installation and target pickers and explicit
inspection. The current formal page uses **自动扫描** for supported installation
candidates and **手动添加** for native-selected or explicitly approved pasted targets. Selecting a directory alone
does not read its settings. The default `~/.pi/agent` is only a candidate, not a
claim about the active terminal's configuration. These P2a controls install or change nothing.

Detection probes at most 32 GUI PATH entries plus three fixed bin locations;
it never runs pi, wrappers or shell profiles, scans processes/sessions, or calls
pi's package resolver. Only standard `@earendil-works/pi-coding-agent` **0.85.1**
package metadata is recognized as verified; other versions remain unverified.
This is metadata identification, not signature validation or proof of a running
Agent. The retained historical installation-picker API expects the package directory
containing `package.json`; it is not a control in the current four-page UI.

Read-only inspection reports root-entry/manifest and same-name conflicts, unsafe
paths/files and bounded-read failures. Existing ignore files and nonempty or
unsupported settings extension/package rules are **unknown**, not approximately
parsed into a green result. No raw settings or errors cross the narrow management
IPC. Cancelled or stale requests cannot replace a newer target.

The P2a section itself makes no deployment or online claim; the separate M2 section
below supplies explicit consent and connection status. Existing env opt-in remains. See
`../../docs/DESKTOP-P2A-PREFLIGHT.md` for exact budgets, automated evidence and
remaining native picker, ACL, filesystem-race and release gaps. Native dialogs
are not accepted through mocks. Main now provides Tray/Dock entry controls and a
last-entry guard; actual native settings and full recovery acceptance remain separate.

## Explicit desktop pi deployment (M2 partial)

The connection page now offers a bounded local opt-in flow:

1. Use **手动添加 → 选择位置** to choose an existing pi agentDir; pasted absolute paths
   require a native exact-scope approval. Verify type/location and name the configuration.
   Selection alone does not read settings; no default candidate deploys automatically.
2. **预览接入改动** authorizes bounded reads of fixed configuration and
   metadata only. Review the precise `extensions/agent-pet.ts` path, directories,
   conflicts and loading conditions. Cancel writes nothing and opens no listener.
3. **确认部署并开始接收** exclusively creates the private extension (0600) and starts
   the existing legacy Adapter using the same Main-generated configuration. No manual
   environment export is needed for this flow. Main owns token, endpoint, source and
   single-use plans; none are exposed through Renderer/IPC/logs. Closing/reloading the
   window, changing target, cancelling or requesting a new preview invalidates old ids.
4. Only the user may safely open/reload pi. The root must actually be active, extensions
   enabled and project trust satisfied where applicable. This flow does not change
   settings/ignore/trust, launch pi, reload it, or control Agent work.

Status distinguishes not configured, configured/waiting, connected, disconnected and
failed. Connected means the latest token-validated legacy hello; it is not managed
ack/auth, aggregate health of all peers, or real business-state acceptance. Observations
feed the existing Application/pet, with Open Session still unsupported.

The listener uses an exclusive 0700 short random directory under `/tmp`, not a long
userData/TMPDIR socket path. Startup never unlinks an unknown socket or configuration.
Quit waits for pending operations and Adapter stop, retaining the original runtime directory,
configuration and ownership for a **clean desktop restart**. No target is read and no desktop
listener starts automatically at startup: Main only reads bounded private metadata at
`userData/pi-connection/connection.json` for legacy, or per-record
`userData/configuration-<UUID>/pi-connection/connection.json` (0700 directory / 0600 file). The confirmation
preview discloses this persistence policy before deployment. Credentials never enter ordinary
preferences, IPC, logs, Renderer or the application bundle.

After restarting, choose **恢复已保存连接** to validate the original runtime directory,
absence of any existing endpoint, and the installed file's identity/metadata/content digest.
Resume uses the identical endpoint/token and the same installed extension, without environment
exports or redeployment. **停用接收并保留文件** stops the listener and persists disabled
state. Even when saving fails, the next launch never auto-listens. The UI separately reports
receiving state, saved state and partial failures; failed stop does not claim disabled reception.

**移除配置 → 确认移除** stops receiving, saves disabled state, then selectively removes
only the matching owned file. Edits, replacements, unknown entries and nonempty directories
are retained; failed-preserved withdrawal remains retryable. Successful removal and metadata
publication allow selecting/previewing a new setup in the same process. A failed publication
blocks reconfiguration instead of pretending the record was cleared. Stopping/removing does
**not** unload an already running pi extension; safely close/reload pi yourself.

This is clean-restart usability, **not crash recovery or reboot resilience**. `/tmp` loss,
system reboot, a changed/missing runtime directory or an existing stale/unknown socket makes
resume fail visibly. It never reconstructs the runtime or steals/unlinks an endpoint to resume.
Corrupt, foreign, symlinked, permissive or unknown-version records and incomplete saves fail
closed without wiping, resetting or adopting old artifacts. Uncertain writes retain pending
metadata and usable in-memory ownership; a preserved pending record prevents a new startup
from assuming publication completed. Separately authorized manual handling may be needed.
Old process-only deployments without a saved receipt are never adopted. The fixed-purpose
store is not a new AuthStore, a same-UID attacker boundary or managed security authorization.

Any supplied dev endpoint/token env reserves the original development path, even when
invalid; the UI will not silently replace it or create a second bridge. The trusted
canonical extension is bundled as inert Vite raw text in Main, without user credentials;
the generated target file and private Main metadata contain the capability.

Automated evidence includes controller-applied artifact → isolated Node synthetic
hooks → real socket/Adapter/Application, trusted IPC, cancellation/staleness, receipt
withdrawal, quit, RTL and source-independent built template checks. The original
implementation-only stage did not perform real-target or visual QA. Later accepted
M2/M5 and restart evidence keep their own ranges; this UI migration has new formal
screenshot checks but has not repeated the new multi-target real pi matrix. See the
[current plan](../../docs/MVP-EXECUTION-PLAN.md) and
[restart checklist](../../docs/MVP-RESTART-CHECKLIST.md) for exact scopes.

## Session test boundaries

The former development simulation menu was removed. Session fixtures and doubles
remain only in isolated tests and `renderer/test-support`; neither is a production
entry. Real Agent state continues to originate from Adapter → Application snapshots.

## Bundled 3D pet

The GLB fixture and its source generator are documented in
`../../packages/pet-runtime/assets/README.md`. Renderer tests parse the actual
asset and advance Drei-managed animation tracks; the build emits the GLB as a
local asset.
This trusted fixture path is not user import validation.

The prototype animation priority is working > unread error > unread completed >
idle, independent of bubble order. Hiding bubbles does not change activity.
The model uses Work, Error, Success and Idle clips respectively; the precise
multi-session animation policy remains a product-tuning choice. PreferenceRenderLoop owns one cancellable RAF scheduler per Canvas, enforcing the
selected 30/60/120 FPS and 75/100/150% DPR settings. Hidden management scenes stop
drawing; document-hidden pause follows preferences and reduced animation pauses
continuous poses while retaining the selected state. Drei useGLTF loads the bundled local URL;
useAnimations owns the instance mixer. Cloned transforms are instance-owned,
while geometry/materials remain cache-owned and are not disposed on remount.
Bounds frames the complete bundled animation envelope, including the success
jump, inside Main's unchanged pixel region. Actual CPU/GPU budgets and Windows
behavior still need measurements; this is not a power-efficiency claim.

For controlled WebGL checks, the dev-only `/test-support/visual.html` accepts
`motion=idle|working|success|error`, `size=80|140|300|600`, the existing
`theme=dark`, and `position=top-left|bottom-right`. It never connects to a user
socket and does not simulate native movement. See `../../docs/RENDERER-R2-R3F.md`
for historical R2 lifecycle/dependency evidence and `../../patches/README.md` for
the pinned Fiber initialization-error patch and its removal gate.

Controlled test-fixture check: changing Session states should change motion, and
acknowledging all terminal bubbles should
return it to Idle. Missing optional clips fall back to Idle; missing required Idle
is a loading error.

## Explicit pi bridge development configuration

The original environment-based development path starts the pi Adapter only with a
nonempty endpoint and a 16–256 character token (both trimmed):

```sh
AGENT_PET_PI_ENDPOINT=/tmp/agent-pet-pi.sock \
AGENT_PET_PI_TOKEN=replace-with-a-random-16-plus-character-token \
pnpm --filter @agent-pet/desktop dev
```

Without valid env configuration this development path opens no socket. The separate
consented desktop flow above generates its own config only when opted into. The read-only extension lives in
`../../integrations/pi-extension/index.ts`; its README documents explicit user
loading with the same endpoint/token. No startup scan, automatic installation or pi settings
edit is performed. Do not run these commands or reload an active pi session on the
user's behalf. The Adapter never starts or resumes pi and `openSession` remains
unsupported.
