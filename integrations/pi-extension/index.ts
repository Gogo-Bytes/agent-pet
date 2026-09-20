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

const MAX_PENDING = 32;
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
  let pending: string[] = [];
  let seq = 0;
  let workCounter = 0;
  let providerSessionId: string | undefined;
  let sessionNameValue: string | undefined;
  let projectName: string | undefined;
  let workId: string | undefined;
  let lastTerminalStatus: BridgeStatus | undefined;

  function connect(): void {
    if (socket || connecting) return;
    connecting = true;
    const next = net.createConnection(configuredEndpoint, () => {
      connecting = false;
      const current = socket;
      if (!current) return;
      for (const message of pending.splice(0)) current.write(message);
    });
    socket = next;
    next.on('error', () => {
      pending = [];
      socket = undefined;
      connecting = false;
    });
    next.on('close', () => {
      socket = undefined;
      connecting = false;
    });
  }

  function send(type: string, ctx: PiContext, fields: Record<string, unknown> = {}): void {
    const currentSessionId = providerSessionId ?? ctx.sessionManager.getSessionId() ?? 'ephemeral';
    providerSessionId = currentSessionId;
    sessionNameValue ??= sessionName(ctx);
    projectName ??= basename(ctx.cwd);
    const message = JSON.stringify({
      type,
      schemaVersion: 1,
      token: configuredToken,
      seq: ++seq,
      processInstanceId,
      providerSessionId: currentSessionId,
      sentAt: new Date().toISOString(),
      ...(type === 'hello' && sessionNameValue ? { sessionName: sessionNameValue } : {}),
      ...(type === 'hello' && projectName ? { projectName } : {}),
      ...fields,
    }) + '\n';
    if (socket && !socket.destroyed && socket.writable) {
      socket.write(message);
      return;
    }
    if (pending.length < MAX_PENDING) pending.push(message);
    connect();
  }

  pi.on('session_start', (_event, ctx) => {
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
    socket?.end();
    socket = undefined;
    pending = [];
  });
}
