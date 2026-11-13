# Desktop development

Run from the repository root with existing dependencies:

```sh
pnpm --filter @agent-pet/desktop dev
pnpm typecheck
pnpm test --maxWorkers=1
pnpm --filter @agent-pet/desktop build
```

Dependency installation is a separate authorized operation (`pnpm install --frozen-lockfile`
when approved). Starting dev can use an existing profile/connection; use an explicitly
isolated profile for tests, never silently replace or restart the user's app. Main never
starts Agents or reads conversation bodies. Real setup, model requests, login items and
publishing require their own scope/consent.

[Product behavior](../../PRODUCT-REQUIREMENTS.md), [architecture](../../docs/ARCHITECTURE-DESIGN.md),
[security/retention](../../docs/SECURITY-BOUNDARIES.md), [current tasks](../../docs/MVP-EXECUTION-PLAN.md).
Provider contracts: [pi](../../integrations/pi-extension/README.md),
[Claude](../../integrations/claude-hooks/README.md), [Codex](../../integrations/codex-hooks/README.md).
Task state for migrated work lives in its linked Issue; this README is not a progress log.

## Entries and ownership

Main/preload bundle as CommonJS (`out/main/index.cjs`, `out/preload/index.cjs` and management
preload); workspace runtime dependencies are bundled, not executed as workspace TypeScript.
`index.html`→`main.tsx` is the desktop React/R3F entry; `management.html`→`management/main.tsx`
is the formal four-page management entry. Production never imports prototype/mock bridges.

Application owns Session/unread state; Main owns windows, native layout/hit policy,
configuration controllers, private assets and IPC sender/mainFrame/exact-URL checks.
Sandboxed preload exposes only typed allowlisted operations. Navigation, redirects,
webviews/new windows and arbitrary filesystem/shell/channel access remain restricted.
Each pet window is scoped to its configuration, Session IDs and registered asset access;
late-ready/old sender callbacks cannot regain authority. Renderer recovery is bounded to
one automatic reload per window instance, not reset on did-finish-load.

Management uses native macOS hiddenInset/system traffic lights, with header space reserved;
other platforms use HTML control fallback. Close follows the background preference, explicit
quit waits for pending setup/Adapter cleanup. Main enforces at least one Tray/Dock recovery
entry and preserves Tray if Dock cannot be shown. Login items are explicit supported system
operations, not development auto-registration. Missing menu-bar icons can reflect the
launching app's system menu-bar setting; check that permission rather than repeatedly
recreating icons or changing system settings without consent.

## Scenes, input and rendering

Desktop/Home show one Pet per online, explicitly bound configuration; no offline/global
starter fallback. Each configuration's independent Sessions remain separate bubbles.
`CompanionScene` shares one Canvas across Home and Pets, with different scene/camera inputs;
Home has multi-pet overview/focus, Pets has centered audition, name editing and collection/
binding controls. HTML keyboard operations use the same projection as model clicks.

Desktop hover animation belongs to `PetCanvas`'s stable DOM pet viewport (including its
transparent pixels); toolbar/resize/gap are excluded. Home hover stays per-model raycast.
The wider compact controls-visibility envelope includes pet-to-toolbar gap and may expose
the toolbar from its own region; it is not animation input. Main's presentation-presence
acknowledgement precedes visible hit-region growth; shrink/removal commits before release.
Distant transparent margins pass through. Drag/cancel/blur/hide/unmount release state.
macOS pet panels remain nonactivating, applying topmost/Spaces policy on show/restore.

The canonical glass components/materials are `src/renderer/shared/ui/Glass.tsx`/`glass.css`;
desktop toolbar/bubbles use high-contrast variants and compact elevation, not a second
material system. Collapsed bubbles use a stack, expanded bubbles use list flow within
Main-owned interaction regions. No desktop permanent name label; legacy stored names/offline
preferences do not restore removed display behavior.

`PreferenceRenderLoop` owns one cancellable RAF scheduler per Canvas, enforcing30/60/120 FPS
caps and75/100/150% DPR preferences. Hidden management scenes stop drawing; document-hidden
pause follows preferences, reduced animation pauses motion. Drei owns frame advancement;
instance transforms/mixers are cloned, cached shared geometry/materials are not disposed on
individual remount. Scene framing includes the bundled animation envelope. These budgets
are not hardware GPU/power or complete native-window guarantees.

