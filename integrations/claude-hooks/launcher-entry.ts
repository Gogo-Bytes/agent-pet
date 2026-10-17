import * as fs from 'node:fs';
import { constants as osConstants } from 'node:os';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import { connectClaudePresence } from './presence-channel.js';
import { observeClaudeInvocation } from './launcher.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const pathValue = (value: unknown): value is string => typeof value === 'string' && isAbsolute(value) &&
  normalize(value) === value && Buffer.byteLength(value) <= 4096 && !/[\u0000-\u001f\u007f]/u.test(value);
function same(left: fs.Stats, right: fs.Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode && left.uid === right.uid &&
    left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.nlink === right.nlink;
}
function privateDirectory(path: string): fs.Stats {
  const stat = fs.lstatSync(path);
  if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o7777) !== 0o700) throw new Error();
  return stat;
}
/** Reads only the explicit app-private activation file. No Agent configuration is read. */
function activation(path: unknown): { executable: string; pluginDirectory: string; url: string; token: string } {
  if (!pathValue(path) || path !== join(dirname(path), 'activation.json')) throw new Error();
  const directory = dirname(path), parentBefore = privateDirectory(directory);
  let ancestor = '/';
  for (const part of directory.split('/').filter(Boolean)) {
    ancestor = join(ancestor, part); const stat = fs.lstatSync(ancestor);
    const sticky = stat.uid === 0 && !!(stat.mode & 0o1000);
    if (!stat.isDirectory() || (stat.uid !== process.getuid?.() && stat.uid !== 0) || ((stat.mode & 0o022) && !sticky)) throw new Error();
  }
  const before = fs.lstatSync(path);
  if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid?.() ||
      (before.mode & 0o7777) !== 0o600 || before.size > 8192) throw new Error();
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  let value: unknown;
  try {
    if (!same(before, fs.fstatSync(fd))) throw new Error();
    const buffer = Buffer.alloc(8193); let count = 0;
    while (count < buffer.length) {
      const size = fs.readSync(fd, buffer, count, buffer.length - count, count);
      if (!size) break; count += size;
    }
    if (count > 8192 || !same(before, fs.fstatSync(fd)) || !same(before, fs.lstatSync(path)) ||
        !same(parentBefore, privateDirectory(directory))) throw new Error();
    value = JSON.parse(buffer.subarray(0, count).toString('utf8'));
  } finally { fs.closeSync(fd); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'configurationId,executable,pluginDirectory,schemaVersion,token,url' ||
      record.schemaVersion !== 1 || typeof record.configurationId !== 'string' || !UUID.test(record.configurationId) ||
      !pathValue(record.executable) || !pathValue(record.pluginDirectory) || record.pluginDirectory !== join(directory, 'plugin') ||
      typeof record.token !== 'string' || !/^[0-9a-f]{64}$/.test(record.token) || typeof record.url !== 'string') throw new Error();
  const url = new URL(record.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/claude-presence' ||
      url.search || url.hash || url.username || url.password || url.href !== record.url) throw new Error();
  privateDirectory(record.pluginDirectory);
  return { executable: record.executable, pluginDirectory: record.pluginDirectory, url: record.url, token: record.token };
}

async function main(): Promise<number> {
  const configured = activation(process.argv[2]);
  let lost = false, invocation: Awaited<ReturnType<typeof observeClaudeInvocation>> | undefined;
  const channel = await connectClaudePresence({ url: configured.url, token: configured.token, onLost: () => {
    lost = true; if (invocation) void invocation.stopObserving();
  } });
  // The foreground process group already delivers Ctrl-C to the direct child.
  // Keep this observation wrapper alive without forwarding a duplicate signal.
  const interrupt = () => {};
  process.on('SIGINT', interrupt);
  try {
    if (lost) return 1;
    const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
    invocation = await observeClaudeInvocation({ command: configured.executable, args: process.argv.slice(3),
      pluginDirectory: configured.pluginDirectory, environment, onPresence: event => channel.report(event) });
    if (lost) await invocation.stopObserving();
    const result = await invocation.completed;
    return result.exitCode ?? (result.signal ? 128 + (osConstants.signals[result.signal] ?? 0) : 1);
  } finally {
    process.removeListener('SIGINT', interrupt);
    await channel.close();
  }
}
// This file is an executable boundary, not an importable Main or Renderer module.
void main().then(code => { process.exitCode = code; }, () => {
  // Fixed operator guidance only; never expose paths, credentials or raw errors.
  process.stderr.write('Agent Pet 连接不可用。请打开 Agent Pet，在连接页继续连接，再复制最新命令。\n');
  process.exitCode = 1;
});
