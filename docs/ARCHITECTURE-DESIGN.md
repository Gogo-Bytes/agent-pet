# Agent Pet Architecture Design

## 1. Architectural intent and product boundaries

Agent Pet is a local, read-only desktop projection of configured coding-agent sessions. The business invariant is **one Pet, many independent Sessions, at most one visible bubble per Session**. A restarted agent run is a new Session; sessions are neither aggregated nor deduplicated. The product surfaces only `working`, `completed-unread`, and `error-unread`.

The architecture therefore separates:

- **Domain:** session identity, lifecycle, unread/acknowledgement rules, display-name fallback, bubble projection, Pet/asset capabilities, and explicit Open Session outcomes.
- **Application orchestration:** consuming adapter facts, applying domain transitions, coordinating acknowledgement and open requests, and publishing renderer-safe snapshots.
- **Infrastructure:** Electron process/window management, adapter process protocols, filesystem/config persistence, OS activation, GLB parsing/validation, and logging.
- **Presentation:** one 3D Pet, independently visible bubbles, drag behavior, controls, and user-facing capability/error states.

Excluded from every layer: agent approval/control/send/pause/steer actions, multiple Pets, cloud sync, arbitrary process discovery, token progress, remote model downloads, VRM/FBX, and a store/community marketplace.

## 2. Bounded contexts and domain model

### Session Observation context

The **Session Observation** context owns the normalized facts emitted by an enabled Adapter. A Session has an adapter/provider identity, provider session id (opaque), start/observation identity, optional agent/project names, and latest normalized status. It must not expose prompt, code, transcript, tokens, or tool details to the UI merely because an adapter observed them.

An internal adapter event may include `working`, `completed`, `error`, `unknown`, connection state, timestamp, and correlation metadata. Provider payloads are infrastructure input, not domain entities. The reducer tolerates duplicates, out-of-order events, reconnects, and unknown future values. It does not infer completion from an arbitrary process disappearing.

### Session Presentation context

This context maps each observed Session to at most one Bubble projection. A working Session has a visible working bubble. A transition from working to completed/error updates the same bubble and marks it unread. Acknowledgement is an explicit domain command: it removes the completed/error bubble from the visible set and clears transient unread state. Unread state is intentionally in-memory and is not restored after restart.

The display name is calculated only from Agent-provided name, then project name, then an Adapter-generated fallback. Bubble content is limited to that name and the supported status. The domain never embeds a renderer component or coordinates.

### Pet and Asset context

There is exactly one Pet instance. It owns a selected Pet asset and a collection of bubble projections; it does not own Sessions. Pet and bubble visibility are separate preferences. Pet movement is a presentation/window concern, but the invariant that bubbles move with the Pet is enforced by rendering one scene/window coordinate system rather than separate windows.

A Pet asset is a validated local GLB plus animation capability metadata. `idle` is required. `working`, `success`, `error`, and `attention` are optional. Missing optional animations map through deterministic fallbacks (for example, idle for missing success/error), never disabling the Pet.

### Open Session capability context

An Adapter may offer an Open Session capability, but opening is not a domain guarantee. The application asks the owning Adapter and receives exactly an explicit result such as `success`, `unsupported`, `not-found`, or `permission-denied` (with a safe user-facing message). For a completed/error bubble, acknowledgement is committed as the click action while the open attempt is reported independently; an open failure must not restore the bubble or stop the Pet.

## 3. Monorepo boundaries

A proposed package layout is:

```text
apps/desktop/
  electron-main/       # privileged main process and window lifecycle
  preload/              # narrow, typed renderer bridge
  renderer/             # React/UI + Three.js scene
packages/domain/        # Session, Bubble, Pet and command/reducer rules
packages/contracts/     # versioned adapter event and IPC schemas
packages/application/   # observation orchestration and projection snapshots
packages/adapter-core/  # adapter lifecycle, reconnect, redaction, supervision ports
packages/adapter-codex/ # Codex App Server stdio/JSONL adapter
packages/adapter-pi/    # pi JSON/RPC adapter
packages/adapter-claude/ # Claude Hooks receiver/authorized observation adapter
packages/pet-runtime/    # GLB loader, validator integration, animation mapping
packages/config/        # validated local preferences and migration
packages/test-fixtures/ # recorded/sanitized protocol fixtures and asset fixtures
```

Package dependency direction is inward: provider adapters depend on adapter-core/contracts; application depends on domain/contracts and ports; Electron shell depends on application/config and owns infrastructure implementations; renderer depends on application client contracts and pet-runtime, never on Node, filesystem, subprocess, or provider packages. Domain has no Electron, Three.js, OS, or file-system dependency. Contracts are versioned and schemas are runtime-validated at every untrusted boundary.

## 4. Electron process architecture

### Main process

Electron main is privileged infrastructure and composition root. It creates the single frameless/transparent, always-on-top window where supported; owns lifecycle, tray/menu, display/DPI handling, renderer restart, and platform capability detection. It starts and stops only explicitly enabled adapter processes using absolute executable paths and argument arrays (never shell concatenation), supervises reconnect/backoff, and routes normalized observations to the application service.

