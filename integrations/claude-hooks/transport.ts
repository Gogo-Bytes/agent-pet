import { randomUUID, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { claudeFailureKinds, normalizeClaudeHook, type ClaudeHookFact } from './normalize.js';

export const MAX_CLAUDE_DELIVERY_BYTES = 8192;
const MAX_PEERS = 16, MAX_EVENT_IDS = 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const tokenPattern = /^[0-9a-f]{64}$/;
export type ClaudeHookDelivery = { schemaVersion: 1; runId: string; eventId: string; fact: ClaudeHookFact };
export type ClaudeDeliveryResult = 'delivered' | 'ignored' | 'invalid' | 'unavailable';
const fields: Record<ClaudeHookFact['kind'], readonly string[]> = {
  'session-started': ['source'], 'session-ended': [], 'turn-submitted': [],
  'tool-requested': ['toolCallId', 'activity'], 'tool-succeeded': ['toolCallId', 'activity'],
  'approval-check': ['activity'], 'tool-failed': ['toolCallId', 'activity', 'interrupted'],
  'permission-prompt': [], 'response-stopped': ['continuedByHook', 'backgroundWork'],
  'turn-failed': ['failure'], 'compact-started': [], 'compact-finished': [],
};
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function id(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function nullableBoolean(value: unknown): boolean { return value === null || typeof value === 'boolean'; }
export function validClaudeHookFact(value: unknown): value is ClaudeHookFact {
  if (!object(value) || typeof value.kind !== 'string' || !Object.hasOwn(fields, value.kind)) return false;
  const kind = value.kind as ClaudeHookFact['kind'];
  const allowed = new Set(['kind', 'providerSessionId', 'promptId', 'childId', ...fields[kind]]);
  if (Object.keys(value).some(key => !allowed.has(key)) || !id(value.providerSessionId)) return false;
  if (('promptId' in value && !id(value.promptId)) || ('childId' in value && !id(value.childId))) return false;
  if (fields[kind].includes('toolCallId') && !id(value.toolCallId)) return false;
  if (fields[kind].includes('activity') && (typeof value.activity !== 'string' || !['reading', 'writing', 'searching', 'executing', 'other'].includes(value.activity))) return false;
  if (kind === 'session-started' && (typeof value.source !== 'string' || !['startup', 'resume', 'clear', 'compact'].includes(value.source))) return false;
  if (kind === 'tool-failed' && !nullableBoolean(value.interrupted)) return false;
  if (kind === 'response-stopped' && (typeof value.continuedByHook !== 'boolean' || !nullableBoolean(value.backgroundWork))) return false;
  if (kind === 'turn-failed' && !(claudeFailureKinds as readonly unknown[]).includes(value.failure)) return false;
  return true;
}
/** Strict normalized wire schema: native raw fields have no place in this protocol. */
export function parseClaudeDelivery(input: string): ClaudeHookDelivery | undefined {
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > MAX_CLAUDE_DELIVERY_BYTES) return;
  let value: unknown;
  try { value = JSON.parse(input); } catch { return; }
  if (!object(value) || Object.keys(value).some(key => !['schemaVersion', 'runId', 'eventId', 'fact'].includes(key)) ||
      value.schemaVersion !== 1 || typeof value.runId !== 'string' || !uuid.test(value.runId) ||
      typeof value.eventId !== 'string' || !uuid.test(value.eventId) || !validClaudeHookFact(value.fact)) return;
  return value as ClaudeHookDelivery;
}

/** Isolated metadata transport, not an Adapter or presence detector.
 * acceptRun must be backed by trusted invocation binding, never by a run ID supplied in a request.
 * Socket close is delivery cleanup only. No Session status is published or inferred here.
 */
export async function startClaudeHookReceiver(options: {
  token: string;
  acceptRun(runId: string): boolean;
  /** Synchronous metadata commit only. Async consumers must not be connected here. */
  onFact(delivery: ClaudeHookDelivery): undefined;
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
    if (request.method !== 'POST' || request.url !== '/claude-hooks' || request.headers.host !== host ||
        request.headers.origin !== undefined || request.headers['content-type'] !== 'application/json') { reply(400); return; }
    const provided = Buffer.from(request.headers.authorization ?? '');
    if (provided.length !== credential.length || !timingSafeEqual(provided, credential)) { reply(401); return; }
    const length = request.headers['content-length'];
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_CLAUDE_DELIVERY_BYTES)) { reply(413); return; }
    let size = 0, rejected = false;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      if (stopping || rejected) return;
      size += chunk.length;
      if (size > MAX_CLAUDE_DELIVERY_BYTES) { rejected = true; chunks.length = 0; reply(413); request.destroy(); }
      else chunks.push(chunk);
    });
    request.on('error', () => { chunks.length = 0; });
    request.on('end', () => {
      if (stopping || rejected) { chunks.length = 0; return; }
      const delivery = parseClaudeDelivery(Buffer.concat(chunks).toString('utf8'));
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
    url: `http://${host}/claude-hooks`,
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

/** Future hook bootstrap calls this after binding a run. No stdout, instructions, retries or Agent control.
 * Only normalized metadata is sent, failures return a fixed result, and credentials stay in memory.
 */
export async function deliverClaudeHook(options: {
  url: string; token: string; runId: string; input: string; eventId?: string;
}): Promise<ClaudeDeliveryResult> {
  let url: URL;
  try { url = new URL(options.url); } catch { return 'invalid'; }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password ||
      url.pathname !== '/claude-hooks' || url.search || url.hash || !tokenPattern.test(options.token) || !uuid.test(options.runId)) return 'invalid';
  const normalized = normalizeClaudeHook(options.input);
  if (normalized.status !== 'accepted') return normalized.status === 'ignored' ? 'ignored' : 'invalid';
  const delivery: ClaudeHookDelivery = { schemaVersion: 1, runId: options.runId,
    eventId: options.eventId ?? randomUUID(), fact: normalized.fact };
  const body = JSON.stringify(delivery);
  if (!parseClaudeDelivery(body)) return 'invalid';
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
