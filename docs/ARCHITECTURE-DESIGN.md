# Agent Pet Architecture Design

> 当前边界与实现入口；优先级和任务入口见 [MVP 计划](MVP-EXECUTION-PLAN.md)，文件/凭据/managed 约束见[安全边界](SECURITY-BOUNDARIES.md)。App Server / pi RPC 宿主不作为当前被动观察路线；不得启动或恢复 Agent 来冒充监听已有会话。

## 1. Architectural intent and product boundaries

Agent Pet is a local, read-only desktop projection of configured coding-agent sessions. The business invariant is **one Pet per online, explicitly bound configuration, many independent Sessions per configuration, at most one visible bubble per Session**. A restarted agent run is a new Session; sessions are neither aggregated nor deduplicated. The product surfaces only `working`, `completed-unread`, and `error-unread`.

The architecture therefore separates:

- **Domain:** session identity, lifecycle, unread/acknowledgement rules, display-name fallback, bubble projection, Pet/asset capabilities, and explicit Open Session outcomes.
- **Application orchestration:** consuming adapter facts, applying domain transitions, coordinating acknowledgement and open requests, and publishing renderer-safe snapshots.
- **Infrastructure:** Electron process/window management, adapter process protocols, filesystem/config persistence, OS activation, GLB parsing/validation, and logging.
- **Presentation:** configuration-scoped 3D Pets, independently visible bubbles, drag behavior, controls, and user-facing capability/error states.

Excluded from every layer: agent approval/control/send/pause/steer actions, cloud sync, arbitrary process discovery, token progress, remote model downloads, VRM/FBX, and a store/community marketplace.

## 2. Bounded contexts and domain model

### Session Observation context

The **Session Observation** context owns the normalized facts emitted by an enabled Adapter. A Session has an adapter/provider identity, provider session id (opaque), start/observation identity, optional agent/project names, and latest normalized status. It must not expose prompt, code, transcript, tokens, or tool details to the UI merely because an adapter observed them.

An internal adapter event may include `working`, `completed`, `error`, `unknown`, connection state, timestamp, and correlation metadata. Provider payloads are infrastructure input, not domain entities. The reducer tolerates duplicates, out-of-order events, reconnects, and unknown future values. It does not infer completion from an arbitrary process disappearing.

The legacy pi receiver admits Session transport ownership only on a validated hello publication, not on the observation’s `baseline` flag. Metadata/companion updates may retain that flag to preserve unread results, but cannot reclaim ownership from a replacement peer; superseded close events likewise cannot clear the current owner. Configuration namespaces and managed admission remain unchanged.

Claude’s private observation mapper owns feedback timers before invoking consumers. Publication failures are isolated (including rejected callback promises), so stop/retire can finish clearing every live run. Session replacement rechecks closed/run/current ownership after disconnect callbacks; reentry cannot revive a stopped mapper or overwrite a newly admitted Session. Publication remains best-effort, not transactional delivery or automatic retry.

### Session Presentation context

This context maps each observed Session to at most one Bubble projection. A working Session has a visible working bubble. A transition from working to completed/error updates the same bubble and marks it unread. Acknowledgement is an explicit domain command: it removes the completed/error bubble from the visible set and clears transient unread state. Unread state is intentionally in-memory and is not restored after restart.

The display name is calculated only from Agent-provided name, then project name, then an Adapter-generated fallback. Bubble content is limited to that name and the supported status. The domain never embeds a renderer component or coordinates.

### Pet and Asset context

Each online, explicitly bound configuration has its own Pet on the desktop and management home, including configurations of the same Provider. No binding means no implicit starter Pet; offline/unbinding immediately removes the instance. `desktop-pets.ts` owns one native overlay per configuration and scopes snapshots, assets and commands to its sender; `home-projection.ts` uses the same visibility predicate. Each Pet shares its window coordinate system with its own bubbles. Pet and bubble visibility remain separate preferences; collection audition is not an online desktop instance.

A Pet asset is a validated local GLB plus optional animation mappings. The asset contract makes every action optional, including `idle`; a valid model with no animation must render its default static pose. A missing mapping or missing referenced clip disables that action, never the Pet. Semantic fallbacks are deterministic, must not invent a contradictory outcome, and terminate at the default static pose. Implemented in pet-runtime’s versioned action catalog/resolver and the shared R3F player: manifest mappings and Idle are optional, missing clips follow the shared fallback policy, and one-shot actions restore the latest applicable base state/Idle/static. Fine-event support varies by Provider; use the integration READMEs and [trigger capability table](PET-TRIGGER-AUDIT.md), not catalog membership, to determine support. Artist templates are generated from the catalog; see [PET-ARTIST-GUIDE.md](PET-ARTIST-GUIDE.md).

