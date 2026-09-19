# Agent Pet Domain Context

## Product purpose

Agent Pet is a desktop companion that observes configured local coding-agent sessions and visualizes selected session states through one customizable 3D pet and its session bubbles. It is read-only in the first release.

## Canonical terms

### Agent
A supported coding tool or runtime that produces observable session activity. Initial Agents are Codex, pi, and Claude Code.

### Adapter
The integration boundary for one Agent. An Adapter converts that Agent's native observation surface into the product's Session facts and optionally provides a way to open the originating Agent window.

### Session
One independently observed run of an Agent. Sessions are not aggregated or deduplicated in the product. A restarted run is a new Session.

### Session status
The latest known state of a Session. The product may know more states internally, but the first release surfaces only working, completed-unread, and error-unread.

### Unread
A completed or failed Session result that has not been acknowledged by the user through its bubble. Unread state is transient and does not need to survive application restart in the first release.

### Session bubble
A compact visual representation of one Session. It follows the Pet, shows the Session name and status, and can be clicked independently to acknowledge the Session and request opening the originating Agent window.

### Pet
One 3D avatar rendered by the desktop application. Multiple Sessions are represented by multiple bubbles around the same Pet; the product does not create one Pet per Session.

### Pet asset
A user-selectable 3D GLB model plus the animation metadata needed by the Pet. The first release accepts GLB only and applies explicit complexity and safety limits.

### Open Session
The user-visible action of bringing the originating Agent window or session to the foreground. It is Adapter-specific and may report unsupported or not-found rather than guaranteeing success.

### Configured Agent Session
A Session that the user has enabled through a supported Adapter and for which the product has a valid observation connection. The product does not promise discovery of every arbitrary process on the machine.

## Confirmed product relationships

```text
Agent -> Adapter -> Session
Session -> zero or one active Session bubble
Pet -> many Session bubbles
Pet -> one selected Pet asset
Session bubble -> one Open Session action
```

## First-release rules

- One Pet represents many independent Sessions.
- The Pet and all visible bubbles move together.
- Bubbles can be hidden without necessarily hiding the Pet; Pet visibility and bubble visibility are separate controls.
- A working Session remains visible while working.
- When a Session completes or errors, its existing bubble changes state and becomes unread.
- Clicking a completed/error bubble acknowledges it and removes it from the visible bubble set; the click also requests Open Session.
- Session names use the Agent-provided name, then project name, then Adapter-generated fallback.
- Missing or unsupported Open Session capability is an explicit outcome, not a silent failure.
- The first release is read-only: it does not approve, pause, steer, or send messages to Agents.
