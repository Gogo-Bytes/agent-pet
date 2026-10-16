import { execFile } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { isAbsolute, normalize } from 'node:path';

export type ClaudeNativeProcessIdentity = { pid: number; ppid: number; uid: number;
  startSeconds: number; startMicroseconds: number; executable: string };
const ROUTE = '/claude-native-presence', TOKEN = /^[0-9a-f]{64}$/, MAX_PENDING = 16, MAX_ANCHORS = 32;
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const pid = (value: unknown): value is number => integer(value) && value > 0 && value <= 0x7fffffff;
const pathValue = (value: unknown): value is string => typeof value === 'string' && isAbsolute(value) &&
  normalize(value) === value && Buffer.byteLength(value) <= 4096 && !/[\u0000-\u001f\u007f]/u.test(value);
function identity(value: unknown, requested: number): value is ClaudeNativeProcessIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).sort().join(',') === 'executable,pid,ppid,startMicroseconds,startSeconds,uid' &&
    v.pid === requested && integer(v.ppid) && integer(v.uid) && integer(v.startSeconds) && Number(v.startSeconds) > 0 &&
    integer(v.startMicroseconds) && Number(v.startMicroseconds) < 1e6 && pathValue(v.executable);
}
const same = (a: ClaudeNativeProcessIdentity, b: ClaudeNativeProcessIdentity) => a.pid === b.pid && a.ppid === b.ppid &&
  a.uid === b.uid && a.startSeconds === b.startSeconds && a.startMicroseconds === b.startMicroseconds && a.executable === b.executable;
const anchorSame = (a: ClaudeNativeProcessIdentity, b: ClaudeNativeProcessIdentity) => a.pid === b.pid &&
  a.uid === b.uid && a.startSeconds === b.startSeconds && a.startMicroseconds === b.startMicroseconds && a.executable === b.executable;
function nativeProbe(probePath: string, requested: number): Promise<ClaudeNativeProcessIdentity | null> {
  return new Promise(resolve => {
    if (process.platform !== 'darwin' || !pid(requested)) { resolve(null); return; }
    execFile(probePath, [String(requested)], { timeout: 250, maxBuffer: 8192, encoding: 'utf8', windowsHide: true,
      env: {}, shell: false }, (error, stdout, stderr) => {
      if (error || stderr) { resolve(null); return; }
      try { const value: unknown = JSON.parse(stdout); resolve(identity(value, requested) ? value : null); }
      catch { resolve(null); }
    });
  });
}
function parseBody(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'fact,hookPid,schemaVersion' || v.schemaVersion !== 1 || !pid(v.hookPid) ||
      !v.fact || typeof v.fact !== 'object' || Array.isArray(v.fact)) return null;
  const fact = v.fact as Record<string, unknown>;
  return Object.keys(fact).sort().join(',') === 'kind,source' && fact.kind === 'session-started' &&
    typeof fact.source === 'string' && ['startup', 'resume', 'clear', 'compact'].includes(fact.source) ? v.hookPid : null;
}

/** Main-owned exact-PID observation. A short-lived hook proves ancestry only;
 * its exit never means Claude exited. No Agent spawning, signals or task facts.
 */