Main implements ports for local config/asset directories, OS window activation, adapter transport/process spawning, and safe diagnostics. It validates IPC sender/frame origin, rejects unexpected navigation, and never forwards raw agent payloads or secrets to renderer. Main does not contain Session lifecycle rules; it invokes domain/application commands.

### Preload

Preload is the sole renderer bridge, with `contextIsolation` and renderer sandbox enabled and `nodeIntegration` disabled. It exposes a small typed API, for example:

- subscribe to renderer-safe Pet/session projection snapshots;
- acknowledge a bubble and request Open Session;
- set Pet/bubble visibility and drag/window preferences;
- request validated local GLB import and current asset metadata;
- report user-facing capability/error acknowledgements.

Every method validates arguments and returns typed results. It does not expose `ipcRenderer` wholesale, filesystem APIs, child-process APIs, arbitrary URLs, agent payloads, or secrets. IPC channels are allowlisted, sender-checked, and backed by the same schemas as main/application messages.

### Renderer

Renderer owns presentation only: Three.js canvas, React/UI, validated GLB loading through a main-provided local asset handle, deterministic animation selection, bubble layout/content, drag gesture, independent visibility controls, loading/error states, and accessibility affordances. It subscribes to immutable snapshots and sends narrow commands through preload. Bubble clicks call one application command; they do not inspect session files or attempt OS activation. A single scene/container gives Pet and bubbles the same movement transform.

Three.js is selected because GLB/glTF and animation tooling are mature and it can render the same browser-oriented runtime on macOS and Windows. React (or similarly lightweight UI composition) should remain a UI choice, not a domain dependency. Electron is selected over Tauri for a JavaScript/Three.js-first team, Chromium consistency, and straightforward stdio child-process integration; its larger footprint is accepted. Tauri remains a viable later shell replacement only if package boundaries stay intact, not a reason to add Rust now.

## 5. Adapter ports and session observation

The application depends on ports, not provider implementations:

```ts
interface SessionObservationAdapter {
  provider: 'codex' | 'pi' | 'claude';
  start(config: AdapterConfig, sink: ObservationSink): Promise<StopHandle>;
  capability(session: SessionRef, name: 'open-session'): Capability;
  openSession(session: SessionRef): Promise<OpenSessionResult>;
}

interface ObservationSink {
  publish(event: NormalizedObservationEvent): void;
  connectionChanged(state: 'connected' | 'degraded' | 'disconnected'): void;
}
```

The event contract is internal and versioned; it is not claimed to be any vendor's schema. Each adapter translates its official/local surface:

- **Codex:** controlled App Server stdio/JSONL where available; version-pinned fixtures and graceful degraded connection behavior.
- **pi:** documented JSON or RPC line protocol, with backpressure and reconnect handling.
- **Claude Code:** Hooks receiver and only explicitly authorized local observation/transcript reading; no assumption that Platform sessions/events API is the local CLI API. Open Session may commonly be unsupported or not found.

Adapters are configured, not a machine-wide process scanner. They may emit a stable opaque session reference, provider/project/name facts, and coarse lifecycle facts. Logs and retained diagnostics are redacted by adapter-core. Unknown events are ignored or recorded as sanitized diagnostics, never treated as control commands. Adapter failure is a connection state and must leave the Pet operable.

## 6. Projection, acknowledgement, and Open Session flow

1. Adapter emits a normalized event.
2. Application validates it, resolves the Session by adapter + opaque run identity, and applies the domain reducer.
3. The reducer creates/updates one Bubble projection and maps internal status to the three supported display states.
4. Application publishes a renderer-safe snapshot; the renderer updates the same bubble rather than creating a second bubble on completion.
5. Clicking a completed/error bubble sends `acknowledgeAndOpen(sessionRef)` through preload.
6. Application atomically marks that bubble acknowledged/hidden, then invokes the owning adapter's `openSession` port.
7. Result is surfaced as success, unsupported, not-found, or permission-denied without resurrecting the bubble.

Working bubbles remain visible. A working-to-completed/error transition changes status and unread state. Acknowledgement is transient and in-memory. If an adapter reconnects and represents a genuinely new run, its new run identity creates a new Session rather than reviving the old one.

## 7. GLB import and runtime safety

Asset import is a main-side pipeline: choose local file -> check extension/MIME and byte-size limit -> parse GLB container without executing content -> validate scene graph, texture count/dimensions/encoded size, geometry complexity, node/material count, skin/bone count, animation count/duration, and required idle capability -> copy into an application-owned asset directory -> persist only validated metadata and a content hash -> notify renderer of a safe local handle. External texture references, remote URLs, malformed files, and over-limit assets are rejected. The current valid asset remains selected on failure.

