# Desktop development

Claude 任务反馈（2026-10-19）：近期工具动作、回答出错和旧连接显式升级已实现，恢复旧连接不会自动改 hooks。本轮全量1121通过/1跳过、类型检查和源码构建通过，待真实任务验收；此前冷启动超时仍作为已知风险保留。继续 dev、不打包。见 [实现与验证](../../docs/CLAUDE-TASK-OBSERVATION.md)。

Claude 自动扫描（2026-10-17）：省去默认配置和隐藏程序路径选择；多安装可选、已有配置直接查看。当前可接入仍仅 npm 2.1.301，官方安装/Homebrew 显示待验证；未改 shell/PATH，未要求重装。源码/隔离验证及已授权的本机发现、已有配置查看通过：Claude 一处、pi 两处，原记录保留。Claude 扫描仍有受限提示，终端 PATH/其他安装方式真实加载和发布未因此通过。见 [设计与验证](../../docs/CLAUDE-DISCOVERY-DESIGN.md)。

当前范围、进度与下一步见 [本地 macOS/pi MVP 执行计划](../../docs/MVP-EXECUTION-PLAN.md)。此页开发命令不是安装许可；完整真实端到端仍待验收，managed 入口仍关闭。

2026-10-16 当前日常pi已按精确授权更新扩展，用户reload后在dev完成限定任务：实际收到读取、写入、执行、工具出错、继续回答和完成，工具出错未误判整任务失败。思考/查找及其余未触发状态、实际专用动画显示仍待验；本轮没有打包。范围与时间线见 [实机记录](../../docs/PI-EXTENSION-LIVE-ACCEPTANCE.md)。

## Desktop overlay refinement (2026-10-15)

Desktop App keeps one R3F Canvas and its toolbar inside a compact invisible hover
envelope, including their connecting gap. The overlay has no pet-name
label; the legacy stored `names` key remains readable for schema compatibility.
The canonical material is `src/renderer/shared/ui/Glass.tsx`/`glass.css`, shared
with management. The overlay uses GlassToolbar/GlassAction and panel GlassButton,
with a high-contrast variant and compact shared elevation. The compact glass toolbar waits for Main's native mouse-region acknowledgement,
allows an unhurried pet-to-controls handoff, and releases on blur/hide/unmount.
Main lets the toolbar initiate hover even while hidden, and joins the compact
envelope after presentation acknowledgement; distant margins still pass through.
Main owns hit testing and applies the macOS nonactivating panel/workspace/topmost
policy on show/restore. Other apps' full-screen/Spaces behavior needs native acceptance.

The new package is staged, not substituted for the running user app, so its pi
receiver stays intact. Commands, screenshots and native automation limits:
[overlay evidence](../../docs/DESKTOP-OVERLAY-REFINEMENT-ACCEPTANCE.md).

## Connection page (2026-10-15)

连接页先显示实际连接状态与“重新连接／暂停连接／继续连接”。位置检查默认收起，文件夹可用不会表示Agent在线；完整检查范围、文件改动和技术原因仍可查看，写入和移除都保留独立确认。设置预览与取消支持键盘回焦，隐藏页不抢焦点。

本轮使用正式页面的隔离示例验证宽/窄/矮窗口、等待/错误及单行长路径，没有操作真实pi或重启用户应用。截图、测试和最新包见 [连接页记录](../../docs/CONNECTION-DETAIL-FLAT-ACCEPTANCE.md) 的最新修订。

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

macOS 菜单栏图标不见时，应用开关开启不代表系统允许显示。本机曾因启动 dev 的
ChatGPT 在系统「菜单栏」设置中被关闭，连带阻止 Electron 图标；经用户授权打开
ChatGPT 项后，系统解除阻止，用户确认图标恢复。排查时也要核对启动应用的系统开关，
不要循环重建图标、重置系统或仅凭坐标宣称成功。具体证据与范围见
[菜单栏恢复记录](../../docs/DESKTOP-MENU-BAR-ACCEPTANCE.md)。正式包本轮没有重测。

连接页逐页调整入口：`pnpm demo:connections`，打开
<http://127.0.0.1:4175/connection-scenes.html>。若 4175 的演示服务已经运行，直接打开链接即可。
左侧列出 42 个编号场景，包含连接列表/详情、扫描、一键配置、手动添加三步、
更换位置与移除的正常/等待/错误画面。右侧可操作，也可用“上一个 / 下一个”、
宽/窄/矮窗口、“重新打开”和单独打开链接。地址中的 `scene` 可分享或刷新恢复。
这是当前正式 React 组件的演示，使用明确标注的示例数据；所有模拟接口只存在于
`src/renderer/test-support`，没有文件、系统或 Electron IPC 操作，不会影响正在运行的 pi。
场景等待状态不会通过计时器自动成功；需要回到初始画面时点击“重新打开”。

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

Connection details lead with identity, a compact status and the next connection
action, followed by a read-only single-line path. Native “更多操作” groups pause,
inspection, target changes and removal; it opens automatically for an inspection
problem or failed connection. Empty content centers in the usable right pane.
Deployment review and removal confirmation retain their existing semantics. See the
[flat detail UI evidence](../../docs/CONNECTION-DETAIL-FLAT-ACCEPTANCE.md) for
responsive checks, staged package and native verification limits. The user's
currently connected app was kept running; switching to the new package is pending.

