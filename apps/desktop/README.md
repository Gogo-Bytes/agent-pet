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

Unit tests, TypeScript checking and the production build pass. The renderer uses
placeholder geometry, not a selected GLB. No real Agent adapters are connected;
the initial session snapshot is empty.

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