The renderer still treats validated assets as untrusted data: bounded decoder options, no network fetches, no arbitrary path traversal, disposal of prior GPU resources, and render budgets (DPR/frame-rate/visibility throttling). Animation mapping is data-driven and deterministic. GLB-only is enforced; no conversion pathway silently broadens format support. License/attribution metadata should accompany bundled assets and user metadata but is not a marketplace.

## 8. Persistence boundaries

Persist only local preferences and durable configuration needed to reconnect: enabled adapters, explicitly configured executable paths/working-directory allowlists, window/visibility preferences, selected validated asset id/hash and asset metadata, schema version, and migration data. Use an Electron main-owned OS-appropriate application data directory with atomic writes and restrictive permissions.

Do not persist completed/error unread state in release one. Do not persist prompts, message text, transcript contents, tokens, or raw provider payloads. Runtime session state, bubbles, adapter connection state, and acknowledgements live in memory. Asset bytes are local user-selected data, not cloud-synced data. Config migrations are versioned and fail closed to safe defaults.

## 9. Privacy and security

Default collection is minimum necessary: coarse lifecycle status, opaque session identity, and fallback naming facts. CWD, identifiers, and transcript access should be opt-in and redacted/hashed where practical. Secrets never enter renderer snapshots, logs, crash reports, or event `raw` fields. No cloud endpoint or remote asset fetch exists.

Electron baseline: context isolation, sandbox, disabled Node integration, strict CSP, no arbitrary navigation or unsanitized external links, sender validation for every IPC call, and signed installers/updates over HTTPS. Only main may spawn configured agents; use executable allowlists and argument arrays. Hooks/receivers must authenticate local connection origin as appropriate and enforce size/time limits. Asset validation is a resource-exhaustion and path-traversal boundary. Read-only product scope means no adapter API for approval, pause, steering, message sending, or other control actions.

## 10. Test seams and acceptance evidence

- **Domain tests:** reducer transition table, independent sessions, no deduplication, name fallback, one-bubble invariant, acknowledgement removal, restart non-persistence, and unsupported Open Session outcomes.
- **Contract tests:** schema validation, unknown/duplicate/out-of-order events, provider fixture translation, redaction, reconnects, and adapter capability results.
- **Application tests:** observation-to-snapshot flow and acknowledge-then-open ordering/failure behavior with fake ports.
- **Asset tests:** valid idle GLBs; malformed, oversized, texture/geometry/bone/animation limit, external texture, and missing optional animation fixtures.
- **Renderer tests:** projection rendering, bubble/Pet shared movement, independent visibility, click command, fallback animation, and no Node access.
- **Electron integration tests:** IPC sender restrictions, window lifecycle, process supervision, config migrations, and macOS/Windows capability probes. Manual matrix tests must cover transparency, always-on-top, drag, DPI, sleep, multi-monitor, and graceful degraded window behavior.

Ports and fake clocks make application tests independent of real agents and OS windows. Sanitized recorded fixtures are preferred to running vendor tools in every unit test; a small version-pinned smoke suite validates each supported adapter.

## 11. Initial implementation sequence

1. Freeze contracts and domain reducer, including statuses, session identity, name fallback, acknowledgement, and Open Session result taxonomy; add domain/contract tests.
2. Create monorepo package boundaries and application ports; implement in-memory observation store and renderer-safe snapshots.
3. Build Electron security shell (main/preload/renderer isolation, CSP, IPC allowlist), one window, drag and separate visibility controls.
4. Add Three.js Pet runtime with one licensed GLB, idle/working and deterministic optional-animation fallbacks.
5. Implement GLB validation/import and local asset/config persistence, including rejection without replacing the current asset.
6. Implement Codex and pi adapters against version-pinned fixtures, supervision and reconnect behavior; then Claude Hooks with clearly documented capability limitations.
7. Implement adapter-specific Open Session ports and explicit failure presentation; keep acknowledgement independent from activation success.
8. Run macOS/Windows acceptance matrix, package signing/update validation, privacy audit, and performance/resource-limit tests.

## 12. Unresolved decisions and explicit risks

- Exact target versions and event fixtures for Codex, pi, and Claude Code must be selected; provider schemas may drift.
- Claude Code's reliable local observation granularity and open-window behavior need product confirmation; unsupported is a valid first-release result.
- Exact GLB limits (bytes, texture dimensions, triangles, bones, animation duration) require performance and memory measurements on minimum supported hardware.
- The team must choose whether Claude transcript reading is in scope for a configured opt-in; it must not be assumed by the adapter.
- macOS/Windows transparency, click hit-testing, always-on-top, DPI, and multi-monitor behavior need real-device validation; Linux is not a supported release target despite possible best-effort behavior.
- Electron's memory/package overhead versus Tauri's smaller footprint remains a release-quality trade-off, but must not widen product scope or leak privileges into renderer.
- Asset license metadata format and user-facing attribution wording remain to be defined.

No unresolved decision permits adding agent control, cloud sync, extra model formats, multiple Pets, session aggregation, token progress, or remote asset downloads.
