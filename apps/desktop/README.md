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

Desktop runtime verification is pending: the available agent-browser Electron
launcher rejected the installed Electron bundle with
`target does not have Electron framework evidence`. Build success does not
verify preload execution, WebGL, IPC, dragging or macOS/Windows window behavior.
