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

## Current verification boundary

Unit tests, TypeScript checking and the production build pass. The renderer loads
the bundled project-authored `starter.glb` robot with embedded animations. No real
Agent adapters are connected; the initial session snapshot is empty.

The user confirmed that the macOS development window renders normally after a
direct CLI launch. The agent-browser Electron launcher rejected this bundle;
that launcher result does not indicate an Electron runtime failure. Windows
behavior and the interaction scenarios below still require manual verification.

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
`../../packages/pet-runtime/assets/README.md`. Runtime tests parse the actual
asset and advance its animation tracks; the build emits the GLB as a local asset.
This trusted fixture path is not user import validation.

The prototype animation priority is working > unread error > unread completed >
idle, independent of bubble order. Hiding bubbles does not change activity.
The model uses Work, Error, Success and Idle clips respectively; the precise
multi-session animation policy remains a product-tuning choice. The renderer
caps rendering at 30 FPS and DPR 2, pauses rendering when the document is hidden,
and disposes model/GPU resources on unload. Actual CPU/GPU budgets and Windows
behavior still need measurements.

Manual check: the robot should replace the purple placeholder; changing simulated
Session states should change motion, and acknowledging all terminal bubbles should
return it to Idle. Missing optional clips fall back to Idle; missing required Idle
is a loading error.

## Explicit pi bridge development configuration

The desktop process starts the pi Adapter only when both variables are present:

```sh
AGENT_PET_PI_ENDPOINT=/tmp/agent-pet-pi.sock \
AGENT_PET_PI_TOKEN=replace-with-a-random-16-plus-character-token \
pnpm --filter @agent-pet/desktop dev
```

Without both values no socket is opened. The current Adapter accepts messages but
there is not yet a pi extension that emits them, so this configuration is a local
integration seam for the next step, not a user installation instruction. The
Adapter never starts or resumes pi and `openSession` remains unsupported.
