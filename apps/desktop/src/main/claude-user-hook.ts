import * as fs from 'node:fs';
import { basename, isAbsolute, join, normalize } from 'node:path';
import { TextDecoder } from 'node:util';

const MAX_BYTES = 64 * 1024, MATCHER = 'startup|resume|clear|compact';
type Identity = { dev: number; ino: number; birthtimeMs: number; uid: number; gid: number; mode: number };
type HookEntry = { matcher: typeof MATCHER; hooks: [{ type: 'command'; command: string; timeout: 2 }] };
export type HookOwnership = {
  schemaVersion: 1; directory: string; path: string; command: string; entry: HookEntry;
  createdFields: { hooks: boolean; sessionStart: boolean };
  directories: [string, Identity][];
};
/** Main only: original may contain credentials. Never serialize this plan to IPC or logs. */
export type HookPlan = Readonly<{
  path: string; exists: boolean; canApply: boolean; notice: string;
  original: string | null; ownership: HookOwnership | null;
}>;
type Member = { key: string; start: number; end: number; value: Node };
type Node = { kind: 'object' | 'array' | 'primitive'; start: number; end: number;
  members: Member[]; items: Node[]; value?: unknown };
type Context = { directory: string; path: string; pending: string; directories: [string, Identity][] };
type Source = { text: string | null; stat: fs.Stats | null };
type Prepared = { context: Context; source: Source; text: string; ownership: HookOwnership };
const plans = new WeakMap<HookPlan, Prepared>();
function makePlan(summary: Pick<HookPlan, 'path' | 'exists' | 'canApply' | 'notice'>,
  original: string | null, ownership: HookOwnership | null): HookPlan {
  // Serializing a preview by accident must not copy full user settings or private
  // ownership metadata. Main can access these explicitly for its private receipt.
  return Object.freeze(Object.defineProperties({ ...summary }, {
    original: { value: original, enumerable: false }, ownership: { value: ownership, enumerable: false },
  })) as HookPlan;
}
const uid = () => { if (!process.getuid) throw new Error(); return process.getuid(); };
const exact = (value: unknown, names: readonly string[]): value is Record<string, unknown> => !!value && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).length === names.length && Object.keys(value).every(key => names.includes(key));
const identity = (stat: fs.Stats): Identity => ({ dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs,
  uid: stat.uid, gid: stat.gid, mode: stat.mode });
const sameIdentity = (a: Identity, b: Identity) => Object.keys(a).every(key => a[key as keyof Identity] === b[key as keyof Identity]);
const sameFile = (a: fs.Stats, b: fs.Stats) => sameIdentity(identity(a), identity(b)) && a.size === b.size &&
  a.nlink === b.nlink && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const commandValid = (value: unknown): value is string => typeof value === 'string' && value.trim() === value && value.length > 0 &&
  Buffer.byteLength(value) <= 8192 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
