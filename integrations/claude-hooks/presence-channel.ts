import { timingSafeEqual } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { ClaudeInvocationPresence } from './launcher.js';

const TOKEN = /^[0-9a-f]{64}$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROUTE = '/claude-presence', CONTENT_TYPE = 'application/x-ndjson';
const MAX_BYTES = 2048, MAX_PEERS = 16, DEADLINE_MS = 1000;
type Phase = 'new' | 'started' | 'observed' | 'ended';
type Snapshot = { launchers: number; observedRuns: number };
function parse(value: unknown, wire: boolean): ClaudeInvocationPresence | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  const runId = record.runId, kind = record.kind;
  const keys = wire ? ['schemaVersion', 'runId', 'kind'] : ['runId', 'kind'];
  if (Object.keys(record).length !== keys.length || Object.keys(record).some(key => !keys.includes(key)) ||
      (wire && record.schemaVersion !== 1) || typeof runId !== 'string' || !UUID.test(runId) ||
      typeof kind !== 'string' || !['child-started', 'hook-observed', 'child-ended'].includes(kind)) return;
  return { runId, kind: kind as ClaudeInvocationPresence['kind'] };
}
function advance(phase: Phase, kind: ClaudeInvocationPresence['kind']): Phase | undefined {
  if (phase === 'new' && kind === 'child-started') return 'started';
  if (phase === 'started' && kind === 'hook-observed') return 'observed';
  if ((phase === 'started' || phase === 'observed') && kind === 'child-ended') return 'ended';
  return;
}
function consume(value: unknown) { void Promise.resolve(value).catch(() => {}); }

/** A separate launcher capability, never a hook receiver or SessionObservation source.
 * Loss of this channel retires observation only; it says nothing about Agent exit.
 */
