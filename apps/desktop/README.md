# Desktop development

当前范围、进度与下一步见 [本地 macOS/pi MVP 执行计划](../../docs/MVP-EXECUTION-PLAN.md)。此页开发命令不是安装许可；完整真实端到端仍待验收，managed 入口仍关闭。

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
animations. The opt-in pi Adapter is wired to Main; without valid configuration
or development simulation, the initial Session snapshot is empty. No other Agent
is connected. Tests exercise the actual pi extension over isolated local sockets,
not a running pi TUI.

See `../../docs/RENDERER-R4-ACCEPTANCE.md` for current automated checks, historical
user/native evidence and pending acceptance. Windows, hardware GPU/power and the
full native-window matrix remain unverified; a build or DOM test is not native
acceptance.

## Management UI components

The separate `management.html` / `management/main.tsx` entry imports
`@radix-ui/themes/styles.css`; `ManagementApp` owns its root `Theme`. All management
pages use pinned `@radix-ui/themes@3.3.0` components for navigation, buttons,
checkboxes, candidate radios, size slider, cards, feedback, typography and layout.
The transparent pet renderer and its controls do not load this theme or stylesheet.

Connection and pet pages remain mounted behind hidden/inert boundaries so pending
requests survive navigation. The size slider still previews locally and saves only
on release (or keyboard commit), preserving P1 cancellation and stale-reply safety.
See `../../docs/MANAGEMENT-UI-COMPONENTS.md` for the full before/after inventory,
Themes thumb accessibility adaptation, keyboard behavior, automated evidence and
outstanding browser/native checks. That restyle was not native or release acceptance.
The M2 opt-in deployment entry below adds a separate Main/preload consent boundary.

## pi detection and read-only preflight (P2a)

The management connection page now offers explicit detect/rescan, a Main-owned
installation-package directory picker, a separate configuration-directory picker,
and an explicit **inspect selected target** action. Selecting a directory alone
does not read its settings. The default `~/.pi/agent` is only a candidate, not a
claim about the active terminal's configuration. These P2a controls install or change nothing.

Detection probes at most 32 GUI PATH entries plus three fixed bin locations;
it never runs pi, wrappers or shell profiles, scans processes/sessions, or calls
pi's package resolver. Only standard `@earendil-works/pi-coding-agent` **0.85.1**
package metadata is recognized as verified; other versions remain unverified.
This is metadata identification, not signature validation or proof of a running
Agent. Manual installation selection expects the package directory containing
`package.json`, not the agentDir.

Read-only inspection reports root-entry/manifest and same-name conflicts, unsafe
paths/files and bounded-read failures. Existing ignore files and nonempty or
unsupported settings extension/package rules are **unknown**, not approximately
parsed into a green result. No raw settings or errors cross the narrow management
IPC. Cancelled or stale requests cannot replace a newer target.

The P2a section itself makes no deployment or online claim; the separate M2 section
below supplies explicit consent and connection status. Existing env opt-in remains. See
`../../docs/DESKTOP-P2A-PREFLIGHT.md` for exact budgets, automated evidence and
remaining native picker, ACL, filesystem-race and release gaps. Native dialogs
have not been accepted through mocks. The accepted P1 Dock recovery remains;
the separate top menu-bar issue is still open.

## Explicit desktop pi deployment (M2 partial)

The connection page now offers a bounded local opt-in flow:

1. Use **选择配置目录** to choose an existing pi agentDir through the native picker.
   Selection does not read settings; the default candidate cannot be deployed directly.
2. **同意读取所选目标并预览部署** authorizes bounded reads of fixed configuration and
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
`userData/pi-connection/connection.json` (0700 directory / 0600 file). The confirmation
preview discloses this persistence policy before deployment. Credentials never enter ordinary
preferences, IPC, logs, Renderer or the application bundle.

After restarting, choose **恢复已保存连接** to validate the original runtime directory,
absence of any existing endpoint, and the installed file's identity/metadata/content digest.
Resume uses the identical endpoint/token and the same installed extension, without environment
exports or redeployment. **停用接收并保存（保留文件）** stops the listener and persists disabled
state. Even when saving fails, the next launch never auto-listens. The UI separately reports
receiving state, saved state and partial failures; failed stop does not claim disabled reception.

**停用接收并撤回本次文件…** stops receiving, saves disabled state, then selectively removes
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
withdrawal, quit, RTL and source-independent built template checks. No real target/pi,
Electron default profile or visual QA was run. M2 remains PARTIAL; see the current plan
for exact test counts. Restart persistence is implemented but not manually accepted; see
[the new unchecked restart checklist](../../docs/MVP-RESTART-CHECKLIST.md). Prior manually checked
results remain historical evidence for their original process-local implementation.

## Development session simulation

Use the application menu `模拟 Session（开发专用）` to create three working sessions
and change the current simulated run to completed or error. All names are prefixed
with `模拟`; this is not a real Agent integration and does not open Agent windows.

Check that working bubbles survive clicks, completed/error bubbles disappear on
click with an unsupported-opening notice, and hiding bubbles preserves the pet.
Reloading the renderer requests the current in-memory snapshot. Restarting the
application resets it. The simulation menu is excluded from packaged apps.

## Bundled 3D pet

The GLB fixture and its source generator are documented in
`../../packages/pet-runtime/assets/README.md`. Renderer tests parse the actual
asset and advance Drei-managed animation tracks; the build emits the GLB as a
local asset.
This trusted fixture path is not user import validation.

The prototype animation priority is working > unread error > unread completed >
idle, independent of bubble order. Hiding bubbles does not change activity.
The model uses Work, Error, Success and Idle clips respectively; the precise
multi-session animation policy remains a product-tuning choice. R3F Canvas owns
the single render loop (display cadence, DPR capped at 2),
pausing it while the document is hidden. Drei useGLTF loads the bundled local URL;
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

Manual check: changing simulated Session states should change motion, and
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
