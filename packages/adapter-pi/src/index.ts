import net from 'node:net';
import type {
  AdapterConfig,
  AdapterHandle,
  OpenSessionResult,
  ObservationSink,
  SessionObservationAdapter,
} from '@agent-pet/adapter-core';
import type { SessionObservation } from '@agent-pet/domain';
import { parsePiBridgeMessage } from './protocol.js';
import { PiSessionMapper } from './session-mapper.js';

const MAX_LINE_BYTES = 64 * 1024;

type BridgeSessionOptions = {
  token: string;
  publish(observation: SessionObservation): void;
  connectionChanged?(state: 'connected' | 'degraded' | 'disconnected'): void;
};

export class PiBridgeSession {
  private readonly mapper: PiSessionMapper;
  constructor(private readonly options: BridgeSessionOptions) {
    this.mapper = new PiSessionMapper(options);
  }
  handle(input: unknown): void {
    const parsed = parsePiBridgeMessage(input);
    if (!parsed.ok || parsed.value.token !== this.options.token) return;
    this.mapper.handle(parsed.value);
  }
  disconnected(): void { this.mapper.disconnected(); }
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
    // TCP/socket acceptance is not online evidence. Only a validated hello counts,
    // and each start() owns its peers independently even when the adapter is shared.
    const connectedSockets = new Set<net.Socket>();
    let stopping = false;
    let stopPromise: Promise<void> | undefined;
    const server = net.createServer(socket => {
      if (stopping) { socket.destroy(); return; }
      sockets.add(socket);
      let buffer = '';
      const bridge = new PiBridgeSession({
        token,
        publish: observation => { if (!stopping && !socket.destroyed) sink.publish(observation); },
        connectionChanged: state => {
          if (stopping) return;
          if (state === 'connected' && !socket.destroyed) {
            const wasOnline = connectedSockets.size > 0;
            connectedSockets.add(socket);
            if (!wasOnline) sink.connectionChanged('connected');
          } else if (state === 'disconnected' && connectedSockets.delete(socket) && connectedSockets.size === 0) {
            sink.connectionChanged('disconnected');
          }
        },
      });
      socket.setEncoding('utf8');
      socket.on('data', chunk => {
        if (stopping || socket.destroyed) return;
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
      stop() {
        if (stopPromise) return stopPromise;
        stopping = true;
        const wasOnline = connectedSockets.size > 0;
        connectedSockets.clear();
        for (const socket of sockets) socket.destroy();
        stopPromise = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
          .then(() => { if (wasOnline) sink.connectionChanged('disconnected'); });
        return stopPromise;
      },
    };
  }

  async openSession(): Promise<OpenSessionResult> {
    return { status: 'unsupported' };
  }
}
