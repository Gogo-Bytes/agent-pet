# Desktop development

Run from the repository root with existing dependencies:

```sh
pnpm --filter @agent-pet/desktop dev
pnpm typecheck
pnpm --filter @agent-pet/desktop build
```

The normal development app may use existing preferences and connections. Use an
isolated profile for acceptance; do not replace or restart the user's running app.
Real configuration access, model requests, login items and publishing require
their own scope and consent.

See [product requirements](../../PRODUCT-REQUIREMENTS.md),
[architecture](../../docs/ARCHITECTURE-DESIGN.md),
[security and data retention](../../docs/SECURITY-BOUNDARIES.md), and
[current priorities](../../docs/MVP-EXECUTION-PLAN.md). Provider behavior and
supported versions are documented for [pi](../../integrations/pi-extension/README.md),
[Claude Code](../../integrations/claude-hooks/README.md), and
[Codex](../../integrations/codex-hooks/README.md). Current task status belongs in
the linked Issue.

## Application structure

- `index.html` and `main.tsx` start the desktop pet. `management.html` and
  `management/main.tsx` start the management window.
- Main owns windows, configuration, private assets and IPC authorization. The
  sandboxed preload exposes typed operations to the renderer. Application owns
  Session and unread state. Production does not load the browser review bridge.
- Home and the desktop show pets only for online configurations with a bound pet.
  A configuration's Sessions remain separate bubbles. The Home and Pets pages
  share a Canvas; HTML controls provide keyboard access to the same actions.
- Main owns desktop hit regions and window behavior. Pet hover uses the pet
  viewport, while Home hover uses model raycasts. macOS pet panels remain
  nonactivating. The management window uses native macOS traffic lights.
- The [glass components](src/renderer/shared/ui/Glass.tsx) are shared by desktop
  controls. `PreferenceRenderLoop` applies the selected frame-rate and resolution
  settings; hidden scenes and reduced-motion settings affect rendering.

## Connections and preferences

`Configurations` and `ConfigurationsStore` manage named configuration records.
Installation discovery, configuration availability and connection state are separate.
Discovery checks a bounded set of installation locations; reading a target requires
separate consent. The Provider guides define supported versions and setup steps.

Preferences are stored separately from connection credentials. Resetting preferences
preserves connections, assets, bindings and pet names. pi requires an explicit resume;
Claude and Codex can restore unpaused connections. See
[connection identity and restart](../../docs/ARCHITECTURE-DESIGN.md#durable-connection-identity-and-restart)
for persistence and recovery.

## Browser review

```sh
pnpm demo:connections
# http://127.0.0.1:4175/connection-scenes.html
pnpm exec vite --config apps/desktop/vite.management-review.config.ts
# http://127.0.0.1:4175/management-review.html?case=online
```

Use one server on port 4175. These pages render the application's UI with
in-memory example data. They are useful for layout, copy and interaction review.
Verify native windows, actual Agent connections and configuration changes in the
desktop app.

## Local macOS package

```sh
AGENT_PET_BUILD_DIR=/tmp/agent-pet-build-unique pnpm package:mac
```

The script builds an arm64 `Agent Pet.app` outside the source tree and refuses a
nonempty output directory. It does not publish or install the app. No signing
identity is configured, so this local package is not a signed or notarized release.

## Native window acceptance

Check the version and relevant changes before repeating an earlier acceptance.
For a real target, agree on the paths, reads, writes and cleanup before starting.
The connection scan can also inspect pi installation locations; Claude and Codex
show separate consent prompts.

Use the intended app's full path, then verify its process, isolated data paths
and management window URL. Refresh the accessibility tree after each action and
verify saved screenshots. Capture the intended result, including any consent or
preview required by the task.

An error or unchanged snapshot does not establish whether an action ran. Wait for
the UI to update, then compare a fresh tree and screenshot before retrying or
asking for help. In particular, avoid repeating a confirmation while its outcome
is unknown. If the window remains inaccessible after a bounded check, record the
error and stopping point.

On macOS 26.1 with Electron 36.9.5, a fresh app copy with a distinct bundle ID and
name, plus `--disable-backgrounding-occluded-windows`, allowed accessibility
controls to work in some runs. Coordinate clicks and snapshots still failed or
lagged in others. Treat this as a workaround, not a confirmed fix.

Before exit, record the app and child process identities and relevant listeners.
Request a normal exit and check those identities and endpoints afterwards.
Temporary evidence can expire; preserve approved evidence needed for later review.

## Operator tools

The optional pi development route uses `AGENT_PET_PI_ENDPOINT` and
`AGENT_PET_PI_TOKEN`. Follow the [pi extension guide](../../integrations/pi-extension/README.md#explicit-development-loading)
when explicitly using it.

`scripts/pi-extension-update.mjs` updates or restores a managed pi extension.
Its target and operation require an explicit preview. The tool checks ownership,
saves a private backup and preserves uncertain files. See the script for its inputs.

For authorized development observation, `AGENT_PET_DEV_EVIDENCE_DIR` points to
a pre-created `0700` directory. Output is created exclusively with `0600`
permissions, capped at 128 KiB, and contains event categories and salted aliases.
Packaged apps ignore this setting.
