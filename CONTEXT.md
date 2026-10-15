# Agent Pet Domain Context

## Product purpose

Agent Pet is an entertaining desktop companion for using multiple AI Agents. It visualizes Agent session states through pets and session bubbles, with a low-friction, non-technical user experience. pi is the first local macOS adapter, not the product boundary. The current MVP is read-only toward the Agent; authorized observation setup is distinct from Agent control.

Current scope and acceptance: [MVP execution plan](docs/MVP-EXECUTION-PLAN.md).

## Canonical terms

### Agent
A coding tool or runtime that produces observable session activity. The product is intended to support multiple Agents; pi is the first supported adapter and other providers are future scope until their own compatibility evidence exists.

### Adapter
The integration boundary for one Agent. An Adapter converts that Agent's native observation surface into the product's Session facts and optionally provides a way to open the originating Agent window.

### Session
One independently observed run of an Agent. Sessions are not aggregated or deduplicated in the product. A restarted run is a new Session.

### Session status
The latest known business state of a Session. Visible bubbles represent working, completed-unread, and error-unread; idle is a baseline, not an unread notification. Observation connection health is separate from Session status.

### Unread
A completed or failed Session result that has not been acknowledged by the user through its bubble. Unread state is transient and does not need to survive application restart in the first release.

### Session bubble
A compact visual representation of one Session. It follows the Pet, shows the Session name and status, and can be clicked independently to acknowledge the Session and request opening the originating Agent window.

### Pet
A 3D avatar associated with a Configured Agent in the shared management scene. The desktop overlay has one Pet with multiple independent Session bubbles; a Pet is not created per Session.

### Pet asset
A 3D GLB model with optional animations and descriptive metadata. A Pet asset with no animations is a valid static Pet; the current MVP uses the bundled asset.

### Observation capability

A Session fact that an Agent integration can reliably report in its current version, mode and connection. An unsupported or unknown observation capability is not evidence that the corresponding activity is absent.

Implementation vocabulary: `ObservationCapabilities` is supported/unsupported/unknown by signal; `CompanionFacts` holds bounded activity enums, a waiting flag and an optional occurrence identity. They supplement `SessionStatus`, never replace work/unread lifecycle. pi confirms fine support on actual native events rather than registration or a guessed runtime version. `baseline` preserves already held unread results on reconnect without reconstructing historical results in a fresh Application.

### Pet action

A named presentation intent, such as working, waiting for input or celebrating, independent of any Agent's native event names and any artist's animation names. Every Pet action is optional for an individual Pet asset.

### Pet action catalog

The product's versioned vocabulary of Pet actions available to artists. Inclusion in the catalog does not promise that every Agent can trigger the action or that every asset implements it.

### Animation mapping

An asset's optional association between a Pet action and an animation supplied by its artist. No association means the asset does not implement that action; it does not make the Pet invalid.

### Open Session
The user-visible action of bringing the originating Agent window or session to the foreground. It is Adapter-specific and may report unsupported or not-found rather than guaranteeing success.

### Configured Agent Session
A Session that the user has enabled through a supported Adapter and for which the product has a valid observation connection. The product does not promise discovery of every arbitrary process on the machine.

### Provider

The product-facing identity of an Agent integration. A Provider supplies discovery, connection, Session observation and optional Open Session capability through an Adapter, while keeping Agent-specific technical details out of the default user flow.

### Companion state

The user-facing interpretation of Agent and Session facts expressed through the Pet's mood, animation, bubble and short copy. Companion state is not a replacement for the underlying Session status or connection health.

### Pet asset package

A local, validated directory containing a Pet asset model and its descriptive metadata. The package is a user-import boundary; an arbitrary GLB file is not automatically a supported Pet asset.

### Configured Agent

A user-registered Agent configuration with its own identity, name and location. Configuration availability, observation connection health and Session activity are separate facts; a configuration can be offline or unsupported and can have its own Pet binding.

### Agent-Pet binding

The user choice that assigns a Pet asset to one Configured Agent. A binding overrides the global default Pet for that Agent; missing bindings fall back to the global default.

## Confirmed product relationships

```text
Agent -> Adapter -> Session
Session -> zero or one active Session bubble
Pet -> many Session bubbles
Pet -> one selected Pet asset
Session bubble -> one Open Session action
```

## First-release rules

- The desktop Pet represents many independent Sessions; the management home represents each online configuration with a separate Pet, including multiple configurations of the same Provider.
- The Pet and all visible bubbles move together.
- Bubbles can be hidden without necessarily hiding the Pet; Pet visibility and bubble visibility are separate controls.
- A working Session remains visible while working.
- When a Session completes or errors, its existing bubble changes state and becomes unread.
- Clicking a completed/error bubble acknowledges it and removes it from the visible bubble set; the click also requests Open Session.
- Session names use the Agent-provided name, then project name, then Adapter-generated fallback.
- Missing or unsupported Open Session capability is an explicit outcome, not a silent failure.
- The first release is read-only: it does not approve, pause, steer, or send messages to Agents.
