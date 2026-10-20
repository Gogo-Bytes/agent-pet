import * as fs from 'node:fs';
import { basename, isAbsolute, join, normalize } from 'node:path';
import { TextDecoder } from 'node:util';
const MAX_BYTES = 64 * 1024;
export type Identity = { dev: number; ino: number; birthtimeMs: number; uid: number; gid: number; mode: number; volumeId?: string };
type Member = { key: string; start: number; end: number; value: Node };
export type Node = { kind: 'object' | 'array' | 'primitive'; start: number; end: number;
  members: Member[]; items: Node[]; value?: unknown };
export type Context = { directory: string; path: string; pending: string; directories: [string, Identity][] };
export type Source = { text: string | null; stat: fs.Stats | null };

export const uid = () => { if (!process.getuid) throw new Error(); return process.getuid(); };
export const exact = (value: unknown, names: readonly string[]): value is Record<string, unknown> => !!value && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).length === names.length && Object.keys(value).every(key => names.includes(key));
export const identity = (stat: fs.Stats): Identity => ({ dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs,
  uid: stat.uid, gid: stat.gid, mode: stat.mode });
export const sameIdentity = (a: Identity, b: Identity) => a.dev === b.dev && a.ino === b.ino &&
  a.birthtimeMs === b.birthtimeMs && a.mode === b.mode && a.uid === b.uid && a.gid === b.gid;
const sameFile = (a: fs.Stats, b: fs.Stats) => sameIdentity(identity(a), identity(b)) && a.size === b.size &&
  a.nlink === b.nlink && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
export const commandValid = (value: unknown): value is string => typeof value === 'string' && value.trim() === value && value.length > 0 &&
  Buffer.byteLength(value) <= 8192 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
