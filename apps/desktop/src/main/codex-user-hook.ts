import { join } from 'node:path';
import { samePersistedIdentity, withVolumeIdentity } from './durable-file-identity.js';
import { codexHookEvents } from '../../../../integrations/codex-hooks/hook-source.js';
import { exact, validDirectory, directoryPaths, identity, safeDirectory, readSource, scan, append, remove, write,
  type Identity, type Node, type Context } from './protected-json-file.js';
export type CodexHookOwnership = { schemaVersion: 1; directory: string; command: string;
  createdHooks: boolean; createdEvents: string[]; directories: [string, Identity][] };
/** Main-only. Original hooks may contain private commands; never expose ownership/backup through IPC. */
export type CodexHookPlan = Readonly<{ path: string; exists: boolean; canApply: boolean;
  original: string | null; ownership: CodexHookOwnership | null }>;
const plans = new WeakMap<CodexHookPlan, { context: Context; source: ReturnType<typeof readSource>; text: string }>();
const prop = (node: Node, key: string) => node.members.find(member => member.key === key)?.value;
const group = (command: string) => ({ hooks: [{ type: 'command', command, timeout: 2 }] });
function groupMatches(node: Node, command: string): boolean {
  const hooks = prop(node, 'hooks'), hook = hooks?.items[0];
  return node.kind === 'object' && node.members.length === 1 && hooks?.kind === 'array' && hooks.items.length === 1 &&
    hook?.kind === 'object' && hook.members.length === 3 && prop(hook, 'type')?.value === 'command' &&
    prop(hook, 'command')?.value === command && prop(hook, 'timeout')?.value === 2;
}
function shape(root: Node, allowDisabled = false): Node | undefined {
  const disabled = prop(root, 'disableAllHooks');
  if (disabled && typeof disabled.value !== 'boolean') throw new Error('Invalid hook disable flag');
  if (!allowDisabled && disabled?.value === true) throw new Error('Hooks disabled');
  const hooks = prop(root, 'hooks');
  if (hooks && (hooks.kind !== 'object' || hooks.members.some(member => member.value.kind !== 'array' || member.value.items.some(group =>
    group.kind !== 'object' || prop(group, 'hooks')?.kind !== 'array' || prop(group, 'hooks')!.items.some(hook => hook.kind !== 'object'))))) throw new Error('Invalid hooks');
  return hooks;
}
function references(root: Node, command: string): number {
  const marker = /codex-normal-[a-f0-9-]{36}/.exec(command)?.[0];
  const visit = (node: Node): number => (typeof node.value === 'string' &&
    (node.value.includes(command) || (marker && node.value.includes(marker))) ? 1 : 0) +
    node.members.reduce((sum, member) => sum + visit(member.value), 0) + node.items.reduce((sum, item) => sum + visit(item), 0);
  return visit(root);
}
function matches(root: Node, own: CodexHookOwnership, allowDisabled = false): boolean {
  const hooks = shape(root, allowDisabled);
  return references(root, own.command) === codexHookEvents.length && codexHookEvents.every(event =>
    prop(hooks!, event)?.items.filter(node => groupMatches(node, own.command)).length === 1);
}
function context(directory: string, saved?: CodexHookOwnership): Context {
  if (!validDirectory(directory)) throw new Error('Invalid directory');
  const directories = directoryPaths(directory).map(path => [path, identity(safeDirectory(path))] as [string, Identity]);
  if (saved && (saved.directories.length !== directories.length || directories.some(([path, current], index) =>
    saved.directories[index]?.[0] !== path || !samePersistedIdentity(saved.directories[index]![1], current, path)))) throw new Error('Directory changed');
  return { directory, path: join(directory, 'hooks.json'), pending: join(directory, 'hooks.agent-pet.pending.json'), directories };
}
export function validCodexHookOwnership(value: unknown): value is CodexHookOwnership {
  return exact(value, ['schemaVersion', 'directory', 'command', 'createdHooks', 'createdEvents', 'directories']) &&
    value.schemaVersion === 1 && validDirectory(value.directory) && typeof value.command === 'string' &&
    value.command.length > 0 && value.command.length <= 8192 && typeof value.createdHooks === 'boolean' &&
    Array.isArray(value.createdEvents) && value.createdEvents.every(event => codexHookEvents.includes(event)) &&
    new Set(value.createdEvents).size === value.createdEvents.length && Array.isArray(value.directories) &&
    value.directories.length <= 64 && value.directories.every(pair => Array.isArray(pair) && pair.length === 2 &&
      typeof pair[0] === 'string' && pair[1] && typeof pair[1] === 'object' &&
      ['dev','ino','birthtimeMs','uid','gid','mode'].every(key => typeof pair[1][key] === 'number' && Number.isFinite(pair[1][key])));
}
export function prepareCodexUserHook(directory: string, document: string): CodexHookPlan {
  let original: string | null = null, exists = false;
  try {
    const parsed: unknown = JSON.parse(document);
    if (!exact(parsed, ['hooks']) || !parsed.hooks || typeof parsed.hooks !== 'object') throw new Error();
    const expected = scan(document), expectedHooks = shape(expected)!;
    const command = prop(prop(expectedHooks, 'SessionStart')!.items[0]!, 'hooks')!.items[0]!.members.find(m => m.key === 'command')?.value.value;
    if (typeof command !== 'string' || expectedHooks.members.length !== codexHookEvents.length ||
        !codexHookEvents.every(event => prop(expectedHooks, event)?.items.length === 1 && groupMatches(prop(expectedHooks, event)!.items[0]!, command))) throw new Error();
    const ctx = context(directory), source = readSource(ctx); original = source.text; exists = original !== null;
    let text = original ?? '{}'; const root = scan(text), hooks = shape(root);
    if (references(root, command)) throw new Error('Existing reference');
    const createdEvents: string[] = [];
    for (const event of codexHookEvents) {
      const current = scan(text), holder = shape(current), groups = holder && prop(holder, event), raw = JSON.stringify(group(command));
      if (!groups) createdEvents.push(event);
      text = !holder ? append(text, current, `"hooks":{${JSON.stringify(event)}:[${raw}]}`) :
        !groups ? append(text, holder, `${JSON.stringify(event)}:[${raw}]`) : append(text, groups, raw);
    }
    if (Buffer.byteLength(text) > 65536) throw new Error('Too large');
    const ownership: CodexHookOwnership = { schemaVersion: 1, directory, command, createdHooks: !hooks, createdEvents,
      directories: ctx.directories.map(([path, stat]) => [path, withVolumeIdentity(path, stat)]) };
    const plan = Object.freeze(Object.defineProperties({ path: ctx.path, exists, canApply: true }, {
      original: { value: original }, ownership: { value: ownership } })) as CodexHookPlan;
    plans.set(plan, { context: ctx, source, text }); return plan;
  } catch {
    return Object.freeze(Object.defineProperties({ path: join(directory, 'hooks.json'), exists, canApply: false }, {
      original: { value: null }, ownership: { value: null } })) as CodexHookPlan;
  }
}
export function inspectCodexUserHook(own: CodexHookOwnership): boolean {
  try { if (!validCodexHookOwnership(own)) return false; const source = readSource(context(own.directory, own));
    return source.text !== null && matches(scan(source.text), own); } catch { return false; }
}
export function applyCodexUserHook(plan: CodexHookPlan): boolean {
  const prepared = plans.get(plan); plans.delete(plan);
  return !!prepared && !!plan.ownership && write(prepared.context, prepared.source, prepared.text) && inspectCodexUserHook(plan.ownership);
}
export function withdrawCodexUserHook(own: CodexHookOwnership): boolean {
  try {
    if (!validCodexHookOwnership(own)) return false;
    const ctx = context(own.directory, own), source = readSource(ctx);
    if (source.text === null) return true;
    let text = source.text, root = scan(text);
    if (!references(root, own.command)) return true;
    if (!matches(root, own, true)) return false;
    for (const event of [...codexHookEvents].reverse()) {
      const holder = shape(scan(text), true)!, groups = prop(holder, event)!;
      const index = groups.items.findIndex(node => groupMatches(node, own.command));
      text = own.createdEvents.includes(event) && groups.items.length === 1 ?
        remove(text, holder, holder.members.findIndex(member => member.key === event)) : remove(text, groups, index);
    }
    root = scan(text); const holder = shape(root, true)!;
    if (own.createdHooks && holder.members.length === 0) text = remove(text, root, root.members.findIndex(member => member.key === 'hooks'));
    return write(ctx, source, text);
  } catch { return false; }
}
