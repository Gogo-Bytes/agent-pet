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