Agent observation capabilities, the product's versioned Pet action catalog, and an asset's actual animation mappings are separate. Each Adapter translates native events into bounded normalized facts and reports only observation capabilities verified for its active version/mode/connection (pi currently starts unknown and confirms each fine capability from its observed native hook, without guessing a runtime version); unsupported or unknown is distinct from an observed idle state. Application owns fact ordering, Session/work identity, current state and occurrence identity. A shared presentation policy selects an action intent; a shared asset resolver selects an existing clip or a static pose. Neither scene players nor artist files branch on Provider types. The full artist template is generated from the action catalog; optional entries may be absent or null, and GLB clip names may differ from semantic action IDs. Catalog inclusion does not imply an implemented Provider signal. Expanded metadata remains bounded and excludes raw messages, arguments, outputs, credentials and thinking text. The local receiver clears only current activities on loss; reconnect baselines preserve unread results already held in the Application without restoring historical notifications into a fresh process. The shared player deduplicates bounded business cue IDs across scene remounts; numeric explicit audition remains replayable. The dormant managed receiver does not gain these capabilities automatically.

The author-facing animation contract is only trigger → exact existing GLB clip name (`PetAnimations`); the catalog determines loop/once playback. No author/UI/API trim, blend-duration, speed, loop-range or per-bone controls are exposed. Artists supply naturally looping clips with continuous seam pose and motion velocity/direction, without artificial hold/slow closure tails. Import and playback do not repair source motion. Resource validation is not aesthetic validation; unchanged fallback/static/one-shot restoration rules still apply. Author delivery checks are in [PET-ARTIST-GUIDE.md](PET-ARTIST-GUIDE.md#循环动画交付要求).

The confirmed [in/loop/out design](PET-ANIMATION-TRANSITIONS.md) will extend only idle/working/dragging mappings. It is not implemented: current `PetAnimations` still accepts only exact clip strings or null. Do not publish the future staged mapping as an accepted manifest or change fallback on the strength of the design alone.

### Open Session capability context

An Adapter may offer an Open Session capability, but opening is not a domain guarantee. The application asks the owning Adapter and receives exactly an explicit result such as `success`, `unsupported`, `not-found`, or `permission-denied` (with a safe user-facing message). For a completed/error bubble, acknowledgement is committed as the click action while the open attempt is reported independently; an open failure must not restore the bubble or stop the Pet.

## 3. Monorepo boundaries

Current source boundaries (not a proposed package migration):

```text
apps/desktop/src/main/     # windows, configuration controllers, private files/import
apps/desktop/src/preload/  # narrow typed bridges
apps/desktop/src/renderer/ # React/R3F scenes and shared player
apps/desktop/src/shared/   # desktop IPC/configuration/asset types
packages/domain/          # Session facts, unread lifecycle and projection rules
packages/application/     # observations, acknowledgement and open orchestration
packages/adapter-core/    # Adapter ports and identity
packages/adapter-pi/      # passive local bridge; managed factory remains gated
packages/pet-runtime/     # manifest, trigger catalog, fallback and presentation
integrations/pi-extension/ # passive native extension
integrations/claude-hooks/ # normalized hooks and OS-bound observation
integrations/codex-hooks/  # normalized hooks and OS-bound observation
```

Dependency direction is inward: provider integrations publish adapter-core/domain facts; application owns domain orchestration; Electron Main composes integrations and filesystem/window infrastructure; renderer consumes safe shared types and pet-runtime, never Node, filesystem or subprocess APIs. Domain has no Electron, Three.js, OS, or file-system dependency. Contracts are versioned and schemas are runtime-validated at every untrusted boundary.

## 4. Electron process architecture

### Main process

Electron Main is privileged infrastructure and composition root. It creates the management window and per-configuration transparent overlays, owns tray/menu, display/DPI handling, bounded renderer recovery and platform capabilities. It starts/stops authorized receivers and owned observation helpers, never Agent processes, and routes normalized observations to Application. Helper subprocesses use validated executable paths and argument arrays.

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

The renderer follows the accepted Three.js scene + HTML controls decision in [ADR 0001](adr/0001-threejs-scene-html-controls.md): Three.js owns spatial presentation and animation, while HTML owns primary navigation and operations. Both read the same renderer-safe snapshot; no business state is duplicated between the canvas and DOM. Any 3D affordance has an HTML equivalent.

Three.js is selected because GLB/glTF and animation tooling are mature and it can render the same browser-oriented runtime on macOS and Windows. React (or similarly lightweight UI composition) should remain a UI choice, not a domain dependency. Electron is selected over Tauri for a JavaScript/Three.js-first team, Chromium consistency, and straightforward stdio child-process integration; its larger footprint is accepted. Tauri remains a viable later shell replacement only if package boundaries stay intact, not a reason to add Rust now.

## 5. Adapter ports and session observation

The application depends on ports, not provider implementations:

```ts
// Public port definitions: packages/adapter-core/src/index.ts
interface SessionObservationAdapter {
  provider: Provider;
  start(config: AdapterConfig, sink: ObservationSink): Promise<AdapterHandle>;
  openSession?(session: SessionRef): Promise<OpenSessionResult>;
}

interface ObservationSink {
  publish(observation: SessionObservation): void;
  connectionChanged(state: 'connected' | 'degraded' | 'disconnected'): void;
}
```

The event contract is internal and versioned; it is not claimed to be any vendor's schema. Each adapter translates its official/local surface:

- **Codex CLI:** native hooks → bounded metadata normalizer → authenticated loopback delivery with independently verified host identity → private mapper. Stop/tool return/approval are not task completion/waiting; see [module contract](../integrations/codex-hooks/README.md).
- **pi:** native ExtensionAPI → optional local bridge; only reliable events produce work/activity facts. No RPC-host substitution; see [extension contract](../integrations/pi-extension/README.md).
- **Claude Code CLI:** normal-start hooks and OS-bound presence, private task facts and shared projection. No transcript reading or Platform-session API substitution; see [module contract](../integrations/claude-hooks/README.md).

Adapters are configured, not a machine-wide process scanner. They may emit a stable opaque session reference, provider/project/name facts, and coarse lifecycle facts. Each integration whitelists facts before publication; adapter-core defines ports, not a general raw-payload redactor. Unknown events are ignored or recorded as sanitized diagnostics, never treated as control commands. Adapter failure is a connection state and must leave the Pet operable.

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

Current Main checks (`pet-glb.ts`, executable boundaries in `pet-glb.test.ts`) separate exporter layout from decoded work: accessors and bufferViews each allow at most 16384 entries; total bufferView source lengths are limited to 64MiB, counting overlaps separately because GLTFLoader copies each slice. This conservative slice budget is not a total loader/GPU memory bound. File/JSON/traversal, accessor elements, animation inputs/outputs, graph, geometry, image and skin budgets remain independent. The folder importer reads only manifest/model/declared avatar, not neighboring authoring files. Acceptance does not certify motion fidelity or loop quality.

Asset import is a Main-side pipeline: native folder selection → bounded reads of root pet.json/pet.glb/declared avatar → container, references and resource-budget checks → private byte snapshot and redacted one-use preview → exclusive installation of those exact bytes → asset registry publication. Renderer gets registered asset bytes through trusted IPC and creates Blob URLs, never an arbitrary filesystem path. Unknown/partial destinations are retained, not overwritten or recursively removed on failure. Animation interpretation belongs to GLTFLoader/Three, not a custom glTF engine; the [artist guide](PET-ARTIST-GUIDE.md) owns package format and authoring rules. Missing action mappings or clips are nonfatal capability gaps; an empty animation collection is valid. External texture references, remote URLs, malformed files, and over-limit assets are rejected. The current valid asset remains selected on failure.

Import uses manifest.id as asset identity; duplicate IDs and the reserved starter identity are rejected, never silently upgraded or replaced. `PetAsset`/`PetImportPreview` are metadata-only. Registry and Agent bindings persist separately; selecting/auditioning an asset does not bind it. Deletion requires unbinding first and retains data/records on failure. Main retains only the latest private preview bytes; cancel, new selection, window lifecycle and stale picker results invalidate old tokens. Confirmation consumes those bytes, writes exclusive wx/0600 files and publishes only after registry persistence; no automatic rollback or residue adoption. See [importer](../apps/desktop/src/main/pet-assets-import.ts), [registry](../apps/desktop/src/main/pet-assets-store.ts) and their source-named tests.

The renderer still treats validated assets as untrusted data: no network fetches or arbitrary path traversal, owned Blob URL/mixer cleanup, and render budgets (DPR/frame-rate/visibility throttling). Instance transforms/mixers are owned per Pet; cached shared geometry/materials are not disposed on an individual remount. Animation mapping is data-driven and deterministic. GLB-only is enforced; no conversion pathway silently broadens format support. License/attribution metadata should accompany bundled assets and user metadata but is not a marketplace.

### Renderer-local interaction playback

Desktop `PetCanvas` owns `usePetInteraction` and feeds DOM pointer enter/leave from its existing pet viewport wrapper, including transparent pixels within that rectangle. It passes feedback and completion directly to `PetModel`; the desktop model has no duplicate R3F hover handlers. Animated mesh motion and internal DOM transitions cannot cancel or restart viewport hover. The toolbar/resize controls and App's larger controls-visibility envelope are not animation input; Main's native hit/click-through regions are unchanged. Model replacement discards prior feedback. Interactive `ScenePet` (home only) still feeds per-model R3F hit edges; moving between child meshes is not a model exit. `CompanionScene` supplies an explicit selection counter for model clicks and the existing keyboard-accessible online-pet buttons. Focus, rerenders, collection thumbnails and audition mounts are not selection events. Each instance owns only its latest local feedback; no business IPC or event queue is added.

`usePetAnimation` overlays a mapped hover/selected clip once, suppressing business cue consumption until local feedback ends. Completion/cancellation resumes the latest request/rest action with existing once deduplication; missing local clips leave the business player untouched. Actual desktop viewport exit still cancels hover; completion while inside does not replay until a new exit/entry. Home retains model-exit cancellation. No delayed debounce or hover queue is used. Drag retains priority and cancels prior local feedback; reduced motion skips local feedback, while existing drag/business pause rules remain. Window blur, pointer cancellation/lost capture, document hiding, page disable and unmount clear/release local state or listeners. Catalog/schema/fallback order, online bound-only projection and immediate offline removal are unchanged. Automated R3F/Three tests do not certify native hit delivery or GPU visual quality.

One-shot actions hold their last sampled pose through the completion draw. Handoffs remain deferred until after `mixer.update` finishes, so stopping/rebinding cannot capture an animated pose as the original state. After each stop/play switch, `usePetAnimation` samples once with `mixer.update(0)` before the next draw; Drei alone advances time on frames. This removes the intermediate default-pose flash, not the inherent pose difference between two clips, and adds no crossfade or author controls. Missing fallback and unmount still restore the original static pose. Per-draw and post-effect regression coverage for both entry points is in [usePetAnimation.test.tsx](../apps/desktop/src/renderer/shared/usePetAnimation.test.tsx).

### Configuration connection playback

`Configurations` assigns a runtime-only `connectionCue` to each authenticated offline→online aggregate edge (`configurationOnline`), clears it offline, and keeps it stable through additional Sessions, partial disconnects, renames, binding changes and snapshot reads. It is not configuration metadata, a Session occurrence or a persisted event bus. Actual reconnection gets a new opaque identity. Existing provider authentication and aggregate presence remain authoritative.

Desktop routing includes only that window's cue in the existing `pet:snapshot` (`PetSnapshot` extends Session state); preload adds no channel or renderer command. Home projects the same configuration cue independently. Existing sender/late-ready guards and store generation/late-initial-response guards remain in force. Renderer recovery asks for the same identity, not a synthetic connection event.

The shared player presents connected only over idle/neutral presence, once; current business requests (including already-consumed result requests), drag and local feedback take priority. Covered/reduced/missing cues are consumed rather than deferred until idle. A new business cue replaces connected immediately and retains existing once semantics. Desktop PetCanvas waits for PetStore to receive this window's first current-subscription preferences before forwarding a connection cue: the default starter is not evidence of a confirmed binding. Readiness survives store resubscription; stale callbacks cannot establish it. Pending imported-model URLs also do not spend a cue on the temporary starter; failed reads retain the existing fallback without a connection playback claim. Catalog/schema/fallback orders are unchanged. Each visual surface can present the same edge; deduplication uses the existing Renderer-module 256-entry cache, not durable receipts. Page remounts reuse it; cache eviction or renderer/window destruction can permit the same identity to be presented again. Offline removal is immediate; no disconnected playback or grace period is introduced.

## 8. Persistence boundaries

Persist only local preferences, registered asset metadata/bindings and durable connection evidence needed to reconnect: configured targets, validated installation identity, owned deployment records and window/visibility preferences. Protected activation records are separate from Renderer-safe metadata. Use an Electron main-owned OS-appropriate application data directory with atomic writes and restrictive permissions.

Do not persist completed/error unread state in release one. Do not collect or persist prompts, message text, transcript contents or raw provider payloads. Connection tokens/activation material are different: they stay in protected Main-private records and authorized generated hooks, never ordinary preferences, Renderer snapshots, logs or public artifacts. Runtime session state, bubbles, adapter connection state, and acknowledgements live in memory. Asset bytes are local user-selected data, not cloud-synced data. Config migrations are versioned and fail closed to safe defaults.

### Durable connection identity and restart

macOS `st_dev` can change across reboot. New durable records bind VolumeUUID, inode, birthtime, type, permissions, uid/gid and, for pi deployment, size/link/mtime/content digest. Current operations still require strict fd/path and dev identity; failed volume queries, a different volume, replaced files or changed permissions reject. `durable-file-identity.ts` bounds df/diskutil queries and checks path identity before/after, without cross-operation caching.

Old records lacking VolumeUUID retain strict checks. `connection-identity-migration.ts` is an explicit one-use, private-backup operation, not automatic startup repair: it permits only the approved device-number transition with other identity/content unchanged. No historic UUID can be inferred from a legacy record. Unknown/pending data remains preserved; an empty valid legacy record creates no phantom configuration.

pi starts by reading only private metadata and requires explicit resume. It may exclusively recreate a missing original runtime directory only after validating the original deployment and saving the new directory identity, keeping endpoint/token/extension bytes; unknown directories or sockets are never adopted. Claude/Codex restore unpaused observation from validated private materials under their own module contracts. Receiver readiness is not online evidence, and an already-running Claude without a new startup callback is not automatically adopted. Clean restart usability is not general crash recovery, power-loss durability or system-reboot acceptance.

## 9. Privacy and security

Default collection is minimum necessary: coarse lifecycle status, opaque session identity, and fallback naming facts. Native identifiers remain Main-private where required; public identities are bounded/scoped. A provider's permitted local project-name fallback does not authorize transcript, argv or environment collection. Secrets never enter renderer snapshots, logs, crash reports, or event `raw` fields. No cloud endpoint or remote asset fetch exists.

Electron baseline: context isolation, sandbox, disabled Node integration, strict CSP, no arbitrary navigation or unsanitized external links, and sender validation for IPC. Signing/notarization/update distribution and full D6 isolation are deferred, not passed. Main may spawn owned observation helpers, never configured Agents; use executable allowlists and argument arrays. Hooks/receivers must authenticate local connection origin as appropriate and enforce size/time limits. Asset validation is a resource-exhaustion and path-traversal boundary. Read-only product scope means no adapter API for approval, pause, steering, message sending, or other control actions.

## 10. Test seams and acceptance evidence

- **Domain tests:** reducer transition table, independent sessions, no deduplication, name fallback, one-bubble invariant, acknowledgement removal, restart non-persistence, and unsupported Open Session outcomes.
- **Contract tests:** schema validation, unknown/duplicate/out-of-order events, provider fixture translation, redaction, reconnects, and adapter capability results.
- **Application tests:** observation-to-snapshot flow and acknowledge-then-open ordering/failure behavior with fake ports.
- **Asset tests:** static GLBs with no clips or mappings, missing Idle, absent/null/unknown action entries, missing referenced clips, coarse fallback and restoration of the default pose; malformed, oversized, texture/geometry/bone/animation limit and external texture fixtures remain rejected.
- **Renderer tests:** projection rendering, bubble/Pet shared movement, independent visibility, click command, fallback animation, and no Node access.
- **Electron integration tests:** IPC sender restrictions, window lifecycle, process supervision, config migrations, and macOS/Windows capability probes. Manual matrix tests must cover transparency, always-on-top, drag, DPI, sleep, multi-monitor, and graceful degraded window behavior.

Ports and fake clocks make application tests independent of real agents and OS windows. Sanitized recorded fixtures are preferred to running vendor tools in every unit test; a small version-pinned smoke suite validates each supported adapter.

## 11. Unresolved decisions and explicit risks

- Supported layouts/versions and event fixtures are recorded in the three integration READMEs; other versions remain unverified and upstream schemas may drift.
- Provider observation granularity and Open Session outcomes remain bounded by the actual version/host evidence; unsupported is valid, not a reason to start a replacement Agent.
- Current GLB limits are implemented, not proof of minimum-hardware memory/GPU performance; wider performance claims require real measurements.
- Missing Provider facts remain unknown or use existing coarse facts; transcript reading and new SDK/RPC hosts are outside current scope.
- macOS/Windows transparency, click hit-testing, always-on-top, DPI, and multi-monitor behavior need real-device validation; Linux is not a supported release target despite possible best-effort behavior.
- Electron's memory/package overhead versus Tauri's smaller footprint remains a release-quality trade-off, but must not widen product scope or leak privileges into renderer.
- Imported license/author/attribution metadata does not establish redistribution rights; do not publish user models without permission.

No unresolved decision permits adding agent control, cloud sync, extra model formats, session aggregation, token progress, or remote asset downloads.
