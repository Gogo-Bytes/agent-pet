import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClaudePresenceStore } from './claude-presence-store.js';

vi.mock('node:fs', async original => ({ ...await original<typeof import('node:fs')>() }));
let root: string, directory: string, configurationId: string;
const extraRoots: string[] = [];
const material = () => ({ executable: '/fixture/bin/claude', files: {
  'plugin/.claude-plugin/plugin.json': '{"name":"fixture"}\n',
  'plugin/hooks/hooks.json': '{"hooks":{}}\n',
  'plugin/runtime/hook.cjs': 'module.exports = {};\n',
  'launcher.cjs': 'module.exports = {};\n',
  'activation.json': '{"token":"private-fixture-token","url":"http://127.0.0.1:1/claude-presence"}\n',
} });
const file = (relative: string) => join(directory, relative);
function initialized() {
  const store = new ClaudePresenceStore(directory, configurationId);
  expect(store.initialize(material())).toBe(true); return store;
}
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pet-claude-material-')));
  configurationId = randomUUID(); directory = join(root, `claude-${configurationId}`);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const path of [root, ...extraRoots.splice(0)]) fs.rmSync(path, { recursive: true, force: true });
});

it('loads an absent store without creating files, then restores only non-secret metadata', () => {
  const store = new ClaudePresenceStore(directory, configurationId);
  expect(store.error).toBe(false); expect(store.read()).toBeNull(); expect(store.verify()).toBe(false);
  expect(fs.readdirSync(root)).toEqual([]);
  expect(store.initialize(material())).toBe(true);
  expect(store.read()).toEqual({ executable: '/fixture/bin/claude', disabled: false });
  const second = new ClaudePresenceStore(directory, configurationId);
  expect(second.error).toBe(false); expect(second.read()).toEqual(store.read()); expect(second.verify()).toBe(true);
  const receipt = fs.readFileSync(file('receipt.json'), 'utf8');
  expect(receipt).not.toContain('private-fixture-token'); expect(JSON.stringify(second.read())).not.toContain('token');
  for (const path of ['', 'plugin', 'plugin/hooks', 'plugin/runtime', 'plugin/.claude-plugin']) {
    expect(fs.lstatSync(file(path)).mode & 0o7777).toBe(0o700);
  }
  for (const path of [...Object.keys(material().files), 'receipt.json']) expect(fs.lstatSync(file(path)).mode & 0o7777).toBe(0o600);
});
it('replaces activation atomically before its receipt and persists disable without editing materials', () => {
  const store = initialized(), activation = file('activation.json'), oldFd = fs.openSync(activation, 'r');
  try {
    expect(store.replaceActivation('{"token":"rotated-private-fixture"}\n', false)).toBe(true);
    expect(fs.fstatSync(oldFd).ino).not.toBe(fs.lstatSync(activation).ino);
    expect(fs.readFileSync(oldFd, 'utf8')).toContain('private-fixture-token');
  } finally { fs.closeSync(oldFd); }
  expect(store.verify()).toBe(true);
  const bytes = fs.readFileSync(activation);
  expect(store.setDisabled(true)).toBe(true); expect(fs.readFileSync(activation)).toEqual(bytes);
  expect(new ClaudePresenceStore(directory, configurationId).read()).toEqual({ executable: '/fixture/bin/claude', disabled: true });
  expect(store.setDisabled(false)).toBe(true); expect(store.read()?.disabled).toBe(false);
});
it.each(['edited', 'unknown', 'pending', 'symlink-file', 'symlink-directory', 'file-mode', 'directory-mode', 'hardlink', 'missing-file', 'oversized'])('fails closed and preserves %s materials on startup and writes', kind => {
  const store = initialized(), activation = file('activation.json');
  if (kind === 'edited') fs.writeFileSync(file('launcher.cjs'), 'user edit');
  if (kind === 'unknown') fs.writeFileSync(file('plugin/unknown'), 'unknown data');
  if (kind === 'pending') fs.writeFileSync(file('activation.json.pending'), 'uncertain private fixture', { mode: 0o600 });
  if (kind === 'symlink-file') { fs.renameSync(activation, join(root, 'retained')); fs.symlinkSync(join(root, 'retained'), activation); }
  if (kind === 'symlink-directory') { fs.renameSync(file('plugin/hooks'), join(root, 'retained')); fs.symlinkSync(join(root, 'retained'), file('plugin/hooks')); }
  if (kind === 'file-mode') fs.chmodSync(activation, 0o644);
  if (kind === 'directory-mode') fs.chmodSync(file('plugin/hooks'), 0o755);
  if (kind === 'hardlink') fs.linkSync(activation, join(root, 'retained'));
  if (kind === 'missing-file') fs.unlinkSync(file('launcher.cjs'));
  if (kind === 'oversized') fs.writeFileSync(activation, ' '.repeat(512 * 1024 + 1));
  const receipt = fs.readFileSync(file('receipt.json'));
  const restored = new ClaudePresenceStore(directory, configurationId);
  expect(restored.error).toBe(true); expect(restored.read()).toBeNull(); expect(restored.setDisabled(true)).toBe(false);
  expect(store.replaceActivation('{}', true)).toBe(false); expect(store.error).toBe(true);
  expect(fs.readFileSync(file('receipt.json'))).toEqual(receipt);
  if (kind === 'edited') expect(fs.readFileSync(file('launcher.cjs'), 'utf8')).toBe('user edit');
  if (kind === 'unknown') expect(fs.readFileSync(file('plugin/unknown'), 'utf8')).toBe('unknown data');
  if (kind === 'pending') expect(fs.readFileSync(file('activation.json.pending'), 'utf8')).toBe('uncertain private fixture');
});
it.each(['version', 'extra-key', 'configuration-id', 'file-digest', 'extra-digest', 'missing-digest', 'executable', 'disabled', 'corrupt'])('rejects malformed receipt %s', kind => {
  initialized(); const path = file('receipt.json'), value = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (kind === 'version') value.schemaVersion = 2;
  if (kind === 'extra-key') value.token = 'not allowed';
  if (kind === 'configuration-id') value.configurationId = randomUUID();
  if (kind === 'file-digest') value.files['launcher.cjs'] = 'a'.repeat(64);
  if (kind === 'extra-digest') value.files.extra = 'a'.repeat(64);
  if (kind === 'missing-digest') delete value.files['launcher.cjs'];
  if (kind === 'executable') value.executable = '/fixture\n/bin/claude';
  if (kind === 'disabled') value.disabled = 'true';
  fs.writeFileSync(path, kind === 'corrupt' ? '{' : JSON.stringify(value));
  const store = new ClaudePresenceStore(directory, configurationId);
  expect(store.error).toBe(true); expect(store.read()).toBeNull(); expect(store.initialize(material())).toBe(false);
});
it('does not adopt an existing empty or unreceipted directory', () => {
  fs.mkdirSync(directory, { mode: 0o700 }); fs.writeFileSync(file('unknown'), 'preserve');
  const store = new ClaudePresenceStore(directory, configurationId);
  expect(store.error).toBe(true); expect(store.initialize(material())).toBe(false);
  expect(fs.readFileSync(file('unknown'), 'utf8')).toBe('preserve');
});
it('refuses substituted files with identical bytes and an identity-changed parent', () => {
  const store = initialized(), path = file('launcher.cjs'), bytes = fs.readFileSync(path);
  fs.renameSync(path, join(root, 'old-launcher')); fs.writeFileSync(path, bytes, { mode: 0o600 });
  expect(store.setDisabled(true)).toBe(false); expect(fs.readFileSync(path)).toEqual(bytes);
  const second = new ClaudePresenceStore(directory, configurationId); expect(second.error).toBe(false);
  const retained = `${root}-retained`; fs.renameSync(root, retained); extraRoots.push(retained); fs.mkdirSync(root, { mode: 0o700 });
  expect(second.setDisabled(true)).toBe(false); expect(fs.readdirSync(root)).toEqual([]);
  expect(fs.existsSync(join(retained, `claude-${configurationId}`, 'receipt.json'))).toBe(true);
});
it('rejects ancestor symlinks and unsafe ancestor write permissions', () => {
  const alias = join(root, 'alias'); fs.symlinkSync(root, alias);
  expect(new ClaudePresenceStore(join(alias, `claude-${configurationId}`), configurationId).error).toBe(true);
  fs.chmodSync(root, 0o777);
  expect(new ClaudePresenceStore(directory, configurationId).error).toBe(true);
});
it('refuses root substitution after startup before initialization without writing there', () => {
  const store = new ClaudePresenceStore(directory, configurationId), retained = `${root}-retained`;
  fs.renameSync(root, retained); extraRoots.push(retained); fs.mkdirSync(root, { mode: 0o700 });
  expect(store.initialize(material())).toBe(false); expect(fs.readdirSync(root)).toEqual([]);
});
it.each(['extra-path', 'missing-path', 'relative-executable', 'control-executable', 'oversized-file', 'total-size'])('rejects invalid initialization %s before creating materials', kind => {
  const input: { executable: string; files: Record<string, string> } = material();
  if (kind === 'extra-path') input.files['../escape'] = 'no';
  if (kind === 'missing-path') delete input.files['launcher.cjs'];
  if (kind === 'relative-executable') input.executable = 'claude';
  if (kind === 'control-executable') input.executable = '/fixture\n/claude';
  if (kind === 'oversized-file') input.files['launcher.cjs'] = 'a'.repeat(512 * 1024 + 1);
  if (kind === 'total-size') for (const path of Object.keys(input.files)) input.files[path] = 'a'.repeat(512 * 1024);
  const store = new ClaudePresenceStore(directory, configurationId);
  expect(store.initialize(input)).toBe(false); expect(store.error).toBe(true); expect(fs.readdirSync(root)).toEqual([]);
});
it('retains incomplete initialization when a file write fails and refuses its next startup', () => {
  const store = new ClaudePresenceStore(directory, configurationId), original = fs.writeFileSync;
  let calls = 0;
  vi.spyOn(fs, 'writeFileSync').mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
    if (++calls === 2) throw new Error('private fixture detail'); return original(...args);
  });
  expect(store.initialize(material())).toBe(false); expect(store.error).toBe(true);
  expect(fs.existsSync(file('plugin/.claude-plugin/plugin.json'))).toBe(true);
  expect(fs.existsSync(file('plugin/hooks/hooks.json'))).toBe(true);
  expect(fs.existsSync(file('receipt.json'))).toBe(false);
  expect(new ClaudePresenceStore(directory, configurationId).error).toBe(true);
});
it.each(['write', 'fsync', 'close', 'rename'])('preserves pending and committed data after uncertain %s failure', operation => {
  const store = initialized(), receipt = fs.readFileSync(file('receipt.json')), activation = fs.readFileSync(file('activation.json'));
  if (operation === 'write') vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => { throw new Error('private fixture detail'); });
  if (operation === 'fsync') vi.spyOn(fs, 'fsyncSync').mockImplementationOnce(() => { throw new Error('private fixture detail'); });
  if (operation === 'close') {
    const original = fs.closeSync;
    // Reads also close descriptors; fail the new pending write's close only.
    vi.spyOn(fs, 'closeSync').mockImplementation(fd => {
      if (fs.fstatSync(fd).size === Buffer.byteLength('{"token":"replacement"}')) { original(fd); throw new Error('private fixture detail'); }
      original(fd);
    });
  }
  if (operation === 'rename') vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('private fixture detail'); });
  expect(store.replaceActivation('{"token":"replacement"}', false)).toBe(false); expect(store.error).toBe(true); expect(store.read()).toBeNull();
  expect(fs.readFileSync(file('receipt.json'))).toEqual(receipt); expect(fs.readFileSync(file('activation.json'))).toEqual(activation);
  expect(fs.existsSync(file('activation.json.pending'))).toBe(true);
  expect(new ClaudePresenceStore(directory, configurationId).error).toBe(true);
});
it('retains the new activation and old receipt when receipt publication fails', () => {
  const store = initialized(), oldReceipt = fs.readFileSync(file('receipt.json')), original = fs.renameSync;
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (to === file('receipt.json')) throw new Error('private fixture detail'); original(from, to);
  });
  expect(store.replaceActivation('{"token":"replacement"}', false)).toBe(false);
  expect(fs.readFileSync(file('activation.json'), 'utf8')).toBe('{"token":"replacement"}');
  expect(fs.readFileSync(file('receipt.json'))).toEqual(oldReceipt);
  expect(fs.existsSync(file('receipt.json.pending'))).toBe(true);
  expect(new ClaudePresenceStore(directory, configurationId).error).toBe(true);
});
it('does not overwrite a pending file raced into place during a write', () => {
  const store = initialized(), original = fs.openSync;
  vi.spyOn(fs, 'openSync').mockImplementation((path, flags, mode) => {
    if (path === file('activation.json.pending')) fs.writeFileSync(path, 'unknown pending', { mode: 0o600 });
    return original(path, flags, mode);
  });
  expect(store.replaceActivation('{}', false)).toBe(false);
  expect(fs.readFileSync(file('activation.json.pending'), 'utf8')).toBe('unknown pending');
});
it('refuses a committed file edit made while the new pending file is being synced', () => {
  const store = initialized(), original = fs.fsyncSync;
  vi.spyOn(fs, 'fsyncSync').mockImplementationOnce(fd => {
    original(fd); fs.writeFileSync(file('launcher.cjs'), 'concurrent user edit');
  });
  expect(store.replaceActivation('{}', false)).toBe(false);
  expect(fs.readFileSync(file('launcher.cjs'), 'utf8')).toBe('concurrent user edit');
  expect(fs.readFileSync(file('activation.json'), 'utf8')).toContain('private-fixture-token');
  expect(fs.existsSync(file('activation.json.pending'))).toBe(true);
});
it('rejects substitution between lstat and no-follow open before reading the new file', () => {
  const store = initialized(), original = fs.openSync, path = file('launcher.cjs');
  let substituted = false;
  vi.spyOn(fs, 'openSync').mockImplementation((target, flags, mode) => {
    if (target === path && !substituted) {
      substituted = true; fs.renameSync(path, join(root, 'retained-launcher'));
      fs.writeFileSync(path, 'substituted file', { mode: 0o600 });
    }
    return original(target, flags, mode);
  });
  expect(store.verify()).toBe(false); expect(store.error).toBe(true);
  expect(fs.readFileSync(path, 'utf8')).toBe('substituted file');
  expect(fs.existsSync(file('activation.json.pending'))).toBe(false);
});
it('rejects a wrong configuration directory name without creating its parent', () => {
  const wrong = join(root, 'nested', 'wrong');
  const store = new ClaudePresenceStore(wrong, configurationId);
  expect(store.error).toBe(true); expect(fs.existsSync(dirname(wrong))).toBe(false);
});

