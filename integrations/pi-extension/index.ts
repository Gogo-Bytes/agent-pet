import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';

// This file is intentionally self-contained so a user can load it with pi -e
// without installing Agent Pet as an npm package.
type PiContext = {
  cwd: string;
  mode?: string;
  signal?: AbortSignal | undefined;
  isIdle(): boolean;
  sessionManager: {
    getSessionId(): string | undefined;
    getSessionName?(): string | undefined;
  };
};

type PiApi = {
  on(event: string, handler: (payload: any, ctx: PiContext) => void): void;
};

type Activity = 'thinking' | 'responding' | 'reading' | 'writing' | 'searching' | 'executing' | 'compacting';
type Occurrence = 'tool_error' | 'output_limited' | 'cancelled';
type BridgeStatus = 'working' | 'completed' | 'error' | 'idle' | 'offline';

// Replaced with serialized data by configured-source.ts, never a runtime source loader.
const explicitConfig = undefined /* AGENT_PET_EXPLICIT_CONFIG */ as
  { endpoint: string; token: string } | undefined;

const processInstanceId = randomBytes(12).toString('hex');

function sessionName(ctx: PiContext): string | undefined {
  const name = ctx.sessionManager.getSessionName?.()?.trim();
  return name || undefined;
}

function stopReasonStatus(reason: unknown): BridgeStatus | undefined {
  switch (reason) {
    case 'stop':
    case 'toolUse':
      return 'completed';
    case 'error':
    case 'length':
      return 'error';
    case 'aborted':
      return 'idle';
    default:
      return undefined;
  }
}

