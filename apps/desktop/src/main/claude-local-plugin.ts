import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { samePersistedIdentity, withVolumeIdentity } from './durable-file-identity.js';
import { CLAUDE_USER_HOOK_EVENTS, eventEntry } from './claude-user-hook.js';
import { absent, commandValid, directoryPaths, identity, readSource, safeDirectory, sameFile, sameIdentity, scan, uid, validDirectory, type Identity, type Node } from './protected-json-file.js';

const name = 'agent-pet-observer';
const pluginRoot = (target: string) => join(target, 'skills', name);
const manifest = (target: string) => join(pluginRoot(target), '.claude-plugin/plugin.json');
function contents(command: string) {
  if (!commandValid(command) || command.includes('${')) throw new Error('Invalid plugin command');
  return JSON.stringify({ name, version: '1.0.0', hooks: Object.fromEntries(CLAUDE_USER_HOOK_EVENTS.map(event => [event, [eventEntry(command, event)]])) }, null, 2) + '\n';
}
type PluginOwnership = { kind: 'skills-plugin'; identities: Identity[] };
export type LocalPluginPlan = { path: string; exists: boolean; canApply: boolean; notice: string; stage(): { ownership: PluginOwnership; publish(): void } };

const referencesObserver = (node: Node): boolean => (typeof node.value === 'string' && node.value.includes('claude-normal-')) ||
  node.items.some(referencesObserver) || node.members.some(member => referencesObserver(member.value));
function checkSettings(target: string, directories: [string, Identity][]) {
  const context = { directory: target, directories, path: join(target, 'settings.json'), pending: join(target, 'settings.agent-pet.pending.json') };
  const source = readSource(context), root = scan(source.text ?? '{}');
  for (const { key, value } of root.members) {
    if ((key === 'disableAllHooks' && value.value !== false) || key === 'enabledPlugins' &&
        (value.kind !== 'object' || value.members.some(item => item.key.split('@')[0] === name))) throw new Error('Plugin conflict');
    if (key === 'hooks' && (value.kind !== 'object' || referencesObserver(value))) throw new Error('Existing observer');
  }
  return source;
}

export function prepareLocalPlugin(target: string, command: string): LocalPluginPlan {
  const path = manifest(target), skills = join(target, 'skills'), root = pluginRoot(target);
  try {
    if (!validDirectory(target)) throw new Error();
    const text = contents(command);
    const directories: [string, Identity][] = directoryPaths(target).map(p => [p, identity(safeDirectory(p))]);
    const settings = checkSettings(target, directories);
    const skillsBefore = absent(skills) ? null : identity(safeDirectory(skills));
    if (skillsBefore && skillsBefore.uid !== uid() || !absent(root)) throw new Error();
    return { path, exists: false, canApply: true, notice: '', stage() {
      const current = checkSettings(target, directories);
      if (settings.text !== current.text || (settings.stat && (!current.stat || !sameFile(settings.stat, current.stat)))) throw new Error('Settings changed');
      if (!skillsBefore) fs.mkdirSync(skills, { mode: 0o700 });
      else if (!sameIdentity(skillsBefore, identity(safeDirectory(skills)))) throw new Error('Skills directory changed');
      const pinned: [string, Identity][] = [...directories, [skills, skillsBefore ?? identity(safeDirectory(skills))]];
      const recheck = () => { for (const [p, stat] of pinned) if (!sameIdentity(stat, identity(safeDirectory(p)))) throw new Error('Plugin directory changed'); };
      for (const folder of [root, dirname(path)]) {
        recheck(); fs.mkdirSync(folder, { mode: 0o700 }); // Exclusive; never adopt an existing plugin.
        pinned.push([folder, identity(safeDirectory(folder))]);
      }
      recheck();
      const pending = path + '.pending';
      const fd = fs.openSync(pending, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      let file: Identity;
      try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); file = identity(fs.fstatSync(fd)); } finally { fs.closeSync(fd); }
      recheck();
      const identities = [...pinned.map(([p, stat]) => withVolumeIdentity(p, stat)), withVolumeIdentity(pending, file)];
      const ownership = { kind: 'skills-plugin' as const, identities };
      return { ownership, publish() {
        recheck();
        if (!checkLocalPlugin(target, command, ownership, 'staged')) throw new Error('Staged manifest changed');
        // Publish only after the receiver and its ownership receipt exist. link refuses replacement.
        fs.linkSync(pending, path); fs.unlinkSync(pending);
        if (!checkLocalPlugin(target, command, ownership)) throw new Error('Plugin installation changed');
      } };
    } };
  } catch { return { path, exists: true, canApply: false, notice: '插件位置、权限或已有连接配置冲突。', stage() { throw new Error('Blocked plugin'); } }; }
}

/** Rebuild paths from the selected configuration, never from receipt-provided paths. */
export function checkLocalPlugin(target: string, command: string, receipt: unknown, action: 'inspect' | 'staged' | 'withdraw' = 'inspect'): boolean {
  try {
    if (!validDirectory(target) || !receipt || typeof receipt !== 'object' || !('kind' in receipt) || receipt.kind !== 'skills-plugin' ||
        !('identities' in receipt) || !Array.isArray(receipt.identities)) return false;
    const ids = receipt.identities, path = manifest(target) + (action === 'staged' ? '.pending' : ''), root = pluginRoot(target), dirs = directoryPaths(dirname(path));
    if (ids.length !== dirs.length + 1 || dirs.some((p, i) => !samePersistedIdentity(ids[i], identity(safeDirectory(p)), p))) return false;
    for (const [p, child] of [[root, '.claude-plugin'], [dirname(path), action === 'staged' ? 'plugin.json.pending' : 'plugin.json']] as const) {
      const dir = fs.opendirSync(p);
      try { if (dir.readSync()?.name !== child || dir.readSync() !== null) return false; } finally { dir.closeSync(); }
    }
    const stat = fs.lstatSync(path), expected = Buffer.from(contents(command));
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== uid() || (stat.mode & 0o7777) !== 0o600 || stat.size !== expected.length ||
        !samePersistedIdentity(ids[dirs.length], identity(stat), path)) return false;
    const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const data = Buffer.alloc(expected.length);
      if (!sameFile(stat, fs.fstatSync(fd)) || fs.readSync(fd, data, 0, data.length, 0) !== data.length || !data.equals(expected) ||
          !sameFile(stat, fs.fstatSync(fd)) || !sameFile(stat, fs.lstatSync(path))) return false;
    } finally { fs.closeSync(fd); }
    if (action === 'withdraw') { fs.unlinkSync(path); fs.rmdirSync(dirname(path)); fs.rmdirSync(root); } // The shared skills directory stays.
    return true;
  } catch { return false; }
}