The demo's rename form now uses a labeled TextField with a character count and a
single focus ring. Scanning uses a decorative radar respecting reduced motion.
Read consent and deployment previews show brief summaries with expandable scope;
blocked previews offer a return action. Removal uses a compact native dialog,
initially focuses Cancel, retains failures and requires a separate confirmation.

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

The shared presentation projection uses current supported activity within working
Sessions, then unread error > unread completed > idle, independent of bubble order.
Transient tool failures do not end work; one-shot cues do not replay on rename or
scene remount. See [event coverage and acceptance](../../docs/PET-ACTIONS-ACCEPTANCE.md). Hiding bubbles does not change activity.
The bundled model still has only Work, Error, Success and Idle clips. Fine activity
falls back to compatible existing animation/static; no new artwork is implied. PreferenceRenderLoop owns one cancellable RAF scheduler per Canvas, enforcing the
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

The isolated review host at 4175 also serves
`/visual.html?bubbles=pair&theme=white` for working/completed bubble styling;
`theme=dark|lines` checks contrast and backdrop edges. These are in-memory examples.
Collapsed bubbles are positioned as a stack; only expanded bubbles use list flow.
Both states use shared compact glass rim/elevation tokens inside the unchanged
Main-owned 88px/204px interaction regions.

Controlled test-fixture check: changing Session states should change motion, and
acknowledging all terminal bubbles should
return it to Idle/static. Every animation, including Idle, is optional. All three
scenes share the catalog resolver/player: absent mappings or clips use a compatible
fallback, finally restoring the default static pose. Single-shot clips play once
then return to Idle/static. Artist template and catalog: [guide](../../docs/PET-ARTIST-GUIDE.md).
The isolated 4175 host serves `/pet-actions-review.html` using the production player
and bundled GLB; it never connects to an Agent.

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

## Explicit dev-only extension update / event evidence

The host/operator helper `PiExtensionUpdate` is not a startup task or Renderer IPC.
It requires a valid private receipt, exact owned file, inactive receiver and unchanged
settings/receipt; it retains private backups and updates actual ownership after an
atomic replacement. Its explicit `restore()` validates private backup identity and
content. Uncertain publication preserves files and fails closed, without automatic
repair. See [the current real-target preview](../../docs/PI-EXTENSION-UPDATE-PREVIEW.md)
before any daily target action. `scripts/pi-extension-update.mjs` requires an explicit
connection directory, expected target, UUID operation and `preview|apply|restore` mode;
it never discovers targets, starts pi, prints credentials or sends model requests.

For explicitly authorized live checks, a non-packaged dev may set
`AGENT_PET_DEV_EVIDENCE_DIR` to a pre-created private 0700 directory. The evidence
file is exclusive 0600, capped at 128 KiB, and contains enum observations/action
intents with salted aliases only. It is not proof that a clip rendered, nor a task
body recorder; no variable means no recording, and packaged apps ignore it.

## Additional Agent preparation (2026-10-16)

Claude Code CLI, Codex CLI, Antigravity CLI, then Codex and Antigravity desktop
hosts are the confirmed order. Continue dev without packaging; retain existing settings.
The approved [metadata check](../../docs/AGENT-INSTALLATION-CHECK-PREVIEW.md) found
Claude package 2.1.143 and Antigravity app 2.22.0; agy/Codex versions remain unconfirmed
within that permission boundary. No Agent was executed or configured.

The [Claude input normalizer, callback transport and standalone hook command](../../integrations/claude-hooks/README.md)
are implemented and isolated-tested; no trusted native invocation binding or product installation exists. It strips private hook contents and retains native
facts without fabricating terminal success, cancellation or online state. Main,
Configurations, discovery, deployment and the renderer remain unchanged; non-pi
records still honestly report unsupported. Do not claim a new Provider is connected
or install the normalizer as a hook script. Continue dev; no application package.

2026-10-16: the user separately authorized [CLI program updates](../../docs/CLI-UPDATE-PREVIEW.md):
Claude2.1.301, Codex0.163.0, Antigravity CLI1.4.0, each verified through its original
entry in isolated configuration. Existing Agent settings/processes and pi remain untouched.
Separately approved native manifest validation and isolated `--init-only` loading
passed with real startup/end callbacks. Normal tasks, trusted native work binding
and product Provider integration remain unverified. No application package was built.


## Claude CLI connection and home presence (2026-10-16)

Run `pnpm --filter @agent-pet/desktop dev` (no packaging). Add a Claude Code record
in Connections, then choose **设置连接** and explicitly select the Claude executable.
The initial supported layout is npm Claude Code2.1.301, resolving to `bin/claude.exe`;
unknown versions/layouts are rejected without executing them. The configuration
folder is a saved label only; it does not select a new Claude HOME or read its settings.