export default function agentPetPiExtension(pi: PiApi): void {
  const endpoint = (explicitConfig?.endpoint ?? process.env.AGENT_PET_PI_ENDPOINT)?.trim();
  const token = (explicitConfig?.token ?? process.env.AGENT_PET_PI_TOKEN)?.trim();
  if (!endpoint || !token || token.length < 16) return;
  // Extension API coverage verified against pi 0.85.1 TUI. Runtime version is not
  // exposed by ctx. Fine capabilities stay unknown until their native event is
  // observed; registering a hook alone cannot prove an older runtime supports it.
  const capabilities = Object.fromEntries([
    ...['thinking', 'responding', 'reading', 'writing', 'searching', 'executing', 'compacting', 'waiting_input', 'tool_error', 'output_limited', 'cancelled'].map(key => [key, 'unknown']),
    ['retrying', 'unknown'],
  ]);

  const configuredEndpoint = endpoint;
  const configuredToken = token;

  let socket: net.Socket | undefined;
  let connecting = false;
  let active = false;
  let currentStatus: BridgeStatus = 'idle';
  let retry: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let retryDelay = 250;
  let seq = 0;
  let workCounter = 0;
  let providerSessionId: string | undefined;
  let sessionNameValue: string | undefined;
  let projectName: string | undefined;
  let workId: string | undefined;
  let lastTerminalStatus: BridgeStatus | undefined;
  let lastOccurrence: Occurrence | undefined;
  let occurrenceCounter = 0;
  let inWork = false;
  let workSignal: AbortSignal | undefined;
  let waiting = false;
  let compacting = false;
  let removeCompactAbort: (() => void) | undefined;
  const tools = new Map<string, Activity | undefined>();
  const streams = new Map<number, 'thinking' | 'responding'>();
  function facts(occurrence?: Occurrence) {
    const activities = [...new Set<Activity>([
      ...(compacting ? ['compacting' as const] : []),
      ...[...tools.values()].filter((kind): kind is Activity => kind !== undefined),
      ...streams.values(),
    ])];
    return { activities, waitingForInput: waiting,
      ...(occurrence ? { occurrence: { id: `event-${++occurrenceCounter}`, kind: occurrence } } : {}),
    };
  }
  function clearActivities() { removeCompactAbort?.(); removeCompactAbort = undefined; waiting = false; compacting = false; tools.clear(); streams.clear(); }
  function activity(ctx: PiContext, occurrence?: Occurrence) {
    if (occurrence) capabilities[occurrence] = 'supported';
    send('companion', ctx, { capabilities, facts: facts(occurrence) });
  }


  function wire(type: string, fields: Record<string, unknown> = {}): string {
    return JSON.stringify({
      type, schemaVersion: 1, token: configuredToken, seq: ++seq,
      processInstanceId, providerSessionId, sentAt: new Date().toISOString(),
      ...fields,
    }) + '\n';
  }

  function sendHeartbeat(): void {
    if (!active || !socket || connecting || socket.destroyed || !socket.writable) return;
    if (socket.writableLength > 64 * 1024) { socket.destroy(); return; }
    socket.write(wire('heartbeat'));
  }

  function connect(): void {
    if (!active || socket || connecting) return;
    clearTimeout(retry);
    connecting = true;
    const next = net.createConnection(configuredEndpoint, () => {
      if (!active || socket !== next) { next.destroy(); return; }
      connecting = false;
      retryDelay = 250;
      // Reconnect is a current-state baseline, not historical notification replay.
      next.write(wire('hello', {
        status: currentStatus === 'working' ? 'working' : 'idle',
        capabilities, facts: facts(),
        ...(sessionNameValue ? { sessionName: sessionNameValue } : {}),
        ...(projectName ? { projectName } : {}),
        ...(workId ? { workId } : {}),
      }));
    });
    socket = next;
    next.setTimeout(5000, () => { if (connecting) next.destroy(); });
    next.unref();
    next.on('error', () => next.destroy());
    next.on('close', () => {
      if (socket !== next) return;
      socket = undefined;
      connecting = false;
      if (active) {
        retry = setTimeout(connect, retryDelay);
        retry.unref();
        retryDelay = Math.min(5000, retryDelay * 2);
      }
    });
  }

  function send(type: string, _ctx: PiContext, fields: Record<string, unknown> = {}): void {
    if (!active) return;
    if (typeof fields.status === 'string') currentStatus = fields.status as BridgeStatus;
    if (socket && !connecting && !socket.destroyed && socket.writable) {
      if (socket.writableLength > 64 * 1024) { socket.destroy(); return; }
      socket.write(wire(type, type === 'hello' ? {
        ...(sessionNameValue ? { sessionName: sessionNameValue } : {}),
        ...(projectName ? { projectName } : {}), ...fields,
      } : fields));
    } else {
      connect();
    }
  }

  pi.on('session_start', (_event, ctx) => {
    if (ctx.mode !== 'tui') return;
    active = true;
    clearInterval(heartbeat);
    heartbeat = setInterval(sendHeartbeat, 15000);
    heartbeat.unref();
    providerSessionId = ctx.sessionManager.getSessionId() ?? 'ephemeral';
    sessionNameValue = sessionName(ctx);
    projectName = basename(ctx.cwd);
    lastTerminalStatus = undefined;
    lastOccurrence = undefined; workId = undefined; inWork = !ctx.isIdle(); workSignal = ctx.signal; clearActivities();
    send('hello', ctx, { status: ctx.isIdle() ? 'idle' : 'working', capabilities, facts: facts() });
  });

  pi.on('agent_start', (_event, ctx) => {
    if (!active) return;
    // pi may start continuations/retries before the whole batch settles.
    if (!inWork || !workId) { workId = `work-${++workCounter}`; inWork = true; }
    lastTerminalStatus = undefined; lastOccurrence = undefined;
    workSignal = ctx.signal;
    streams.clear();
    send('lifecycle', ctx, { status: 'working', workId, facts: facts() });
  });

  pi.on('message_end', (event, ctx) => {
    if (!active || !inWork || event?.message?.role !== 'assistant') return;
    workSignal ??= ctx.signal;
    const status = stopReasonStatus(event.message.stopReason);
    if (status) lastTerminalStatus = status;
    lastOccurrence = event.message.stopReason === 'aborted' ? 'cancelled' : event.message.stopReason === 'length' ? 'output_limited' : undefined;
    streams.clear();
    activity(ctx);
  });

  pi.on('agent_settled', (_event, ctx) => {
    if (!active || !ctx.isIdle() || !inWork) return;
    // pi can finalize a cancelled tool run with stopReason=error. The run's
    // native AbortSignal distinguishes cancellation without parsing tool/text bodies.
    const cancelled = workSignal?.aborted === true || lastOccurrence === 'cancelled';
    if (cancelled) lastOccurrence = 'cancelled';
    workSignal = undefined; inWork = false; clearActivities();
    if (lastOccurrence) capabilities[lastOccurrence] = 'supported';
    send('lifecycle', ctx, {
      capabilities, facts: facts(lastOccurrence),
      status: cancelled ? 'idle' : lastTerminalStatus ?? 'idle',
      ...(workId ? { workId } : {}),
    });
  });

  pi.on('message_update', (event, ctx) => {
    if (!active || !inWork) return;
    // Read only discriminant/index. Never touch delta, partial or message content.
    const update = event?.assistantMessageEvent;
    const index = update?.contentIndex;
    if (!Number.isSafeInteger(index) || index < 0 || index > 4095) return;
    if (update.type === 'thinking_start' || update.type === 'text_start') {
      if (!streams.has(index) && streams.size >= 32) return;
      const kind = update.type === 'thinking_start' ? 'thinking' : 'responding';
      capabilities[kind] = 'supported'; streams.set(index, kind);
    } else if (update.type === 'thinking_end' || update.type === 'text_end') streams.delete(index);
    else return;
    activity(ctx);
  });
  pi.on('tool_execution_start', (event, ctx) => {
    if (!active || !inWork || typeof event?.toolCallId !== 'string' || event.toolCallId.length > 256 || tools.size >= 64) return;
    workSignal ??= ctx.signal;
    const kinds: Record<string, Activity> = { read: 'reading', write: 'writing', edit: 'writing', grep: 'searching', find: 'searching', ls: 'searching', bash: 'executing', powershell: 'executing' };
    const kind = typeof event.toolName === 'string' && Object.hasOwn(kinds, event.toolName) ? kinds[event.toolName] : undefined;
    if (kind) capabilities[kind] = 'supported';
    tools.set(event.toolCallId, kind);
    activity(ctx);
  });
  pi.on('tool_execution_end', (event, ctx) => {
    if (!active || !inWork || typeof event?.toolCallId !== 'string' || !tools.has(event.toolCallId)) return;
    tools.delete(event.toolCallId);
    workSignal ??= ctx.signal;
    activity(ctx, event.isError === true && !workSignal?.aborted ? 'tool_error' : undefined);
  });
  pi.on('ui_prompt_start', (_event, ctx) => {
    if (!active) return;
    capabilities.waiting_input = 'supported'; waiting = true; activity(ctx);
  });
  pi.on('ui_prompt_end', (_event, ctx) => {
    if (!active || !waiting) return;
    waiting = false; activity(ctx);
  });
  pi.on('session_before_compact', (event, ctx) => {
    if (!active) return;
    removeCompactAbort?.();
    capabilities.compacting = 'supported'; compacting = true; activity(ctx);
    const signal = event?.signal as AbortSignal | undefined;
    const aborted = () => {
      if (!active || removeCompactAbort !== cleanup) return;
      cleanup(); removeCompactAbort = undefined; compacting = false; activity(ctx);
    };
    const cleanup = () => signal?.removeEventListener('abort', aborted);
    removeCompactAbort = cleanup;
    if (signal?.aborted) aborted();
    else signal?.addEventListener('abort', aborted, { once: true });
  });
  for (const name of ['session_compact', 'session_compact_failed']) pi.on(name, (_event, ctx) => {
    if (!active || !compacting) return;
    removeCompactAbort?.(); removeCompactAbort = undefined;
    compacting = false; activity(ctx);
  });

  pi.on('session_info_changed', (event, ctx) => {
    sessionNameValue = typeof event?.name === 'string' ? event.name.trim() || undefined : undefined;
    send('session_info_changed', ctx, sessionNameValue ? { sessionName: sessionNameValue } : {});
  });

  pi.on('session_shutdown', (_event, ctx) => {
    clearActivities(); inWork = false; workSignal = undefined;
    send('lifecycle', ctx, { status: 'offline', facts: facts() });
    active = false;
    clearTimeout(retry); clearInterval(heartbeat); heartbeat = undefined;
    socket?.destroy();
    socket = undefined;
    connecting = false;
  });
}