function normalStore() {
  directory = join(root, `claude-normal-${configurationId}`);
  const input = { executable: '/fixture/bin/claude', files: { 'observer.cjs': '// original observer', 'activation.json': '{"token":"old-private"}',
    'hook.json': '{"schemaVersion":1}', 'settings-before.json': 'original private settings with 9007199254740993123456' } };
  const store = new ClaudePresenceStore(directory, configurationId, 'normal'); expect(store.initialize(input)).toBe(true);
  return { store, input };
}
const replacement = () => ({ 'observer.cjs': '// replacement observer', 'activation.json': '{"token":"new-private"}', 'hook.json': '{"schemaVersion":2}' });

it('explicitly replaces normal observer and ownership with a receipted recovery backup while preserving settings-before', () => {
  const { store, input } = normalStore(), receipt = fs.readFileSync(file('receipt.json'), 'utf8');
  expect(store.replaceNormalMaterials(replacement())).toBe(true); expect(store.verify()).toBe(true);
  const backup = JSON.parse(fs.readFileSync(file('upgrade-before.json'), 'utf8'));
  expect(backup).toEqual({ schemaVersion: 1, receipt, materials: { 'observer.cjs': input.files['observer.cjs'],
    'activation.json': input.files['activation.json'], 'hook.json': input.files['hook.json'] } });
  expect(fs.lstatSync(file('upgrade-before.json')).mode & 0o7777).toBe(0o600);
  expect(fs.readFileSync(file('settings-before.json'), 'utf8')).toBe(input.files['settings-before.json']);
  const restored = new ClaudePresenceStore(directory, configurationId, 'normal'); expect(restored.verify()).toBe(true);
  expect(restored.readMaterial('hook.json')).toBe(replacement()['hook.json']);
  expect(restored.replaceActivation('{"token":"rotated"}', false)).toBe(true); expect(restored.setDisabled(true)).toBe(true);
  expect(JSON.stringify(restored.read())).not.toMatch(/token|private|original/);
});