export async function startClaudePresenceServer(options: {
  token: string; onChange(snapshot: Snapshot): undefined;
}): Promise<{ url: string; stop(): Promise<void> }> {
  if (!TOKEN.test(options.token)) throw new Error('Invalid Claude presence configuration');
  const credential = Buffer.from(`Bearer ${options.token}`);
  type Peer = { socket: Socket; timer: NodeJS.Timeout; request?: IncomingMessage; response?: ServerResponse;
    counted: boolean; retired: boolean; phase: Phase; runId?: string };
  const peers = new Map<Socket, Peer>(), runs = new Map<string, Peer>();
  let host = '', stopping = false, shutdown: Promise<void> | undefined;
  let notifying = false, finalPending = false;
  let previous: Snapshot = { launchers: 0, observedRuns: 0 };
  const snapshot = (): Snapshot => ({ launchers: [...peers.values()].filter(peer => peer.counted).length,
    observedRuns: [...runs.values()].filter(peer => peer.counted && peer.phase === 'observed').length });
  const publish = (final = false) => {
    if (stopping && !final) return;
    if (notifying) { if (final) finalPending = true; return; }
    const next = snapshot();
    if (next.launchers === previous.launchers && next.observedRuns === previous.observedRuns) return;
    previous = next; notifying = true;
    try {
      const result: unknown = options.onChange({ ...next });
      if (result !== undefined) { consume(result); void stop(); }
    } catch { void stop(); }
    finally { notifying = false; if (finalPending) { finalPending = false; publish(true); } }
  };
  const retire = (peer: Peer) => {
    if (peer.retired) return;
    peer.retired = true; peer.counted = false; clearTimeout(peer.timer);
    if (peer.runId && runs.get(peer.runId) === peer) runs.delete(peer.runId);
    publish();
  };
  const server = http.createServer({ maxHeaderSize: 4096 }, (request, response) => {
    const peer = peers.get(request.socket);
    const reject = (code: number) => {
      if (peer) retire(peer);
      response.once('finish', () => request.socket.destroy());
      if (!response.headersSent) response.writeHead(code, { Connection: 'close', 'Content-Length': '0' });
      response.end();
    };
    if (!peer || peer.retired || peer.request || stopping) { reject(503); return; }
    peer.request = request; peer.response = response;
    const headerNames = request.rawHeaders.filter((_value, index) => index % 2 === 0).map(value => value.toLowerCase());
    if (new Set(headerNames).size !== headerNames.length || request.method !== 'POST' || request.url !== ROUTE || request.headers.host !== host ||
        request.headers.origin !== undefined || request.headers['content-type'] !== CONTENT_TYPE ||
        request.headers['content-length'] !== undefined || request.headers['transfer-encoding'] !== 'chunked' ||
        request.headers.expect !== undefined) { reject(400); return; }
    const provided = Buffer.from(request.headers.authorization ?? '');
    if (provided.length !== credential.length || !timingSafeEqual(provided, credential)) { reject(401); return; }
    clearTimeout(peer.timer); peer.counted = true; publish();
    if (stopping || peer.retired) return;
    response.writeHead(200, { 'Content-Type': CONTENT_TYPE, Connection: 'close' }); response.flushHeaders();
    let size = 0, pending = Buffer.alloc(0);
    request.on('data', (chunk: Buffer) => {
      if (stopping || peer.retired) return;
      size += chunk.length;
      if (size > MAX_BYTES) { pending = Buffer.alloc(0); reject(413); return; }
      pending = Buffer.concat([pending, chunk]);
      while (!stopping && !peer.retired) {
        const end = pending.indexOf(10);
        if (end < 0) break;
        const line = pending.subarray(0, end); pending = pending.subarray(end + 1);
        let value: unknown;
        try { value = JSON.parse(line.toString('utf8')); } catch { reject(400); return; }
        const event = parse(value, true), next = event && advance(peer.phase, event.kind);
        if (!event || !next || (peer.runId !== undefined && peer.runId !== event.runId) ||
            (peer.phase === 'new' && runs.has(event.runId))) { reject(400); return; }
        peer.runId = event.runId; peer.phase = next; runs.set(event.runId, peer); publish();
      }
    });
    request.on('error', () => { pending = Buffer.alloc(0); retire(peer); request.socket.destroy(); });
    request.on('end', () => { pending = Buffer.alloc(0); retire(peer); response.end(); });
    response.on('error', () => { retire(peer); request.socket.destroy(); });
  });
  server.headersTimeout = DEADLINE_MS; server.requestTimeout = 0; server.timeout = 0;
  server.keepAliveTimeout = 1; server.maxRequestsPerSocket = 1;
  server.on('connection', socket => {
    if (stopping || peers.size >= MAX_PEERS) { socket.destroy(); return; }
    const timer = setTimeout(() => socket.destroy(), DEADLINE_MS); timer.unref();
    const peer: Peer = { socket, timer, counted: false, retired: false, phase: 'new' }; peers.set(socket, peer);
    socket.on('close', () => { retire(peer); peers.delete(socket); });
    socket.on('error', () => { retire(peer); socket.destroy(); });
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  server.on('checkContinue', (request, response) => { response.writeHead(400, { Connection: 'close' }); response.end(); request.socket.destroy(); });
  function stop(): Promise<void> {
    if (shutdown) return shutdown;
    stopping = true;
    let complete!: () => void;
    shutdown = new Promise<void>(resolve => { complete = resolve; });
    for (const peer of peers.values()) { retire(peer); peer.socket.destroy(); }
    runs.clear(); publish(true);
    server.close(() => complete());
    return shutdown;
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  }).catch(() => { throw new Error('Claude presence unavailable'); });
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  server.on('error', () => { void stop(); });
  return { url: `http://${host}${ROUTE}`, stop };
}

/** One persistent, accepted channel per invocation. No redirects, retries or response instructions. */
export async function connectClaudePresence(options: {
  url: string; token: string; onLost(): undefined;
}): Promise<{ report(event: ClaudeInvocationPresence): undefined; close(): Promise<void> }> {
  let url: URL;
  try { url = new URL(options.url); } catch { throw new Error('Invalid Claude presence configuration'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password ||
      url.pathname !== ROUTE || url.search || url.hash || !TOKEN.test(options.token)) throw new Error('Invalid Claude presence configuration');
  return new Promise((resolve, reject) => {
    let ready = false, closed = false, explicit = false, phase: Phase = 'new', runId: string | undefined, bytes = 0;
    let response: IncomingMessage | undefined;
    let resolveClosed!: () => void;
    const completed = new Promise<void>(done => { resolveClosed = done; });
    const lost = () => {
      if (closed) return;
      closed = true; clearTimeout(timer); request.destroy(); response?.destroy();
      if (!ready) reject(new Error('Claude presence unavailable'));
      else if (!explicit) { try { consume(options.onLost()); } catch { /* Callback cannot affect Agent lifetime. */ } }
    };
    const request = http.request(url, { method: 'POST', agent: false, headers: {
      Authorization: `Bearer ${options.token}`, 'Content-Type': CONTENT_TYPE, 'Transfer-Encoding': 'chunked',
    } });
    const timer = setTimeout(lost, DEADLINE_MS); timer.unref();
    request.on('error', lost);
    request.on('close', () => { lost(); resolveClosed(); });
    request.on('response', incoming => {
      response = incoming;
      incoming.on('error', lost); incoming.on('end', lost); incoming.on('close', lost);
      incoming.on('data', lost);
      if (closed || incoming.statusCode !== 200 || incoming.headers['content-type'] !== CONTENT_TYPE) { lost(); return; }
      ready = true; clearTimeout(timer);
      resolve({
        report(input) {
          let event: ClaudeInvocationPresence | undefined;
          try { event = parse(input, false); } catch { lost(); throw new Error('Claude presence report unavailable'); }
          const next = event && advance(phase, event.kind);
          if (closed || !event || !next || (runId !== undefined && runId !== event.runId)) {
            lost(); throw new Error('Claude presence report unavailable');
          }
          const line = `${JSON.stringify({ schemaVersion: 1, ...event })}\n`;
          bytes += Buffer.byteLength(line);
          if (bytes > MAX_BYTES || request.writableLength + Buffer.byteLength(line) > MAX_BYTES) {
            lost(); throw new Error('Claude presence report unavailable');
          }
          phase = next; runId = event.runId;
          try { request.write(line); } catch { lost(); throw new Error('Claude presence report unavailable'); }
          return undefined;
        },
        close() { explicit = true; lost(); return completed; },
      });
    });
    request.flushHeaders();
  });
}