[Artist guide](../../docs/PET-ARTIST-GUIDE.md) defines imported packages, optional animations
and authoring. Main provides registered bytes via trusted IPC; Renderer uses owned Blob URLs,
not arbitrary paths. Load failures retain controls/fallback; asset change resets the error
boundary. [Trigger capabilities](../../docs/PET-TRIGGER-AUDIT.md) separate facts from clips.
The [in/loop/out design](../../docs/PET-ANIMATION-TRANSITIONS.md) is confirmed but not implemented.

## Configuration and persistence

`Configurations`/`ConfigurationsStore` keep non-secret named records. Installation,
configuration availability, authenticated presence and task facts are separate. Main-native
selected or explicitly approved pasted targets are canonicalized without symlink adoption;
duplicate targets are blocked. Deployed targets cannot be silently retargeted. Scan candidates
are bounded metadata only, not whole-machine/process/session discovery or code-signature proof.

Automatic scan checks bounded GUI PATH/fixed bins and one NVM level (64 entries/16 versions),
not shell profiles or Agent configuration. Partial results stay partial. Target reads need
separate consent. Cancellation fences late results by request/generation and revokes only its
own preview; underlying OS reads remain single-flight until settled because an issued kernel
call cannot always be cancelled. Supported installation versions/layouts and setup rules are
owned by the Provider READMEs, especially Codex's no-program-picker/rescan contract.