it.each(['observer', 'receipt'])('preserves recovery materials and prospective ownership on partial %s replacement failure', failedFile => {
  const { store, input } = normalStore(), beforeReceipt = fs.readFileSync(file('receipt.json')), rename = fs.renameSync;
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (to === file(failedFile === 'observer' ? 'observer.cjs' : 'receipt.json')) throw new Error('fixture'); rename(from, to);
  });
  expect(store.replaceNormalMaterials(replacement())).toBe(false); expect(store.error).toBe(true);
  expect(fs.readFileSync(file('receipt.json'))).toEqual(beforeReceipt); expect(fs.existsSync(file('upgrade-before.json'))).toBe(true);
  expect(fs.readFileSync(file('hook.json'), 'utf8')).toBe(replacement()['hook.json']);
  expect(fs.readFileSync(file('settings-before.json'), 'utf8')).toBe(input.files['settings-before.json']);
  const restored = new ClaudePresenceStore(directory, configurationId, 'normal'); expect(restored.error).toBe(true);
  expect(restored.replaceActivation('{}', false)).toBe(false);
});

it.each(['edited', 'unknown', 'pending', 'missing-input', 'extra-input', 'oversized'])('does not mutate normal materials when upgrade is unsafe: %s', kind => {
  const { store } = normalStore(), materials: Record<string, string> = replacement(), receipt = fs.readFileSync(file('receipt.json'));
  if (kind === 'edited') fs.writeFileSync(file('observer.cjs'), '// user edit');
  if (kind === 'unknown') fs.writeFileSync(file('upgrade-before.json'), 'unknown backup', { mode: 0o600 });
  if (kind === 'pending') fs.writeFileSync(file('observer.cjs.pending'), 'unknown pending', { mode: 0o600 });
  if (kind === 'missing-input') delete materials['hook.json'];
  if (kind === 'extra-input') materials['settings-before.json'] = 'forbidden replacement';
  if (kind === 'oversized') materials['observer.cjs'] = 'x'.repeat(512 * 1024 + 1);
  const before = fs.readFileSync(file('observer.cjs'));
  expect(store.replaceNormalMaterials(materials)).toBe(false);
  expect(fs.readFileSync(file('observer.cjs'))).toEqual(before); expect(fs.readFileSync(file('receipt.json'))).toEqual(receipt);
  if (kind === 'unknown') expect(fs.readFileSync(file('upgrade-before.json'), 'utf8')).toBe('unknown backup');
  else expect(fs.existsSync(file('upgrade-before.json'))).toBe(false);
});