export async function startClaudeNativePresenceServer(options: {
  token: string; executable: string; observerExecutable: string; probePath: string;
  onChange(snapshot: { observedRuns: number; launchers: number }): undefined;
  /** Isolated process-metadata test seam. Production uses only the owned native helper. */
  probe?: (pid: number) => Promise<ClaudeNativeProcessIdentity | null>;
}): Promise<{ url: string; stop(): Promise<void> }> {
  if (!TOKEN.test(options.token) || ![options.executable, options.observerExecutable, options.probePath].every(pathValue) ||
      options.executable === options.observerExecutable) throw new Error('Invalid Claude native presence configuration');
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error('Claude native presence unavailable');
  const capability = Buffer.from(`Bearer ${options.token}`), anchors = new Map<number, ClaudeNativeProcessIdentity>();
  type Peer = { socket: Socket; timer: NodeJS.Timeout; request?: IncomingMessage; response?: ServerResponse; active: boolean };
  const peers = new Map<Socket, Peer>(), jobs = new Set<Promise<void>>();
  let host = '', stopping = false, notifying = false, pendingFinal = false, previous = 0, polling = false;
  let shutdown: Promise<void> | undefined;
  const probe = async (requested: number) => {
    try {
      const value = await (options.probe ? options.probe(requested) : nativeProbe(options.probePath, requested));
      return identity(value, requested) && value.uid === uid ? value : null;
    } catch { return null; }
  };
  const publish = (final = false) => {
    if (stopping && !final) return;
    if (notifying) { if (final) pendingFinal = true; return; }
    const next = anchors.size;
    if (previous === next) return;
    previous = next; notifying = true;
    try {
      const result: unknown = options.onChange({ observedRuns: next, launchers: next });
      if (result !== undefined) { void Promise.resolve(result).catch(() => {}); void stop(); }
    } catch { void stop(); }
    finally { notifying = false; if (pendingFinal) { pendingFinal = false; publish(true); } }
  };
  const verify = async (hookPid: number, active: () => boolean): Promise<ClaudeNativeProcessIdentity | null> => {
    const chain: ClaudeNativeProcessIdentity[] = [];
    let current = hookPid, found: ClaudeNativeProcessIdentity | undefined;
    // This bound includes the hook process and at most fifteen ancestors.
    for (let depth = 0; depth < 16; depth++) {
      if (stopping || !active() || chain.some(item => item.pid === current)) return null;
      const item = await probe(current);
      if (!item || (depth === 0 && item.executable !== options.observerExecutable)) return null;
      chain.push(item);
      if (depth > 0 && item.executable === options.executable) { found = item; break; }
      if (!pid(item.ppid)) return null;
      current = item.ppid;
    }
    if (!found) return null;
    // Recheck the complete chain after traversal. Reparenting/reuse during
    // validation must never transfer another process's observed identity.
    for (const item of chain) {
      const check = await probe(item.pid);
      if (stopping || !active() || !check || !same(item, check)) return null;
    }
    return found;
  };
  const retire = (peer: Peer) => { peer.active = false; clearTimeout(peer.timer); };
  const server = http.createServer({ maxHeaderSize: 4096 }, (request, response) => {
    const peer = peers.get(request.socket);
    const end = (code: number) => {
      if (!peer?.active) return;
      retire(peer); response.once('finish', () => request.socket.destroy());
      response.writeHead(code, { Connection: 'close', 'Content-Length': '0' }); response.end();
    };
    if (!peer || !peer.active || peer.request || stopping) { request.socket.destroy(); return; }
    peer.request = request; peer.response = response;
    const names = request.rawHeaders.filter((_value, index) => index % 2 === 0).map(value => value.toLowerCase());
    const provided = Buffer.from(request.headers.authorization ?? '');
    if (new Set(names).size !== names.length || request.method !== 'POST' || request.url !== ROUTE || request.headers.host !== host ||
        request.headers.origin !== undefined || request.headers['content-type'] !== 'application/json' ||
        request.headers['transfer-encoding'] !== undefined || request.headers.expect !== undefined ||
        !/^[1-9][0-9]{0,3}$/.test(request.headers['content-length'] ?? '') || Number(request.headers['content-length']) > 1024) {
      end(400); return;
    }
    if (provided.length !== capability.length || !timingSafeEqual(provided, capability)) { end(401); return; }
    let size = 0, bytes = Buffer.alloc(0);
    request.on('data', (chunk: Buffer) => {
      if (!peer.active) return;
      size += chunk.length;
      if (size > 1024) { bytes = Buffer.alloc(0); end(413); return; }
      bytes = Buffer.concat([bytes, chunk]);
    });
    request.on('error', () => { retire(peer); request.socket.destroy(); });
    request.on('aborted', () => retire(peer));
    request.on('end', () => {
      if (!peer.active || stopping) return;
      let value: unknown;
      try { value = JSON.parse(bytes.toString('utf8')); } catch { bytes = Buffer.alloc(0); end(400); return; }
      bytes = Buffer.alloc(0);
      const hookPid = parseBody(value);
      if (hookPid === null) { end(400); return; }
      if (jobs.size >= MAX_PENDING) { end(503); return; }
      const job = (async () => {
        const anchor = await verify(hookPid, () => peer.active);
        if (!peer.active || stopping) return;
        if (!anchor || (anchors.size >= MAX_ANCHORS && !anchors.has(anchor.pid))) { end(403); return; }
        const previous = anchors.get(anchor.pid);
        if (previous && !anchorSame(previous, anchor)) { anchors.delete(anchor.pid); publish(); end(409); return; }
        anchors.set(anchor.pid, anchor); publish();
        if (!stopping) end(204);
      })().catch(() => end(503));
      jobs.add(job); void job.finally(() => jobs.delete(job));
    });
  });
  server.maxRequestsPerSocket = 1; server.requestTimeout = 0; server.headersTimeout = 0; server.timeout = 0;
  server.on('connection', socket => {
    if (stopping || peers.size >= MAX_PENDING) { socket.destroy(); return; }
    const peer: Peer = { socket, active: true, timer: setTimeout(() => { retire(peer); socket.destroy(); }, 1000) };
    peer.timer.unref(); peers.set(socket, peer);
    socket.on('error', () => {});
    socket.once('close', () => { retire(peer); peers.delete(socket); });
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  const interval = setInterval(() => {
    if (stopping || polling || !anchors.size) return;
    polling = true;
    const job = Promise.all([...anchors.values()].map(async anchor => {
      const check = await probe(anchor.pid);
      if (stopping || anchors.get(anchor.pid) !== anchor) return;
      if (!check || !anchorSame(anchor, check)) { anchors.delete(anchor.pid); publish(); }
    })).then(() => {}, () => {}).finally(() => { polling = false; });
    jobs.add(job); void job.finally(() => jobs.delete(job));
  }, 1000); interval.unref();
  function stop(): Promise<void> {
    if (shutdown) return shutdown;
    stopping = true; clearInterval(interval);
    let complete!: () => void;
    shutdown = new Promise<void>(resolve => { complete = resolve; });
    anchors.clear(); publish(true);
    for (const peer of peers.values()) { retire(peer); peer.socket.destroy(); }
    server.close(() => { void Promise.allSettled([...jobs]).then(() => complete()); });
    return shutdown;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
  } catch { clearInterval(interval); throw new Error('Claude native presence unavailable'); }
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  server.on('error', () => { void stop(); });
  return { url: `http://${host}${ROUTE}`, stop };
}
