import { samePersistedIdentity, withVolumeIdentity } from './durable-file-identity.js';
import { join } from 'node:path';
import { absent, exact, commandValid, validDirectory, directoryPaths, identity, safeDirectory, readSource, scan, append, remove, write,
  type Identity, type Node, type Context, type Source } from './protected-json-file.js';

const MAX_BYTES = 64 * 1024, MATCHER = 'startup|resume|clear|compact';
export const CLAUDE_USER_HOOK_EVENTS = Object.freeze(['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'PreCompact', 'PostCompact'] as const);
export type ClaudeUserHookEvent = typeof CLAUDE_USER_HOOK_EVENTS[number];
type HookEntry = { matcher: typeof MATCHER; hooks: [{ type: 'command'; command: string; timeout: 2 }] };
type HookOwnershipBase = {
  directory: string; path: string; command: string; entry: HookEntry;
  createdFields: { hooks: boolean; sessionStart: boolean };
  directories: [string, Identity][];
};
export type HookOwnership = HookOwnershipBase & ({ schemaVersion: 1 } | {
  schemaVersion: 2; events: ClaudeUserHookEvent[];
  /** Event array fields absent before registration; only these may be removed when empty. */
  createdEvents: ClaudeUserHookEvent[];
});
/** Main only: original may contain credentials. Never serialize this plan to IPC or logs. */
export type HookPlan = Readonly<{
  path: string; exists: boolean; canApply: boolean; notice: string;
  original: string | null; ownership: HookOwnership | null;
}>;
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
const member = (node: Node, key: string) => node.members.find(item => item.key === key);
const property = (node: Node, key: string) => member(node, key)?.value;
function entry(command: string): HookEntry { return { matcher: MATCHER, hooks: [{ type: 'command', command, timeout: 2 }] }; }
function eventEntry(command: string, event: ClaudeUserHookEvent): { matcher?: string; hooks: HookEntry['hooks'] } {
  const matcher = event === 'SessionStart' ? MATCHER : event === 'Notification' ? 'permission_prompt' :
    ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'].includes(event) ? '.*' : undefined;
  return { ...(matcher === undefined ? {} : { matcher }), hooks: [{ type: 'command', command, timeout: 2 }] };
}
function exactEntry(node: Node, command: string, event: ClaudeUserHookEvent = 'SessionStart'): boolean {
  const hooks = property(node, 'hooks'), child = hooks?.items[0];
  const matcher = eventEntry(command, event).matcher;
  return node.kind === 'object' && node.members.length === (matcher === undefined ? 1 : 2) &&
    (matcher === undefined ? !member(node, 'matcher') : property(node, 'matcher')?.value === matcher) &&
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
const ownedEvents = (ownership: HookOwnership): readonly ClaudeUserHookEvent[] =>
  ownership.schemaVersion === 1 ? ['SessionStart'] : ownership.events;
function matchesOwned(hooks: Node | undefined, ownership: HookOwnership): boolean {
  const events = ownedEvents(ownership);
  return hooks !== undefined && referenceCount(hooks, ownership.command) === events.length && events.every(event =>
    property(hooks, event)?.items.filter(item => exactEntry(item, ownership.command, event)).length === 1);
}
function completeEvents(events: unknown): events is readonly ClaudeUserHookEvent[] {
  return Array.isArray(events) && events.length === CLAUDE_USER_HOOK_EVENTS.length &&
    CLAUDE_USER_HOOK_EVENTS.every(event => events.filter(item => item === event).length === 1);
}
function appendEvents(text: string, events: readonly ClaudeUserHookEvent[], command: string): { text: string; createdEvents: ClaudeUserHookEvent[] } {
  const createdEvents: ClaudeUserHookEvent[] = [];
  for (const event of events) {
    const root = scan(text), hooks = structure(root).hooks, groups = hooks && property(hooks, event);
    const raw = JSON.stringify(eventEntry(command, event));
    if (!groups) createdEvents.push(event);
    text = !hooks ? append(text, root, `"hooks":{${JSON.stringify(event)}:[${raw}]}`) :
      !groups ? append(text, hooks, `${JSON.stringify(event)}:[${raw}]`) : append(text, groups, raw);
  }
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error();
  return { text, createdEvents };
}

export function isClaudeUserHookOwnership(value: unknown): value is HookOwnership {
  try {
    if (!value || typeof value !== 'object') return false;
    const version = 'schemaVersion' in value ? value.schemaVersion : undefined;
    const names = ['schemaVersion', 'directory', 'path', 'command', 'entry', 'createdFields', 'directories'];
    if ((version !== 1 && version !== 2) || !exact(value, version === 1 ? names : [...names, 'events', 'createdEvents']) ||
        !validDirectory(value.directory) || value.path !== join(value.directory, 'settings.json') || !commandValid(value.command) ||
        !exact(value.createdFields, ['hooks', 'sessionStart']) || typeof value.createdFields.hooks !== 'boolean' ||
        typeof value.createdFields.sessionStart !== 'boolean' || (value.createdFields.hooks && !value.createdFields.sessionStart) ||
        !Array.isArray(value.directories)) return false;
    if (version === 2) {
      const events = value.events, created = value.createdEvents;
      if (!completeEvents(events) || !events.every((event, index) => event === CLAUDE_USER_HOOK_EVENTS[index]) ||
          !Array.isArray(created) || created.some(event => !events.includes(event)) ||
          created.length !== new Set(created).size ||
          created.some((event, index) => index > 0 && CLAUDE_USER_HOOK_EVENTS.indexOf(event) <= CLAUDE_USER_HOOK_EVENTS.indexOf(created[index - 1])) ||
          created.includes('SessionStart') !== value.createdFields.sessionStart) return false;
    }
    const paths = directoryPaths(value.directory);
    if (paths.length !== value.directories.length || value.directories.some((item: unknown, index: number) => !Array.isArray(item) ||
        item.length !== 2 || item[0] !== paths[index] || !item[1] || typeof item[1] !== 'object' ||
        !exact(item[1], ['dev', 'ino', 'birthtimeMs', 'uid', 'gid', 'mode', ...('volumeId' in item[1] ? ['volumeId'] : [])]) ||
        ('volumeId' in item[1] && (typeof item[1].volumeId !== 'string' || !/^[a-f0-9-]{36}$/i.test(item[1].volumeId))) ||
        !Object.entries(item[1]).filter(([key]) => key !== 'volumeId').every(([, number]) => typeof number === 'number' && Number.isFinite(number) && number >= 0))) return false;
    const own = value.entry;
    return exact(own, ['matcher', 'hooks']) && own.matcher === MATCHER && Array.isArray(own.hooks) && own.hooks.length === 1 &&
      exact(own.hooks[0], ['type', 'command', 'timeout']) && own.hooks[0].type === 'command' &&
      own.hooks[0].command === value.command && own.hooks[0].timeout === 2;
  } catch { return false; }
}
function contextFromOwnership(ownership: HookOwnership): Context {
  if (!isClaudeUserHookOwnership(ownership)) throw new Error();
  return { directory: ownership.directory, path: ownership.path, pending: join(ownership.directory, 'settings.agent-pet.pending.json'),
    directories: ownership.directories.map(([path, saved]) => {
      const current = identity(safeDirectory(path));
      if (!samePersistedIdentity(saved, current, path)) throw new Error();
      return [path, current];
    }) };
}

/** Read-only preparation against a precisely authorized directory. The caller supplies a
 * fixed command containing only application paths, never a capability or Agent prompt.
 * Omitted events retains schema1 SessionStart-only behavior. Task observation requires
 * the explicit complete whitelist; partial or duplicate event sets fail closed.
 */
export function prepareClaudeUserHook(options: { directory: string; command: string; events?: readonly ClaudeUserHookEvent[] }): HookPlan {
  let path = '', exists = false;
  try {
    if (!validDirectory(options.directory) || !commandValid(options.command) ||
        (options.events !== undefined && !completeEvents(options.events))) throw new Error();
    path = join(options.directory, 'settings.json');
    const context: Context = { directory: options.directory, path, pending: join(options.directory, 'settings.agent-pet.pending.json'),
      directories: directoryPaths(options.directory).map(directory => [directory, identity(safeDirectory(directory))]) };
    exists = !absent(path); const source = readSource(context), text = source.text ?? '{}', root = scan(text), shape = structure(root);
    if (shape.disabled || referenceCount(shape.hooks, options.command) !== 0) throw new Error();
    const patched = appendEvents(text, options.events === undefined ? ['SessionStart'] : CLAUDE_USER_HOOK_EVENTS, options.command);
    const base: HookOwnershipBase = { directory: options.directory, path, command: options.command, entry: entry(options.command),
      createdFields: { hooks: !shape.hooks, sessionStart: !shape.session }, directories: context.directories.map(([path, stat]) => [path, withVolumeIdentity(path, stat)]) };
    const ownership: HookOwnership = options.events === undefined ? { ...base, schemaVersion: 1 } :
      { ...base, schemaVersion: 2, events: [...CLAUDE_USER_HOOK_EVENTS], createdEvents: patched.createdEvents };
    const plan = makePlan({ path, exists, canApply: true, notice: options.events === undefined ?
      '仅追加一个 SessionStart hook，保留原设置与 hooks。' : '仅追加所列观察 hooks，保留原设置与 hooks。' },
      source.text, structuredClone(ownership));
    plans.set(plan, { context, source, text: patched.text, ownership }); return plan;
  } catch {
    return makePlan({ path, exists, canApply: false, notice: '设置不可安全追加；已保留原文件，请检查禁用、格式、权限或未完成写入。' }, null, null);
  }
}
/** Explicit preview only: a legacy registration must still be exact and enabled.
 * The original SessionStart group and every unrelated JSON token remain untouched.
 */
export function prepareClaudeUserHookUpgrade(ownership: HookOwnership): HookPlan {
  let path = '', exists = false;
  try {
    const context = contextFromOwnership(ownership); path = context.path;
    if (ownership.schemaVersion !== 1) throw new Error();
    const source = readSource(context); exists = source.text !== null;
    if (source.text === null) throw new Error();
    const shape = structure(scan(source.text));
    if (shape.disabled || !matchesOwned(shape.hooks, ownership)) throw new Error();
    const patched = appendEvents(source.text, CLAUDE_USER_HOOK_EVENTS.slice(1), ownership.command);
    const upgraded: HookOwnership = { ...structuredClone(ownership), schemaVersion: 2, events: [...CLAUDE_USER_HOOK_EVENTS],
      createdEvents: [...(ownership.createdFields.sessionStart ? ['SessionStart' as const] : []), ...patched.createdEvents] };
    const plan = makePlan({ path, exists, canApply: true, notice: '保留原 SessionStart，仅追加任务观察 hooks；确认后才生效。' },
      source.text, structuredClone(upgraded));
    plans.set(plan, { context, source, text: patched.text, ownership: upgraded }); return plan;
  } catch {
    return makePlan({ path, exists, canApply: false, notice: '原观察 hook 不可安全升级；已保留设置，请检查修改、禁用或未完成写入。' }, null, null);
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
    return !shape.disabled && matchesOwned(shape.hooks, ownership);
  } catch { return false; }
}
/** Remove only the unambiguous, unchanged owned registration. User edits elsewhere and a global
 * disabled flag are retained. Empty newly-created fields are removed; files are retained.
 */
export function withdrawClaudeUserHook(ownership: HookOwnership): boolean {
  try {
    const context = contextFromOwnership(ownership), source = readSource(context);
    if (source.text === null) return true;
    const shape = structure(scan(source.text));
    if (referenceCount(shape.hooks, ownership.command) === 0) return true;
    if (!matchesOwned(shape.hooks, ownership)) return false;
    let patched = source.text;
    const created = ownership.schemaVersion === 1 ? (ownership.createdFields.sessionStart ? ['SessionStart'] : []) : ownership.createdEvents;
    // Validate the whole registration before any edit; a missing/modified group
    // must retain all remaining references and their private runtime ownership.
    for (const event of [...ownedEvents(ownership)].reverse()) {
      const hooks = structure(scan(patched)).hooks!, groups = property(hooks, event)!;
      const index = groups.items.findIndex(item => exactEntry(item, ownership.command, event));
      patched = created.includes(event) && groups.items.length === 1 ?
        remove(patched, hooks, hooks.members.indexOf(member(hooks, event)!)) : remove(patched, groups, index);
    }
    const root = scan(patched), hooks = structure(root).hooks!;
    if (ownership.createdFields.hooks && hooks.members.length === 0) patched = remove(patched, root, root.members.indexOf(member(root, 'hooks')!));
    return write(context, source, patched);
  } catch { return false; }
}
