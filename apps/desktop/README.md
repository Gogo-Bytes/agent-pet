# Desktop development

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

## pi detection and read-only preflight (P2a)

The management connection page now offers explicit detect/rescan, a Main-owned
installation-package directory picker, a separate configuration-directory picker,
and an explicit **inspect selected target** action. Selecting a directory alone
does not read its settings. The default `~/.pi/agent` is only a candidate, not a
claim about the active terminal's configuration. Nothing is installed or changed.

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

There is no installer, credential storage, connection server or online claim on
this page. Existing opt-in development pi behavior below is unchanged. See
`../../docs/DESKTOP-P2A-PREFLIGHT.md` for exact budgets, automated evidence and
remaining native picker, ACL, filesystem-race and release gaps. Native dialogs
have not been accepted through mocks. The accepted P1 Dock recovery remains;
the separate top menu-bar issue is still open.

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

The desktop process starts the pi Adapter only with a nonempty endpoint and a
16–256 character token (both trimmed):

```sh
AGENT_PET_PI_ENDPOINT=/tmp/agent-pet-pi.sock \
AGENT_PET_PI_TOKEN=replace-with-a-random-16-plus-character-token \
pnpm --filter @agent-pet/desktop dev
```

Without valid configuration no socket is opened. The read-only extension lives in
`../../integrations/pi-extension/index.ts`; its README documents explicit user
loading with the same endpoint/token. Nothing installs it or edits pi settings
automatically. Do not run these commands or reload an active pi session on the
user's behalf. The Adapter never starts or resumes pi and `openSession` remains
unsupported.
