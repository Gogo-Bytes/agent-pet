import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';

// This file is intentionally self-contained so a user can load it with pi -e
// without installing Agent Pet as an npm package.
type PiContext = {
  cwd: string;
  mode?: string;
  isIdle(): boolean;
  sessionManager: {
    getSessionId(): string | undefined;
    getSessionName?(): string | undefined;
  };
};

type PiApi = {
  on(event: string, handler: (payload: any, ctx: PiContext) => void): void;
};

type BridgeStatus = 'working' | 'completed' | 'error' | 'idle' | 'offline';

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
  const endpoint = process.env.AGENT_PET_PI_ENDPOINT?.trim();
  const token = process.env.AGENT_PET_PI_TOKEN?.trim();
  if (!endpoint || !token || token.length < 16) return;
  const configuredEndpoint = endpoint;
  const configuredToken = token;

  let socket: net.Socket | undefined;
  let connecting = false;
  let active = false;
  let currentStatus: BridgeStatus = 'idle';
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 250;
  let seq = 0;
  let workCounter = 0;
  let providerSessionId: string | undefined;
  let sessionNameValue: string | undefined;
  let projectName: string | undefined;
  let workId: string | undefined;
  let lastTerminalStatus: BridgeStatus | undefined;

  function wire(type: string, fields: Record<string, unknown> = {}): string {
    return JSON.stringify({
      type, schemaVersion: 1, token: configuredToken, seq: ++seq,
      processInstanceId, providerSessionId, sentAt: new Date().toISOString(),
      ...fields,
    }) + '\n';
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
    providerSessionId = ctx.sessionManager.getSessionId() ?? 'ephemeral';
    sessionNameValue = sessionName(ctx);
    projectName = basename(ctx.cwd);
    lastTerminalStatus = undefined;
    send('hello', ctx, { status: ctx.isIdle() ? 'idle' : 'working' });
  });

  pi.on('agent_start', (_event, ctx) => {
    workId = `work-${++workCounter}`;
    lastTerminalStatus = undefined;
    send('lifecycle', ctx, { status: 'working', workId });
  });

  pi.on('message_end', (event, ctx) => {
    if (event?.message?.role !== 'assistant') return;
    const status = stopReasonStatus(event.message.stopReason);
    if (status) lastTerminalStatus = status;
  });

  pi.on('agent_settled', (_event, ctx) => {
    if (!ctx.isIdle()) return;
    send('lifecycle', ctx, {
      status: lastTerminalStatus ?? 'idle',
      ...(workId ? { workId } : {}),
    });
  });

  pi.on('session_info_changed', (event, ctx) => {
    sessionNameValue = typeof event?.name === 'string' ? event.name.trim() || undefined : undefined;
    send('session_info_changed', ctx, sessionNameValue ? { sessionName: sessionNameValue } : {});
  });

  pi.on('session_shutdown', (_event, ctx) => {
    send('lifecycle', ctx, { status: 'offline' });
    active = false;
    clearTimeout(retry);
    socket?.destroy();
    socket = undefined;
    connecting = false;
  });
}