function validDirectory(value: unknown): value is string {
  return typeof value === 'string' && isAbsolute(value) && normalize(value) === value && value !== '/' &&
    Buffer.byteLength(value) <= 4096 && value.split('/').length <= 64 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function directoryPaths(directory: string): string[] {
  const paths = ['/']; let path = '/';
  for (const part of directory.split('/').filter(Boolean)) { path = join(path, part); paths.push(path); }
  return paths;
}
function safeDirectory(path: string): fs.Stats {
  const stat = fs.lstatSync(path), stickyTmp = stat.uid === 0 && (stat.mode & 0o1000) !== 0 && basename(path) === 'tmp';
  if (!stat.isDirectory() || (stat.uid !== uid() && stat.uid !== 0) || ((stat.mode & 0o022) !== 0 && !stickyTmp)) throw new Error();
  return stat;
}
function checkDirectories(context: Context): void {
  for (const [path, saved] of context.directories) if (!sameIdentity(saved, identity(safeDirectory(path)))) throw new Error();
  if (safeDirectory(context.directory).uid !== uid()) throw new Error();
}
function absent(path: string): boolean {
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
function readSource(context: Context): Source {
  checkDirectories(context); if (!absent(context.pending)) throw new Error();
  const source = absent(context.path) ? { text: null, stat: null } : readFile(context.path);
  checkDirectories(context); return source;
}

/** Locate JSON tokens without ever reserializing user values. Duplicate decoded keys,
 * invalid JSON/UTF-8, excessive nesting and excessive token counts fail closed.
 */
function scan(text: string): Node {
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
const member = (node: Node, key: string) => node.members.find(item => item.key === key);
const property = (node: Node, key: string) => member(node, key)?.value;
function entry(command: string): HookEntry { return { matcher: MATCHER, hooks: [{ type: 'command', command, timeout: 2 }] }; }
function exactEntry(node: Node, command: string): boolean {
  const hooks = property(node, 'hooks'), child = hooks?.items[0];
  return node.kind === 'object' && node.members.length === 2 && property(node, 'matcher')?.value === MATCHER &&
    hooks?.kind === 'array' && hooks.items.length === 1 && child?.kind === 'object' && child.members.length === 3 &&
    property(child, 'type')?.value === 'command' && property(child, 'command')?.value === command && property(child, 'timeout')?.value === 2;
}
function structure(root: Node): { hooks?: Node; session?: Node; disabled: boolean } {
  const disable = property(root, 'disableAllHooks');
  if (disable && typeof disable.value !== 'boolean') throw new Error();
  const hooks = property(root, 'hooks'); if (!hooks) return { disabled: disable?.value === true };
  if (hooks.kind !== 'object') throw new Error();
  for (const event of hooks.members) {
    if (event.value.kind !== 'array') throw new Error();
    for (const group of event.value.items) {
      const commands = property(group, 'hooks');
      if (group.kind !== 'object' || commands?.kind !== 'array' || commands.items.some(hook => hook.kind !== 'object')) throw new Error();
    }
  }
  const session = property(hooks, 'SessionStart');
  return { hooks, ...(session ? { session } : {}), disabled: disable?.value === true };
}
function referenceCount(hooks: Node | undefined, command: string): number {
  // This is deliberately a conservative reference guard, not a shell parser.
  // Main's unique private directory survives added flags and changed quoting.
  // The fixed script path also protects generic callers without that marker.
  const markers = command.match(/claude-normal-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/g) ?? [];
  const paths: string[] = [];
  for (const match of command.matchAll(/'([^']*)'|"([^"]*)"|([^\s'"]+)/g)) {
    const argument = match[1] ?? match[2] ?? match[3]!;
    if (argument.startsWith('/') && /\/(?:observer|user-hook)\.cjs$/.test(argument)) paths.push(argument);
  }
  const references = (node: Node): boolean => {
    const candidate = node.value;
    if (typeof candidate === 'string' && (candidate.includes(command) || markers.some(marker => candidate.includes(marker)) ||
        paths.some(path => candidate.includes(path)))) return true;
    return node.members.some(member => references(member.value)) || node.items.some(references);
  };
  let count = 0;
  for (const event of hooks?.members ?? []) for (const group of event.value.items) {
    for (const hook of property(group, 'hooks')!.items) if (references(hook)) count++;
  }
  return count;
}
function append(text: string, container: Node, raw: string): string {
  const children = container.kind === 'object' ? container.members : container.items;
  const last = children.at(-1), at = last?.end ?? container.start + 1;
  return text.slice(0, at) + (last ? ',' : '') + raw + text.slice(at);
}
function remove(text: string, container: Node, index: number): string {
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
function write(context: Context, source: Source, text: string): boolean {
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

export function isClaudeUserHookOwnership(value: unknown): value is HookOwnership {
  try {
    if (!exact(value, ['schemaVersion', 'directory', 'path', 'command', 'entry', 'createdFields', 'directories']) || value.schemaVersion !== 1 ||
        !validDirectory(value.directory) || value.path !== join(value.directory, 'settings.json') || !commandValid(value.command) ||
        !exact(value.createdFields, ['hooks', 'sessionStart']) || typeof value.createdFields.hooks !== 'boolean' ||
        typeof value.createdFields.sessionStart !== 'boolean' || (value.createdFields.hooks && !value.createdFields.sessionStart) ||
        !Array.isArray(value.directories)) return false;
    const paths = directoryPaths(value.directory);
    if (paths.length !== value.directories.length || value.directories.some((item: unknown, index: number) => !Array.isArray(item) ||
        item.length !== 2 || item[0] !== paths[index] || !exact(item[1], ['dev', 'ino', 'birthtimeMs', 'uid', 'gid', 'mode']) ||
        !Object.values(item[1]).every(number => typeof number === 'number' && Number.isFinite(number) && number >= 0))) return false;
    const own = value.entry;
    return exact(own, ['matcher', 'hooks']) && own.matcher === MATCHER && Array.isArray(own.hooks) && own.hooks.length === 1 &&
      exact(own.hooks[0], ['type', 'command', 'timeout']) && own.hooks[0].type === 'command' &&
      own.hooks[0].command === value.command && own.hooks[0].timeout === 2;
  } catch { return false; }
}
function contextFromOwnership(ownership: HookOwnership): Context {
  if (!isClaudeUserHookOwnership(ownership)) throw new Error();
  return { directory: ownership.directory, path: ownership.path, pending: join(ownership.directory, 'settings.agent-pet.pending.json'),
    directories: structuredClone(ownership.directories) };
}

/** Read-only preparation against a precisely authorized directory. The caller supplies a
 * fixed command containing only application paths, never a capability or Agent prompt.
 */
export function prepareClaudeUserHook(options: { directory: string; command: string }): HookPlan {
  let path = '', exists = false;
  try {
    if (!validDirectory(options.directory) || !commandValid(options.command)) throw new Error();
    path = join(options.directory, 'settings.json');
    const context: Context = { directory: options.directory, path, pending: join(options.directory, 'settings.agent-pet.pending.json'),
      directories: directoryPaths(options.directory).map(directory => [directory, identity(safeDirectory(directory))]) };
    exists = !absent(path); const source = readSource(context), text = source.text ?? '{}', root = scan(text), shape = structure(root);
    if (shape.disabled || referenceCount(shape.hooks, options.command) !== 0) throw new Error();
    const own = entry(options.command), raw = JSON.stringify(own);
    const patched = !shape.hooks ? append(text, root, `"hooks":{"SessionStart":[${raw}]}`) :
      !shape.session ? append(text, shape.hooks, `"SessionStart":[${raw}]`) : append(text, shape.session, raw);
    if (Buffer.byteLength(patched) > MAX_BYTES) throw new Error();
    const ownership: HookOwnership = { schemaVersion: 1, directory: options.directory, path, command: options.command, entry: own,
      createdFields: { hooks: !shape.hooks, sessionStart: !shape.session }, directories: structuredClone(context.directories) };
    const plan = makePlan({ path, exists, canApply: true, notice: '仅追加一个 SessionStart hook，保留原设置与 hooks。' },
      source.text, structuredClone(ownership));
    plans.set(plan, { context, source, text: patched, ownership }); return plan;
  } catch {
    return makePlan({ path, exists, canApply: false, notice: '设置不可安全追加；已保留原文件，请检查禁用、格式、权限或未完成写入。' }, null, null);
  }
}
export function applyClaudeUserHook(plan: HookPlan): HookOwnership | null {
  const prepared = plans.get(plan); plans.delete(plan);
  if (!prepared || !write(prepared.context, prepared.source, prepared.text) || !inspectClaudeUserHook(prepared.ownership)) return null;
  return structuredClone(prepared.ownership);
}
export function inspectClaudeUserHook(ownership: HookOwnership): boolean {
  try {
    const source = readSource(contextFromOwnership(ownership)); if (source.text === null) return false;
    const shape = structure(scan(source.text));
    return !shape.disabled && referenceCount(shape.hooks, ownership.command) === 1 &&
      shape.session?.items.filter(item => exactEntry(item, ownership.command)).length === 1;
  } catch { return false; }
}
/** Remove only the unambiguous, unchanged owned entry. User edits elsewhere and a global
 * disabled flag are retained. Empty newly-created fields are removed; files are retained.
 */
export function withdrawClaudeUserHook(ownership: HookOwnership): boolean {
  try {
    const context = contextFromOwnership(ownership), source = readSource(context);
    if (source.text === null) return true;
    const text = source.text, root = scan(text), shape = structure(root), count = referenceCount(shape.hooks, ownership.command);
    const matches = shape.session?.items.map((item, index) => exactEntry(item, ownership.command) ? index : -1).filter(index => index >= 0) ?? [];
    if (matches.length === 0 && count === 0) return true;
    if (matches.length !== 1 || count !== 1 || !shape.hooks || !shape.session) return false;
    const patched = ownership.createdFields.hooks && shape.hooks.members.length === 1 && shape.session.items.length === 1 ?
      remove(text, root, root.members.indexOf(member(root, 'hooks')!)) :
      ownership.createdFields.sessionStart && shape.session.items.length === 1 ?
        remove(text, shape.hooks, shape.hooks.members.indexOf(member(shape.hooks, 'SessionStart')!)) : remove(text, shape.session, matches[0]!);
    return write(context, source, patched);
  } catch { return false; }
}
