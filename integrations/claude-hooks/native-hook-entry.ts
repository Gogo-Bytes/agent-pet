import * as fs from 'node:fs';
import http from 'node:http';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import type { Readable } from 'node:stream';
import { MAX_CLAUDE_HOOK_BYTES, normalizeClaudeHook } from './normalize.js';

const pathValue = (value: unknown): value is string => typeof value === 'string' && isAbsolute(value) &&
  normalize(value) === value && Buffer.byteLength(value) <= 4096 && !/[\u0000-\u001f\u007f]/u.test(value);
function same(a: fs.Stats, b: fs.Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.uid === b.uid && a.size === b.size &&
    a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.nlink === b.nlink;
}
function activation(path: unknown): { url: string; token: string } {
  if (!pathValue(path) || path !== join(dirname(path), 'activation.json')) throw new Error();
  const folder = dirname(path), directory = fs.lstatSync(folder);
  if (!directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o7777) !== 0o700) throw new Error();
  let ancestor = '/';
  for (const part of folder.split('/').filter(Boolean)) {
    ancestor = join(ancestor, part); const stat = fs.lstatSync(ancestor);
    if (!stat.isDirectory() || (stat.uid !== process.getuid?.() && stat.uid !== 0) ||
        ((stat.mode & 0o022) && !(stat.uid === 0 && (stat.mode & 0o1000)))) throw new Error();
  }
  const before = fs.lstatSync(path);
  if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid?.() || (before.mode & 0o7777) !== 0o600 || before.size > 8192) throw new Error();
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  let value: unknown;
  try {
    if (!same(before, fs.fstatSync(fd))) throw new Error();
    const bytes = Buffer.alloc(8193); let count = 0;
    while (count < bytes.length) {
      const size = fs.readSync(fd, bytes, count, bytes.length - count, count);
      if (!size) break; count += size;
    }
    if (count > 8192 || !same(before, fs.fstatSync(fd)) || !same(before, fs.lstatSync(path)) ||
        !same(directory, fs.lstatSync(folder))) throw new Error();
    value = JSON.parse(bytes.subarray(0, count).toString('utf8'));
  } finally { fs.closeSync(fd); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'configurationId,executable,observerExecutable,schemaVersion,token,url' || v.schemaVersion !== 1 ||
      typeof v.configurationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.configurationId) ||
      !pathValue(v.executable) || !pathValue(v.observerExecutable) || typeof v.token !== 'string' || !/^[0-9a-f]{64}$/.test(v.token) ||
      typeof v.url !== 'string') throw new Error();
  const url = new URL(v.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/claude-native-presence' ||
      url.username || url.password || url.search || url.hash || url.href !== v.url) throw new Error();
  return { url: v.url, token: v.token };
}
function readMessage(input: Readable): Promise<string | undefined> {
  return new Promise(resolve => {
    const chunks: Buffer[] = []; let size = 0, settled = false;
    const finish = (accept: boolean) => {
      if (settled) return;
      settled = true; clearTimeout(timer); input.pause();
      input.off('data', data); input.off('end', end); input.off('error', error); input.off('close', close);
      const ignore = () => {};
      const closed = () => { clearImmediate(pending); input.off('error', ignore); input.off('close', closed); };
      const pending = setImmediate(() => { if (input.closed) closed(); });
      input.on('error', ignore); input.once('close', closed); input.destroy();
      const message = accept ? Buffer.concat(chunks).toString('utf8') : undefined;
      chunks.length = 0; resolve(message);
    };
    const data = (chunk: unknown) => {
      if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string') { finish(false); return; }
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length;
      if (size > MAX_CLAUDE_HOOK_BYTES) finish(false); else chunks.push(bytes);
    };
    const end = () => finish(true), error = () => finish(false), close = () => finish(false);
    const timer = setTimeout(() => finish(false), 1000);
    if (input.destroyed || input.readableEnded) { finish(false); return; }
    input.on('data', data); input.once('end', end); input.once('error', error); input.once('close', close);
  });
}
async function main(): Promise<void> {
  const message = await readMessage(process.stdin);
  if (message === undefined) return;
  const parsed = normalizeClaudeHook(message);
  if (parsed.status !== 'accepted' || parsed.fact.kind !== 'session-started' || parsed.fact.childId !== undefined) return;
  const configured = activation(process.argv[2]);
  const body = JSON.stringify({ schemaVersion: 1, hookPid: process.pid, fact: { kind: parsed.fact.kind, source: parsed.fact.source } });
  await new Promise<void>(resolve => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); request.destroy(); resolve(); };
    const request = http.request(configured.url, { method: 'POST', agent: false, headers: {
      Authorization: `Bearer ${configured.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
    } }, response => { response.on('error', finish); response.on('data', finish); response.on('end', finish); response.resume(); });
    const timer = setTimeout(finish, 1000);
    request.on('error', finish); request.on('close', finish); request.end(body);
  });
}
// Hook failures never block, approve, control or produce text in the Agent.
void main().then(() => process.exit(0), () => process.exit(0));
