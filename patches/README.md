# Dependency patches

## `@react-three/fiber@9.7.0`

`@react-three__fiber@9.7.0.patch` changes the web Canvas initialization call from
`run()` to `run().catch(setError)` in its ESM and CJS development/production builds.
The async `configure()` call can reject when Three cannot create a WebGL2 context,
before Fiber installs its child error boundary. Routing the rejection to Fiber's
existing error state lets the application's `PetErrorBoundary` display a failure
notice while preserving session controls. No renderer or render loop is added.

pnpm applies the patch through `pnpm-workspace.yaml`; the lockfile pins its hash.
Do not edit the installed dependency directly. On a Fiber upgrade, check upstream
handling first, then remove this patch only after the regression passes without it:

```sh
pnpm exec vitest run apps/desktop/src/renderer/features/pet/PetCanvas.webgl.test.tsx
```

The test mounts actual Fiber Canvas with measured dimensions and unavailable
WebGL2, rather than mocking Canvas or throwing from model children. Unhandled
rejections must remain test failures. Browser evidence and known dev-cache restart
requirements are recorded in `docs/RENDERER-R2-R3F.md`.