Preferences schema3 accepts versioned1/2 migration on read, saves atomically and applies
rendering/lifecycle/pet/reminder choices. Defaults reset preserves configurations, assets,
bindings and name. Size changes save final release/keyboard values, not a mid-drag reset.
Connection activation/receipt/backup secrets are separate from preferences. See
[durable identity and restart](../../docs/ARCHITECTURE-DESIGN.md#durable-connection-identity-and-restart).
pi requires explicit resume; Claude/Codex restore unpaused observation only after their
protected evidence checks. Ready-to-receive is not proof of a live Agent.

## Browser and fixture checks

```sh
pnpm demo:connections
# http://127.0.0.1:4175/connection-scenes.html
# /pet-actions-review.html
pnpm exec vite --config apps/desktop/vite.management-review.config.ts
# http://127.0.0.1:4175/management-review.html?case=online
```

Choose one host for port4175; reuse an existing authorized service rather than starting a
conflicting instance. The connection catalog offers42 numbered scenarios and width/height/
reopen controls; mock waits do not auto-succeed. Review routes also cover empty/error/import/
provider dialogs. `/visual.html?bubbles=pair&theme=white` (dark/lines alternatives) checks
bubble contrast; the desktop dev `/test-support/visual.html` accepts motion=idle|working|
success|error, size=80|140|300|600 and position=top-left|bottom-right. These use formal components
with test-only in-memory bridges, not live socket/state injection. Session doubles are never
a production entry; simulated motion does not prove native movement or actual Agent facts.

The [bundled GLB/generator](../../packages/pet-runtime/assets/README.md) is a trusted fixture,
not user-import validation. Real Three/Drei tests check animation and cleanup; WebGL/DOM
checks do not certify hardware/native input. The pinned Fiber initialization-error patch
and removal conditions are documented in [patches](../../patches/README.md).

## Local macOS packaging

After authorization, use the existing local arm64 packaging path:

```sh
AGENT_PET_BUILD_DIR=/tmp/agent-pet-build-unique pnpm package:mac
```

The script refuses nonempty output directories; without an override it creates a fresh
source-external temporary directory. electron-builder packages the Electron runtime and
`out/**`/package metadata into an unpacked Agent Pet.app, excludes source/workspace dependencies,
and uses `--publish never`. It does not bundle/install an Agent. No signing identity is
configured; Gatekeeper may block the local app. A source build, package or startup smoke
is not signing/notarization/distribution or full application acceptance. Do not disable
system protections; formal release and native/helper resource compatibility remain separate.

## Explicit operator-only tools

The env pi dev route requires nonempty trimmed AGENT_PET_PI_ENDPOINT and a16–256 character
AGENT_PET_PI_TOKEN; any supplied dev config reserves that route even when invalid, never
silently replaced by desktop setup. Use the [extension instructions](../../integrations/pi-extension/README.md#explicit-development-loading)
only with exact authorization and a private endpoint, not as automatic onboarding.

`PiExtensionUpdate` / `scripts/pi-extension-update.mjs` is an explicit host/operator tool,
not Renderer IPC/startup automation. It requires a valid private receipt, inactive receiver,
exact target and unchanged settings/source, saves private backups and verifies replacement
ownership. Explicit restore checks backup identity/content; uncertainty preserves files.
Arguments specify connection directory, expected target, UUID operation and preview/apply/
restore. It never discovers targets, starts pi or prints credentials. Running it against
real files requires a new exact preview; these names are not execution permission.

For authorized live checks only, non-packaged dev can use AGENT_PET_DEV_EVIDENCE_DIR pointing
to a pre-created0700 directory. Exclusive0600 output is capped128KiB and records enums/action
intents with salted aliases, not bodies or a rendered-clip proof. Unset means no recording;
packaged apps ignore it. Existing test-support scripts, retained fixtures and attachments
are not automatically executable/cleanable just because historical reports were removed.

## macOS native acceptance with @电脑

Select the acceptance .app by full path in @电脑 and verify the actual process and
window before interacting. On macOS 26.1 with Electron 36.9.5, a unique bundle ID
and `--disable-backgrounding-occluded-windows` allowed two cold starts to complete
navigation, text entry, readback and cancellation. The stock Electron bundle was
also used for later acceptance, but stale trees and click failures recurred. The
underlying tool cause is unknown; neither setup guarantees a fix. Changing a bundle
or launch flags requires checking the current task's approved scope and integrity.

1. Verify the build manifest, live process identity, isolated home, Electron data
   paths and CODEX_HOME before interacting. Historical launchers and temporary
   directories may have expired or contain retained evidence. Check them before
   reuse and follow the current task's scope and authorization.
2. Check the management window title and management.html URL. Click “连接” and
   verify the “我的连接” heading. On a synthetic record, open “重命名”, type a
   marker, read it back, and cancel when that check is in scope. Verify the original
   name. Refresh the accessibility tree after each transition. Clicking the tab uses
   its ordinary interaction; setting its AX value crashed this Electron version.
3. Capture the consent and action preview separately. Verify saved image files
   and inspect their visible content; scroll for details that fall below the fold.
   If capture reports an error after a click, re-read the UI before retrying.
4. The current “重新扫描” flow also probes pi installation paths. Include the
   actual discovery scope in the acceptance preview. For shutdown, inventory
   the process tree, request graceful exit and check the recorded identities.

### Troubleshooting and preparation

- Start with the current Issue, commit and relevant diff. Reuse version-matched
  results when the change does not affect them. Identify the specific missing
  observation and a deterministic native trigger before planning another run.
  When the trigger requires a mock, fabricated socket message or guessed timing,
  report integration coverage and the native gap separately.
- Prepare one scoped preview covering the actual paths, fixture, discovery reads,
  writes, startup, shutdown and evidence. Check that fixed installation candidates
  exist and are within that scope before launch. Automatic discovery can probe pi
  alongside Codex and show separate Claude and Codex consent sheets. Read each sheet
  before acting. Prior approvals and retained fixtures do not grant a new scope.
- A successful tool call can return the previous tree or screenshot while the UI
  changes. On `noWindowsAvailable`, `elementHasNoFrame`, an invalid element ID or
  unchanged output, check the app path, live PID, management URL and fresh full
  tree, raise the verified window and inspect a screenshot. A later fresh observation
  revealed the actual page in Issue 19; this does not establish a tool fix. Never
  repeat a consequential click until its outcome is known. Do not bypass access
  restrictions or infer a product failure from the tool error alone.
- If the verified app remains inaccessible after one bounded diagnosis, record the
  error and safe stopping point. Ask for one specific manual action only if needed,
  then inspect and save the resulting screenshot and accessibility tree yourself.
  A native file chooser previously needed a manual click even though the selected
  file appeared in the tree; its cause was not established.
- For a real Claude host, plan first-run pages, approved network and credential
  scope, work-directory trust and temporary paths before launch. Claude 2.1.301
  required `CLAUDE_CODE_TMPDIR` in addition to `TMPDIR`; theme selection changed
  the isolated settings file. Record approved changes and recheck hooks rather than
  assuming the whole file is immutable. A historical approval does not extend to
  another directory, credential or network endpoint.
- Save screenshots and their hashes in the authorized evidence location, verify
  the actual images, and record process identities and listener endpoints before
  shutdown. Check every recorded identity and socket after exit. Temporary paths
  can disappear, and a hash alone cannot restore a screenshot; archive approved,
  non-sensitive evidence when durable proof is needed. Preserve uncertain files.