export function validDirectory(value: unknown): value is string {
  return typeof value === 'string' && isAbsolute(value) && normalize(value) === value && value !== '/' &&
    Buffer.byteLength(value) <= 4096 && value.split('/').length <= 64 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
export function directoryPaths(directory: string): string[] {
  const paths = ['/']; let path = '/';
  for (const part of directory.split('/').filter(Boolean)) { path = join(path, part); paths.push(path); }
  return paths;
}
export function safeDirectory(path: string): fs.Stats {
  const stat = fs.lstatSync(path), stickyTmp = stat.uid === 0 && (stat.mode & 0o1000) !== 0 && basename(path) === 'tmp';
  if (!stat.isDirectory() || (stat.uid !== uid() && stat.uid !== 0) || ((stat.mode & 0o022) !== 0 && !stickyTmp)) throw new Error();
  return stat;
}
export function checkDirectories(context: Context): void {
  for (const [path, saved] of context.directories) if (!sameIdentity(saved, identity(safeDirectory(path)))) throw new Error();
  if (safeDirectory(context.directory).uid !== uid()) throw new Error();
}
export function absent(path: string): boolean {
  try { fs.lstatSync(path); return false; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
}
function settingsStat(path: string): fs.Stats {
  const stat = fs.lstatSync(path), mode = stat.mode & 0o7777;
  if (!stat.isFile() || stat.uid !== uid() || stat.nlink !== 1 || ![0o600, 0o644].includes(mode) || stat.size > MAX_BYTES) throw new Error();
  return stat;
}
function readFile(path: string): { text: string; stat: fs.Stats } {
  const before = settingsStat(path); let fd: number | undefined;
  try {
    fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    if (!sameFile(before, fs.fstatSync(fd))) throw new Error();
    const bytes = Buffer.alloc(before.size + 1); let count = 0;
    while (count < bytes.length) {
      const length = fs.readSync(fd, bytes, count, bytes.length - count, count); if (!length) break; count += length;
    }
    if (count > MAX_BYTES || count !== before.size || !sameFile(before, fs.fstatSync(fd)) || !sameFile(before, settingsStat(path))) throw new Error();
    const closing = fd; fd = undefined; fs.closeSync(closing);
    return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, count)), stat: before };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
export function readSource(context: Context): Source {
  checkDirectories(context); if (!absent(context.pending)) throw new Error();
  const source = absent(context.path) ? { text: null, stat: null } : readFile(context.path);
  checkDirectories(context); return source;
}

/** Locate JSON tokens without ever reserializing user values. Duplicate decoded keys,
 * invalid JSON/UTF-8, excessive nesting and excessive token counts fail closed.
 */
export function scan(text: string): Node {
  let position = 0, count = 0;
  const whitespace = () => { while (position < text.length && /[ \t\r\n]/.test(text[position]!)) position++; };
  const string = (): string => {
    const start = position; if (text[position++] !== '"') throw new Error();
    while (position < text.length) {
      const character = text[position++];
      if (character === '\\') { position++; continue; }
      if (character === '"') return JSON.parse(text.slice(start, position)) as string;
    }
    throw new Error();
  };
  const value = (depth: number): Node => {
    whitespace(); if (depth > 64 || ++count > 16384) throw new Error();
    const start = position, character = text[position];
    const node: Node = { kind: 'primitive', start, end: start, members: [], items: [] };
    if (character === '{') {
      node.kind = 'object'; position++; whitespace(); const seen = new Set<string>();
      if (text[position] !== '}') for (;;) {
        whitespace(); const keyStart = position, key = string();
        if (seen.has(key)) throw new Error(); seen.add(key); whitespace();
        if (text[position++] !== ':') throw new Error();
        const child = value(depth + 1); node.members.push({ key, start: keyStart, end: child.end, value: child }); whitespace();
        if (text[position] !== ',') break; position++;
      }
      if (text[position++] !== '}') throw new Error();
    } else if (character === '[') {
      node.kind = 'array'; position++; whitespace();
      if (text[position] !== ']') for (;;) {
        node.items.push(value(depth + 1)); whitespace(); if (text[position] !== ',') break; position++;
      }
      if (text[position++] !== ']') throw new Error();
    } else if (character === '"') node.value = string();
    else {
      const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(position))?.[0];
      if (!token) throw new Error(); position += token.length; node.value = JSON.parse(token) as unknown;
    }
    node.end = position; return node;
  };
  const root = value(0); whitespace(); if (position !== text.length || root.kind !== 'object') throw new Error(); return root;
}
export function append(text: string, container: Node, raw: string): string {
  const children = container.kind === 'object' ? container.members : container.items;
  const last = children.at(-1), at = last?.end ?? container.start + 1;
  return text.slice(0, at) + (last ? ',' : '') + raw + text.slice(at);
}
export function remove(text: string, container: Node, index: number): string {
  const children = container.kind === 'object' ? container.members : container.items, target = children[index]!;
  const ranges = [{ start: target.start, end: target.end }];
  if (children.length > 1) {
    const begin = index ? children[index - 1]!.end : target.end;
    const end = index ? target.start : children[index + 1]!.start;
    const comma = text.indexOf(',', begin); if (comma < begin || comma >= end) throw new Error();
    ranges.push({ start: comma, end: comma + 1 });
  }
  for (const range of ranges.sort((a, b) => b.start - a.start)) text = text.slice(0, range.start) + text.slice(range.end);
  return text;
}
export function write(context: Context, source: Source, text: string): boolean {
  if (Buffer.byteLength(text) > MAX_BYTES) return false;
  let fd: number | undefined;
  const matches = () => {
    checkDirectories(context);
    if (source.stat === null) { if (!absent(context.path)) throw new Error(); }
    else { const actual = readFile(context.path); if (!sameFile(source.stat, actual.stat) || source.text !== actual.text) throw new Error(); }
  };
  try {
    matches(); if (!absent(context.pending)) throw new Error();
    fd = fs.openSync(context.pending, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    fs.fchmodSync(fd, source.stat ? source.stat.mode & 0o7777 : 0o600);
    const opened = fs.fstatSync(fd); fs.writeFileSync(fd, text); fs.fsyncSync(fd); const pending = fs.fstatSync(fd);
    if (!sameIdentity(identity(opened), identity(pending)) || !sameFile(pending, settingsStat(context.pending))) throw new Error();
    const closing = fd; fd = undefined; fs.closeSync(closing);
    const written = readFile(context.pending);
    if (!sameFile(pending, written.stat) || written.text !== text) throw new Error();
    matches();
    if (!sameFile(pending, settingsStat(context.pending))) throw new Error();
    fs.renameSync(context.pending, context.path);
    const committed = readFile(context.path);
    if (!sameIdentity(identity(pending), identity(committed.stat)) || committed.text !== text) throw new Error();
    fd = fs.openSync(context.directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    if (!sameIdentity(context.directories.at(-1)![1], identity(fs.fstatSync(fd)))) throw new Error();
    fs.fsyncSync(fd); const directoryFd = fd; fd = undefined; fs.closeSync(directoryFd); checkDirectories(context); return true;
  } catch { return false; }
  finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* Preserve uncertain files. */ } } }
}
