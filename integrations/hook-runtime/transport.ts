import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
const MAX_PEERS = 16, MAX_EVENT_IDS = 1024;
const tokenPattern = /^[0-9a-f]{64}$/;
export type HookDelivery<Fact> = { schemaVersion: 1; runId: string; eventId: string; fact: Fact };
export type HookDeliveryResult = 'delivered' | 'ignored' | 'invalid' | 'unavailable';
/** Isolated metadata transport, not an Adapter or presence detector.
 * acceptRun must be backed by trusted invocation binding, never by a run ID supplied in a request.
 * Socket close is delivery cleanup only. No Session status is published or inferred here.
 */
export async function startHookReceiver<Fact>(options: {
  route: string; maxBytes: number; parse(input: string): HookDelivery<Fact> | undefined;
  token: string;
  acceptRun(runId: string): boolean;
  /** Synchronous metadata commit only. Async consumers must not be connected here. */
  onFact(delivery: HookDelivery<Fact>): undefined;
}): Promise<{ url: string; stop(): Promise<void> }> {
  if (!tokenPattern.test(options.token)) throw new Error('Invalid hook receiver configuration');
  const credential = Buffer.from(`Bearer ${options.token}`);
  const sockets = new Set<Socket>(), seen = new Set<string>();
  let stopping = false, stopPromise: Promise<void> | undefined;
  let host = '';
  const server = http.createServer({ maxHeaderSize: 4096 }, (request, response) => {
    const reply = (code: number) => {
      response.writeHead(code, { Connection: 'close', 'Content-Length': '0' }); response.end();
    };
    if (stopping) { reply(503); return; }
    // Local CLI only: reject browser requests and any alternate authority or route.
    if (request.method !== 'POST' || request.url !== options.route || request.headers.host !== host ||
        request.headers.origin !== undefined || request.headers['content-type'] !== 'application/json') { reply(400); return; }
    const provided = Buffer.from(request.headers.authorization ?? '');
    if (provided.length !== credential.length || !timingSafeEqual(provided, credential)) { reply(401); return; }
    const length = request.headers['content-length'];
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > options.maxBytes)) { reply(413); return; }
    let size = 0, rejected = false;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      if (stopping || rejected) return;
      size += chunk.length;
      if (size > options.maxBytes) { rejected = true; chunks.length = 0; reply(413); request.destroy(); }
      else chunks.push(chunk);
    });
    request.on('error', () => { chunks.length = 0; });
    request.on('end', () => {
      if (stopping || rejected) { chunks.length = 0; return; }
      const delivery = options.parse(Buffer.concat(chunks).toString('utf8'));
      chunks.length = 0;
      if (!delivery) { reply(400); return; }
      try {
        const bound: unknown = options.acceptRun(delivery.runId);
        if (bound !== true) {
          // Defend JS callers as well as the synchronous TypeScript contract.
          void Promise.resolve(bound).catch(() => {});
          if (!stopping) reply(403);
          return;
        }
        if (stopping) return;
        const key = `${delivery.runId}:${delivery.eventId}`;
        if (seen.has(key)) { reply(204); return; }
        const result: unknown = options.onFact(delivery);
        if (result !== undefined) {
          void Promise.resolve(result).catch(() => {});
          throw new Error('Hook sink must be synchronous');
        }
        if (stopping) return;
        seen.add(key);
        if (seen.size > MAX_EVENT_IDS) seen.delete(seen.values().next().value!);
        reply(204);
      } catch { reply(503); }
    });
  });
  server.headersTimeout = 1000; server.requestTimeout = 1500; server.keepAliveTimeout = 1;
  server.maxRequestsPerSocket = 1;
  server.on('connection', socket => {
    if (stopping || sockets.size >= MAX_PEERS) { socket.destroy(); return; }
    sockets.add(socket);
    const deadline = setTimeout(() => socket.destroy(), 1500); deadline.unref();
    socket.on('close', () => { clearTimeout(deadline); sockets.delete(socket); }); socket.on('error', () => socket.destroy());
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  // Deliberately not advertised outside the process until listen succeeds.
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  server.on('error', () => { stopping = true; for (const socket of sockets) socket.destroy(); });
  return {
    url: `http://${host}${options.route}`,
    stop() {
      if (stopPromise) return stopPromise;
      stopping = true;
      // Publish the promise before closing peers; callback reentry cannot create a second stop.
      stopPromise = new Promise<void>((resolve, reject) => server.close(error => error ? reject(new Error('Hook receiver stop failed')) : resolve()));
      for (const socket of sockets) socket.destroy();
      seen.clear();
      return stopPromise;
    },
  };
}

export function validHookEndpoint(address: string, token: string, route: string): boolean {
  let url: URL;
  try { url = new URL(address); } catch { return false; }
  return url.protocol === 'http:' && url.hostname === '127.0.0.1' && Boolean(url.port) && !url.username && !url.password &&
    url.pathname === route && !url.search && !url.hash && tokenPattern.test(token);
}

export async function deliverHookBody(options: {
  url: string; token: string; route: string; body: string;
}): Promise<HookDeliveryResult> {
  if (!validHookEndpoint(options.url, options.token, options.route)) return 'invalid';
  const url = new URL(options.url);
  const body = options.body;
  return new Promise(resolve => {
    const request = http.request(url, { method: 'POST', agent: false, headers: {
      Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
    } }, response => {
      // Never follow a redirect or consume an instruction-bearing response body.
      const code = response.statusCode; response.destroy(); resolve(code === 204 ? 'delivered' : 'unavailable');
    });
    const timer = setTimeout(() => request.destroy(), 250); timer.unref();
    request.on('close', () => clearTimeout(timer));
    request.on('error', () => resolve('unavailable'));
    request.end(body);
  });
}
