import net from 'node:net';
import { createSessionId } from '@agent-pet/adapter-core';
import type {
  AdapterConfig,
  AdapterHandle,
  OpenSessionResult,
  ObservationSink,
  SessionObservationAdapter,
} from '@agent-pet/adapter-core';
import type { SessionObservation } from '@agent-pet/domain';
import { parsePiBridgeMessage, type PiBridgeMessage } from './protocol.js';

const MAX_LINE_BYTES = 64 * 1024;

type BridgeSessionOptions = {
  token: string;
  publish(observation: SessionObservation): void;
  connectionChanged?(state: 'connected' | 'degraded' | 'disconnected'): void;
};

export class PiBridgeSession {
  private connected = false;
  private lastSeq = 0;
  private context?: {
    processInstanceId: string;
    providerSessionId: string;
    sessionName?: string;
    projectName?: string;
    status: SessionObservation['status'];
    workId?: string;
  };

  constructor(private readonly options: BridgeSessionOptions) {}

  handle(input: unknown): void {
    const parsed = parsePiBridgeMessage(input);
    if (!parsed.ok || parsed.value.token !== this.options.token) return;
    const message = parsed.value;
    if (message.seq <= this.lastSeq) return;
    this.lastSeq = message.seq;

    if (message.type === 'hello') {
      this.context = {
        processInstanceId: message.processInstanceId,
        providerSessionId: message.providerSessionId,
        ...(message.sessionName !== undefined ? { sessionName: message.sessionName } : {}),
        ...(message.projectName !== undefined ? { projectName: message.projectName } : {}),
        status: message.status,
      };
      this.connected = true;
      this.options.connectionChanged?.('connected');
      this.publish(message.status, message.sentAt);
      return;
    }

    if (!this.context) return;
    if (
      message.processInstanceId !== this.context.processInstanceId ||
      message.providerSessionId !== this.context.providerSessionId
    ) return;

    if (message.type === 'session_info_changed') {
      const { sessionName: _previousName, ...context } = this.context;
      this.context = {
        ...context,
        ...(message.sessionName !== undefined ? { sessionName: message.sessionName } : {}),
      };
      this.publish(this.context.status, message.sentAt, this.context.workId);
    } else if (message.type === 'lifecycle') {
      const { workId: _previousWork, ...context } = this.context;
      this.context = { ...context, status: message.status,
        ...(message.workId !== undefined ? { workId: message.workId } : {}) };
      this.publish(message.status, message.sentAt, message.workId);
    }
  }

  disconnected(): void {
    if (!this.connected) return;
    this.connected = false;
    this.options.connectionChanged?.('disconnected');
  }

  private publish(status: SessionObservation['status'], sentAt: string, workId?: string): void {
    if (!this.context) return;
    this.options.publish({
      sessionId: createSessionId({
        provider: 'pi',
        processInstanceId: this.context.processInstanceId,
        providerSessionId: this.context.providerSessionId,
      }),
      provider: 'pi',
      status,
      observedAt: sentAt,
      ...(this.context.sessionName !== undefined ? { agentName: this.context.sessionName } : {}),
      ...(this.context.projectName !== undefined ? { projectName: this.context.projectName } : {}),
      ...(workId !== undefined ? { workId } : {}),
      revision: this.lastSeq,
      providerSessionId: this.context.providerSessionId,
      processInstanceId: this.context.processInstanceId,
    });
  }
}

export class PiBridgeAdapter implements SessionObservationAdapter {
  readonly provider = 'pi' as const;

  async start(config: AdapterConfig, sink: ObservationSink): Promise<AdapterHandle> {
    const endpoint = config.endpoint;
    const token = config.token;
    if (typeof endpoint !== 'string' || !endpoint || typeof token !== 'string' || token.length < 16) {
      throw new Error('pi adapter requires endpoint and a token of at least 16 characters');
    }

    const sockets = new Set<net.Socket>();
    const server = net.createServer(socket => {
      sockets.add(socket);
      let buffer = '';
      const bridge = new PiBridgeSession({
        token,
        publish: observation => sink.publish(observation),
        connectionChanged: state => sink.connectionChanged(state),
      });
      socket.setEncoding('utf8');
      socket.on('data', chunk => {
        buffer += chunk;
        if (Buffer.byteLength(buffer, 'utf8') > MAX_LINE_BYTES * 2) {
          socket.destroy();
          return;
        }
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
            socket.destroy();
            return;
          }
          if (line) {
            try { bridge.handle(JSON.parse(line)); } catch { /* malformed input is isolated */ }
          }
          newline = buffer.indexOf('\n');
        }
      });
      socket.on('close', () => {
        sockets.delete(socket);
        bridge.disconnected();
      });
      socket.on('error', () => socket.destroy());
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(endpoint, () => {
        server.off('error', reject);
        resolve();
      });
    });

    return {
      async stop() {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>(resolve => server.close(() => resolve()));
      },
    };
  }

  async openSession(): Promise<OpenSessionResult> {
    return { status: 'unsupported' };
  }
}
