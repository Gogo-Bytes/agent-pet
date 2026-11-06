# Agent Pet pi extension

Self-contained, opt-in passive extension for the local legacy bridge. The supported
surface is **pi0.85.1 TUI**, not SDK/RPC or all forks/versions. Main and this extension
never start/resume/control pi, read Session JSONL, register production tools/commands or
modify Agent messages. Current priorities: [MVP](../../docs/MVP-EXECUTION-PLAN.md).

## Event contract

The extension sends bounded process/Session identity, name/project fallback, status,
workId, sequence/timestamp and enum companion facts/capabilities. It discards prompt,
response/thinking text, tool input/output, transcript paths, environment and provider
credentials. The bridge capability token is present in each legacy frame; this is not
managed auth/ack or cryptographic server authentication.

- `session_start` rereads current Session ID/name and initializes working/idle, never
  historical completion. Native Session UUID, extension processInstanceId, connection
  and work identity are different; `/reload` can preserve UUID while rebuilding runtime.
- `agent_start` establishes working. `message_end` extracts only assistant stopReason;
  agent_end/turn_end/tool completion are not whole-work completion. `agent_settled` plus
  ctx.isIdle and current-work/terminal guards determine completed/error.
- Stream phase, classified tool start/end, extension UI prompt and compaction hooks
  supply fine facts only after observed; initial capabilities are unknown, not guessed
  from runtime registration/version. Tool failure is transient, not task error.
- Current-run native AbortSignal plus stop reason distinguish cancellation; continuation
  replaces the reference, settled/shutdown/reload releases it. No control API is called.
- Name updates do not revive acknowledged results; fallback may use cwd basename, not
  a first prompt. `session_shutdown` cleans runtime, never invents task completion.
- Business retry remains unknown:0.85.1 SDK retry is not forwarded to ExtensionAPI.
  Socket retry and compaction willRetry are not replacements; [fixed-source explanation](../../docs/PROVIDER-ANIMATION-EVIDENCE.md).

[Trigger capabilities](../../docs/PET-TRIGGER-AUDIT.md) describe which facts can reach
animations. Fixed-version [extension types](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/extensions/types.ts)
and [AgentSession](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/agent-session.ts)
are the upstream contract, not the RPC event schema. Only ctx.mode==='tui' enables observation;
hasUI alone cannot distinguish RPC.

## Configured source and deployment

`renderConfiguredPiExtension({endpoint, token})` uses the fixed canonical index.ts
through Vite `?raw`, serializing validated data into one slot. It accepts no code/source
path and writes no target. Main bundles inert source without credentials; the generated
file contains the private target capability and uses only Node builtins, not workspace,
Electron, runtime npm install or an ASAR path interpreted by external Node.

`PiTemporaryDeployment` previews `<agentDir>/extensions/agent-pet.ts`, snapshots exact
source/target evidence privately and consumes a one-use confirmation. Apply revalidates,
creates exclusive0600 files and records ownership; conflicts/uncertain writes remain,
never overwritten or recursively removed. Controller-owned private persistence provides
explicit clean-restart resume; the temporary helper alone has only in-memory receipts.
Old artifacts without durable ownership are never adopted.

Default `~/.pi/agent` is only a candidate. `PI_CODING_AGENT_DIR` selects the actual
config root; session/package directories are not equivalent. GUI environment/installation
metadata cannot prove the user's active root. Multiple installations can share one target;
multiple targets remain independent configurations.

0.85.1 automatically discovers user extensions, but a root extensions/index or manifest
entry can suppress sibling discovery; ignore/exclusion rules, --no-extensions and project
trust may prevent loading. Fixed [package-manager source](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/package-manager.ts)
and [extension guide](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/extensions.md)
explain this scope. Bounded string package sources can coexist with user auto-discovery;
unknown shapes/nonempty extension filters remain blockers. Do not execute package resolution,
rewrite settings/trust/ignore, rename around a collision or leave discoverable backup .ts/.js
copies to force loading. Extensions have full host permissions, not a sandbox.

Only the user opens/reloads pi at a safe time; TUI rejects reload during streaming/compaction.
Deployment proves neither loading nor online/business activity. Updates/backups and
selective withdrawal require exact ownership and separate consent; deleting the file does
not unload a running extension. See [security](../../docs/SECURITY-BOUNDARIES.md) and
[restart identity](../../docs/ARCHITECTURE-DESIGN.md#durable-connection-identity-and-restart).

## Reconnection and ownership

Every connection sends a fresh hello with current working/idle and work identity, never
historical occurrences. Failures back off from250ms to5s; timers/sockets unref, writes
bounded, no offline event queue. Work finished disconnected is not replayed as unread.
Application-held unread survives baseline/metadata; transport loss clears current activity.
Shutdown stops retries without keeping pi alive. Optional heartbeat is not a required lease
for old extensions; authenticated silence is not itself failure.

Only valid hello admits Session transport ownership. Superseded peer name/companion frames
and close cannot reclaim or disconnect its replacement. A same-socket Session change clears
the old identity before the new baseline without flashing configuration offline; repeated
same-identity hello is not a new configuration edge. Separate configuration namespaces remain
isolated. `openSession` stays unsupported until the original terminal can be reliably located;
starting a new terminal/session is not an implementation.

## Explicit development loading

The separately authorized dev Adapter must already use the same endpoint/token. Example
only; never execute or deploy it automatically or copy a real token into logs/Git:

```sh
AGENT_PET_PI_ENDPOINT=/tmp/agent-pet-pi.sock \
AGENT_PET_PI_TOKEN=replace-with-the-same-random-token \
pi -e ./integrations/pi-extension/index.ts
```

Trust the source and use pi's documented loading mechanism; events before loading are not
reconstructed. Production setup uses the exact selected target and its preview, not this
illustrative shared pathname. A supplied dev environment reserves its route even if invalid;
Main does not silently fall back or start a second bridge.

## Development checks

```sh
pnpm exec vitest run integrations/pi-extension --maxWorkers=1
```

Source-named tests load generated source in self-owned Node processes with synthetic hooks,
real isolated sockets and Application, including actual applied artifacts. These prove
mapping/cleanup/no-replay and source independence, not real TUI/reload/Windows or GPU quality.
`test-support/live-check.ts` is never imported/deployed by the product: it supplies a
user-invoked native confirmation and zero-cost throwing local provider, but never selects
a model, sends prompts, cancels work or emits fake observations. Loading it into real pi
still requires exact current authorization, not an old test command.
