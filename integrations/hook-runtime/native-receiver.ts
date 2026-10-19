import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
/** Bounded authenticated ingress for async exact-PID checks. Payload parsing remains provider-owned. */
export async function startNativeReceiver<T>(options: { token: string; route: string; parse(text: string): T | null;
  accept(value: T, active: () => boolean): Promise<boolean> }) {
  if (!/^[a-f0-9]{64}$/.test(options.token) || !/^\/[a-z-]+$/.test(options.route)) throw new Error('Invalid native receiver');
  const credential = Buffer.from('Bearer ' + options.token);
  type Peer = { socket: Socket; timer: ReturnType<typeof setTimeout>; active: boolean; used: boolean };
  const peers = new Map<Socket, Peer>(), jobs = new Set<Promise<void>>();
  let host = '', stopping = false, queue = Promise.resolve(), closing: Promise<void> | undefined;
  const server = http.createServer({ maxHeaderSize: 4096 }, (request, response) => {
    const peer = peers.get(request.socket);
    if (!peer || peer.used || !peer.active || stopping) { request.socket.destroy(); return; }
    peer.used = true;
    const active = () => peer.active && !stopping;
    const reply = (code: number) => {
      if (!active()) return; peer.active = false; clearTimeout(peer.timer);
      response.once('finish', () => request.socket.destroy());
      response.writeHead(code, { Connection: 'close', 'Content-Length': '0' }); response.end();
    };
    const headers = request.rawHeaders.filter((_value, index) => index % 2 === 0).map(value => value.toLowerCase());
    const provided = Buffer.from(request.headers.authorization ?? '');
    if (new Set(headers).size !== headers.length || request.method !== 'POST' || request.url !== options.route ||
        request.headers.host !== host || request.headers.origin !== undefined || request.headers['content-type'] !== 'application/json' ||
        request.headers['transfer-encoding'] !== undefined || request.headers.expect !== undefined ||
        provided.length !== credential.length || !timingSafeEqual(provided, credential)) { reply(401); return; }
    const length = request.headers['content-length'];
    if (typeof length !== 'string' || !/^\d+$/.test(length) || Number(length) > 8192) { reply(413); return; }
    let size = 0; const chunks: Buffer[] = [];
    request.on('error', () => { chunks.length = 0; });
    request.on('data', (chunk: Buffer) => {
      if (!active()) return; size += chunk.length;
      if (size > 8192) { chunks.length = 0; reply(413); } else chunks.push(chunk);
    });
    request.on('end', () => {
      if (!active()) { chunks.length = 0; return; }
      let value: T | null;
      try { value = options.parse(Buffer.concat(chunks).toString('utf8')); } catch { value = null; }
      chunks.length = 0;
      if (value === null) { reply(400); return; }
      if (jobs.size >= 16) { reply(503); return; }
      const parsed = value;
      const job = queue.then(async () => {
        if (!active()) return;
        reply(await options.accept(parsed, active) ? 204 : 403);
      }).catch(() => reply(503));
      queue = job; jobs.add(job); void job.finally(() => jobs.delete(job));
    });
  });
  server.on('connection', socket => {
    if (stopping || peers.size >= 16) { socket.destroy(); return; }
    const peer: Peer = { socket, active: true, used: false, timer: setTimeout(() => { peer.active = false; socket.destroy(); }, 1500) };
    peers.set(socket, peer); peer.timer.unref(); socket.on('error', () => {});
    socket.once('close', () => { peer.active = false; clearTimeout(peer.timer); peers.delete(socket); });
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  server.headersTimeout = 0; server.requestTimeout = 0; server.maxRequestsPerSocket = 1;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  function stop(): Promise<void> {
    if (closing) return closing; stopping = true;
    let done!: () => void; closing = new Promise<void>(resolve => { done = resolve; });
    for (const peer of peers.values()) { peer.active = false; clearTimeout(peer.timer); peer.socket.destroy(); }
    server.close(() => { void Promise.allSettled([...jobs]).then(() => done()); }); return closing;
  }
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  server.on('error', () => { void stop(); });
  return { url: `http://${host}${options.route}`, stop };
}