Review the exact app-private files before confirming. Copy the displayed terminal
command and run it yourself, with your usual cwd and arguments. It adds an independent
`--plugin-dir`; existing settings/hooks/shell files and already-running Claude processes
are preserved. Main and Renderer never spawn Claude. The Electron executable runs the
standalone launcher/hook in Node mode; no separate Node installation is required for
these two observers. Native Claude still uses its ordinary environment.

A live direct child plus an observed root startup hook makes this configuration online.
Home shows a static companion, with task state explicitly unavailable. Task actions and
completion/error reminders are not yet enabled. Multiple invocations retain separate
identity; closing one does not remove another. Pause, app exit or channel loss stops
observation without terminating Claude. After restart, explicitly resume and launch a
new Claude; old credentials/runs are not automatically adopted.

Files live only in `userData/claude-<UUID>` (directories0700/files0600). Removing a
configuration revokes observation and removes its product metadata; runtime/plugin
files remain so a running CLI has no missing hook. Unknown, edited or uncertain files
are preserved and block unsafe operations. No automatic runtime cleanup in this slice.
Never print or copy `activation.json` into diagnostics; Renderer receives only public
paths and a credential-free launch command. See [design](../../docs/CLAUDE-CLI-PRESENCE-DESIGN.md)
and [formal/real acceptance boundaries](../../docs/CLAUDE-CLI-ACCEPTANCE.md).


## Claude ordinary startup (supersedes the wrapper flow above)

The confirmed current flow is **configure once, then run `claude` normally**.
Use `~/.claude` for your usual user-wide configuration (or a project's `.claude`
for that project). Setup previews the selected `settings.json` and adds only one
SessionStart hook. It does not change existing hooks, shell, HOME or Agent args.
The supported selected executable remains npm2.1.301/bin/claude.exe; install or
normal-start verification against a daily target requires its precise preview/consent.

Main uses a bounded, built-in macOS exact-PID helper to verify the hook's ancestor
and then watch the native Claude PID, microsecond birth identity, UID and executable.
It does not scan process lists or read argv, env, cwd or conversation files. Hook exit
and SessionEnd never terminate native presence. Identity/query failure removes the
observation; no name/ps/timer-based guess. A positive liveness query is repeated each
second. The helper uses libproc and must be verified per supported macOS/version.
Dev/build compile it with the existing clang; no dependency installation or packaging.

Normal mode never displays a special launch command. App restart resumes unpaused
observation; explicit pause stays paused. Already-running processes without a startup
callback to the new receiver are not adopted: open a new Claude session. Task actions
and completion/error notifications remain unavailable, with a static Home pet only.

Private files are in `userData/claude-normal-<UUID>`: observer.cjs, activation.json,
hook.json, settings-before.json and receipt.json (0700 directory/0600 files).
The original settings backup can contain secrets; keep it local, never log/copy to
Renderer or Git, and never auto-restore it over later edits. Shared JSON is spliced
losslessly with identity checks, exclusive pending publication and original permissions.
There is no atomic compare-and-swap with external editors; do not save Claude settings
concurrently with installation. Unknown/changed/pending data is retained.

Removal withdraws only the exact unmodified owned hook and product record; recognizable
modified references retain the record for review. Runtime files remain for already-loaded
hook snapshots. Legacy launcher files are retained, but each production record uses only
normal mode. See [current design](../../docs/CLAUDE-NORMAL-START-DESIGN.md) and
[real operation preview](../../docs/CLAUDE-NORMAL-START-PREVIEW.md).

本机普通CLI启动、恢复未暂停观察及首页陪伴已在真实Claude2.1.301与正式dev验证；临时阶段检查随后完整撤回，原版再次连接通过。退出/并发/任务动作不因此视为通过，见[实测与范围](../../docs/CLAUDE-CLI-ACCEPTANCE.md)。若终端提示 `command not found: claude`，表示终端未找到程序入口；可先由用户直接运行已选择安装的绝对路径。产品不会自动改shell/PATH或新增重复安装。

### 重启后的连接恢复

新连接记录以磁盘 UUID 核对跨重启身份；操作期间仍严格核对文件身份和内容。旧格式因设备编号变化失效时需要显式迁移，不能重新添加同一配置或删除未知文件来绕过检查。pi 显式恢复可在原临时目录缺失时排他重建，保留原地址和凭据；Claude 按原规则恢复接收。详见[恢复行为与验证](../../docs/CONNECTION-RESTART-RECOVERY.md)。继续使用 `pnpm --filter @agent-pet/desktop dev`，源码 build 不等于安装包。

## Codex 新桥接模块（2026-10-19）

dev/源码build会编译`out/codex-runtime/native-hook.cjs`。首轮本机模拟已通过；私有文件发现、精确宿主核验和Main记录恢复模块已有隔离验证。它们尚未注册到正式连接页/首页，不代表日常Codex已接通，也不支持凭空把空CLI标为在线。[实现与验收边界](../../docs/CODEX-NORMAL-START-IMPLEMENTATION.md)、[新命令原生审核预览](../../docs/CODEX-NORMAL-START-MOCK-PREVIEW.md)。继续dev，不打包；现有pi/Claude配置不变。
