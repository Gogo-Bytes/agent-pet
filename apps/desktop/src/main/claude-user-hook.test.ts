import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyClaudeUserHook, inspectClaudeUserHook, isClaudeUserHookOwnership, prepareClaudeUserHook,
  withdrawClaudeUserHook, type HookOwnership } from './claude-user-hook.js';

vi.mock('node:fs', async original => ({ ...await original<typeof import('node:fs')>() }));
let directory: string, path: string;
const command = "'/fixture/app/node' '/fixture/private/user-hook.cjs'";
const retained: string[] = [];
const prepare = () => prepareClaudeUserHook({ directory, command });
function install(text?: string, mode = 0o600): HookOwnership {
  if (text !== undefined) fs.writeFileSync(path, text, { mode });
  const plan = prepare(); expect(plan.canApply).toBe(true); expect(plan.ownership).not.toBeNull();
  const ownership = applyClaudeUserHook(plan); expect(ownership).not.toBeNull(); return ownership!;
}
beforeEach(() => {
  directory = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pet-claude-hook-'))); path = join(directory, 'settings.json');
});
afterEach(() => { vi.restoreAllMocks(); for (const root of [directory, ...retained.splice(0)]) fs.rmSync(root, { recursive: true, force: true }); });

it('prepares without writes, exposes prospective ownership, creates private settings, and retains an empty file on withdrawal', () => {
  const plan = prepare();
  expect(plan).toMatchObject({ path, exists: false, canApply: true, original: null }); expect(fs.readdirSync(directory)).toEqual([]);
  expect(isClaudeUserHookOwnership(plan.ownership)).toBe(true);
  const ownership = applyClaudeUserHook(plan)!;
  expect(ownership).toEqual(plan.ownership); expect(applyClaudeUserHook(plan)).toBeNull();
  expect(inspectClaudeUserHook(ownership)).toBe(true); expect(fs.statSync(path).mode & 0o7777).toBe(0o600);
  expect(JSON.parse(fs.readFileSync(path, 'utf8'))).toEqual({ hooks: { SessionStart: [ownership.entry] } });
  expect(withdrawClaudeUserHook(JSON.parse(JSON.stringify(ownership)))).toBe(true);
  expect(fs.readFileSync(path, 'utf8')).toBe('{}'); expect(inspectClaudeUserHook(ownership)).toBe(false);
  expect(withdrawClaudeUserHook(ownership)).toBe(true);
});
it.each([
  '{\n  "apiKey" : "private fixture", "large" : 9007199254740993123456, "minus":-0, "exponent":1.2300e+42\n}\n',
  '{ "ho\\u006fks" : {  }, "escaped\\u004bey": "value\\u0041" }\r\n',
  '{ "hooks":{ "SessionStart" : [ \n\t ] }, "other":true }\n',
  '{ "hooks":{ "Stop":[{"hooks":[{"type":"command","command":"existing-stop"}]}] } }',
  '{"hooks":{"SessionStart":[{"matcher":"startup","hooks":[{"type":"command","command":"existing-start"}]}]}}',
])('round-trips all original bytes and preserves hook entries: %s', original => {
  const ownership = install(original, 0o644);
  expect(fs.statSync(path).mode & 0o7777).toBe(0o644);
  const during = fs.readFileSync(path, 'utf8');
  expect(during).toContain('"timeout":2'); expect(inspectClaudeUserHook(ownership)).toBe(true);
  expect(withdrawClaudeUserHook(ownership)).toBe(true); expect(fs.readFileSync(path, 'utf8')).toBe(original);
  expect(fs.statSync(path).mode & 0o7777).toBe(0o644);
});
it('preserves unrelated settings and hook edits made after installation', () => {
  const ownership = install('{"hooks":{"SessionStart":[]},"original":9007199254740993123456}');
  const text = fs.readFileSync(path, 'utf8');
  const edited = text.replace('"original":', '"userAdded":"unchanged\\u0041", "original":')
    .replace('"SessionStart":[', '"Stop":[], "SessionStart":[{"hooks":[{"type":"command","command":"new-user-command"}]},');
  fs.writeFileSync(path, edited);
  expect(inspectClaudeUserHook(ownership)).toBe(true); expect(withdrawClaudeUserHook(ownership)).toBe(true);
  expect(fs.readFileSync(path, 'utf8')).toBe('{"hooks":{"Stop":[], "SessionStart":[{"hooks":[{"type":"command","command":"new-user-command"}]}]},"userAdded":"unchanged\\u0041", "original":9007199254740993123456}');
});
it('retains new fields when originally created hooks or SessionStart become shared with user entries', () => {
  const ownership = install('{ "other" : 7 }');
  const settings = JSON.parse(fs.readFileSync(path, 'utf8'));
  settings.hooks.Stop = []; settings.hooks.SessionStart.push({ hooks: [{ type: 'command', command: 'user-command' }] });
  fs.writeFileSync(path, JSON.stringify(settings));
  expect(withdrawClaudeUserHook(ownership)).toBe(true);
  expect(JSON.parse(fs.readFileSync(path, 'utf8'))).toEqual({ other: 7, hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'user-command' }] }], Stop: [] } });
});
it('honors global disable before apply/inspect while safely withdrawing its own hook without enabling hooks', () => {
  fs.writeFileSync(path, '{"disableAllHooks":true}'); const blocked = prepare();
  expect(blocked.canApply).toBe(false); expect(blocked.ownership).toBeNull(); expect(applyClaudeUserHook(blocked)).toBeNull();
  expect(fs.readFileSync(path, 'utf8')).toBe('{"disableAllHooks":true}');
  fs.unlinkSync(path); const ownership = install();
  const disabled = fs.readFileSync(path, 'utf8').replace('{', '{"disableAllHooks":true,'); fs.writeFileSync(path, disabled);
  expect(inspectClaudeUserHook(ownership)).toBe(false); expect(withdrawClaudeUserHook(ownership)).toBe(true);
  expect(fs.readFileSync(path, 'utf8')).toBe('{"disableAllHooks":true}');
});
it.each([
  '{"hooks":[]}', '{"hooks":{"SessionStart":{}}}', '{"hooks":{"Stop":null}}',
  '{"hooks":{"SessionStart":[null]}}', '{"hooks":{"SessionStart":[{"hooks":{}}]}}',
  '{"disableAllHooks":"false"}', '{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"nested":{"x":1,"x":2}}',
  '{"hooks":{},}', '[{}]', '{/* comment */}', '{"x":01}', '{"x":"bad\nstring"}',
])('blocks malformed/ambiguous settings without modifying bytes: %s', original => {
  fs.writeFileSync(path, original);
  const plan = prepare(); expect(plan.canApply).toBe(false); expect(plan.original).toBeNull();
  expect(applyClaudeUserHook(plan)).toBeNull(); expect(fs.readFileSync(path, 'utf8')).toBe(original);
});
it('rejects invalid UTF-8, excessive nesting and oversized input/output with no write', () => {
  for (const bytes of [Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]),
    Buffer.from('\ufeff{}'),
    Buffer.from('{"x":'.repeat(70) + '0' + '}'.repeat(70)), Buffer.from('{}' + ' '.repeat(64 * 1024)),
    Buffer.from('{}' + ' '.repeat(64 * 1024 - 2))]) {
    fs.writeFileSync(path, bytes); expect(prepare().canApply).toBe(false); expect(fs.readFileSync(path)).toEqual(bytes);
  }
});
it.each(['modified', 'duplicate', 'other-event'])('preserves ambiguous or modified owned entries: %s', mode => {
  const ownership = install('{"user":"preserve"}'), settings = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (mode === 'modified') settings.hooks.SessionStart[0].hooks[0].timeout = 3;
  if (mode === 'duplicate') settings.hooks.SessionStart.push(structuredClone(settings.hooks.SessionStart[0]));
  if (mode === 'other-event') settings.hooks.Stop = [structuredClone(settings.hooks.SessionStart[0])];
  const bytes = JSON.stringify(settings); fs.writeFileSync(path, bytes);
  expect(prepare().canApply).toBe(false); expect(inspectClaudeUserHook(ownership)).toBe(false);
  expect(withdrawClaudeUserHook(ownership)).toBe(false); expect(fs.readFileSync(path, 'utf8')).toBe(bytes);
});
it.each(['suffix', 'prefix', 'requote', 'changed-prefix', 'moved', 'duplicate'])('preserves modified private observer references: %s', mode => {
  const privateCommand = "'/fixture/app/node' '/fixture/private/claude-normal-123e4567-e89b-42d3-a456-426614174000/observer.cjs'";
  const plan = prepareClaudeUserHook({ directory, command: privateCommand }), ownership = applyClaudeUserHook(plan)!;
  const settings = JSON.parse(fs.readFileSync(path, 'utf8'));
  const hook = settings.hooks.SessionStart[0].hooks[0];
  if (mode === 'suffix') hook.command += ' --user-flag';
  if (mode === 'prefix') hook.command = `env FIXTURE=1 ${hook.command}`;
  if (mode === 'requote') hook.command = hook.command.replaceAll("'", '"');
  if (mode === 'changed-prefix') hook.command = 'node /changed/prefix/claude-normal-123e4567-e89b-42d3-a456-426614174000/observer.cjs';
  if (mode === 'moved') { hook.command += ' --user-flag'; settings.hooks.Stop = settings.hooks.SessionStart; settings.hooks.SessionStart = []; }
  if (mode === 'duplicate') {
    const modified = structuredClone(settings.hooks.SessionStart[0]); modified.hooks[0].command += ' --user-flag'; settings.hooks.Stop = [modified];
  }
  const bytes = JSON.stringify(settings); fs.writeFileSync(path, bytes);
  expect(prepareClaudeUserHook({ directory, command: privateCommand }).canApply).toBe(false);
  expect(inspectClaudeUserHook(ownership)).toBe(false); expect(withdrawClaudeUserHook(ownership)).toBe(false);
  expect(fs.readFileSync(path, 'utf8')).toBe(bytes); expect(fs.existsSync(join(directory, 'settings.agent-pet.pending.json'))).toBe(false);
});
it.each(['suffix', 'prefix', 'requote'])('preserves generic owned command/script references without a private UUID marker: %s', mode => {
  const ownership = install(), settings = JSON.parse(fs.readFileSync(path, 'utf8')), hook = settings.hooks.SessionStart[0].hooks[0];
  if (mode === 'suffix') hook.command += ' --user-flag';
  if (mode === 'prefix') hook.command = `env FIXTURE=1 ${hook.command}`;
  if (mode === 'requote') hook.command = 'node "/fixture/private/user-hook.cjs"';
  const bytes = JSON.stringify(settings); fs.writeFileSync(path, bytes);
  expect(withdrawClaudeUserHook(ownership)).toBe(false); expect(fs.readFileSync(path, 'utf8')).toBe(bytes);
});
it('still recognizes genuinely absent private observer references without touching user settings', () => {
  const plan = prepareClaudeUserHook({ directory, command: 'node /fixture/claude-normal-123e4567-e89b-42d3-a456-426614174000/observer.cjs' });
  const ownership = applyClaudeUserHook(plan)!;
  const unrelated = '{ "hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"node /user/other/observer.cjs"}]}]}, "user":1e99 }';
  fs.writeFileSync(path, unrelated); expect(withdrawClaudeUserHook(ownership)).toBe(true); expect(fs.readFileSync(path, 'utf8')).toBe(unrelated);
});
it('preserves private runtime references moved from command text into exec-form args', () => {
  const privateDirectory = '/fixture/private/claude-normal-123e4567-e89b-42d3-a456-426614174000';
  const privateCommand = `'/fixture/app/Electron' '${privateDirectory}/observer.cjs'`;
  const plan = prepareClaudeUserHook({ directory, command: privateCommand }), ownership = applyClaudeUserHook(plan)!;
  const settings = JSON.parse(fs.readFileSync(path, 'utf8'));
  settings.hooks.SessionStart[0].hooks[0] = { type: 'command', command: '/fixture/app/Electron',
    args: [`${privateDirectory}/observer.cjs`, `${privateDirectory}/activation.json`], timeout: 2 };
  const bytes = JSON.stringify(settings); fs.writeFileSync(path, bytes);
  expect(prepareClaudeUserHook({ directory, command: privateCommand }).canApply).toBe(false);
  expect(inspectClaudeUserHook(ownership)).toBe(false); expect(withdrawClaudeUserHook(ownership)).toBe(false);
  expect(fs.readFileSync(path, 'utf8')).toBe(bytes); expect(fs.existsSync(join(directory, 'settings.agent-pet.pending.json'))).toBe(false);
});
it('withdraws an already-absent owned entry without touching user bytes or creating a missing file', () => {
  const ownership = install(); fs.writeFileSync(path, '{ "user" : 1e99 }\n');
  const write = vi.spyOn(fs, 'writeFileSync');
  expect(withdrawClaudeUserHook(ownership)).toBe(true); expect(write).not.toHaveBeenCalled();
  fs.unlinkSync(path); expect(withdrawClaudeUserHook(ownership)).toBe(true); expect(fs.existsSync(path)).toBe(false);
});
it.each(['symlink-file', 'symlink-directory', 'hardlink', 'mode', 'unsafe-parent', 'pending'])('blocks unsafe %s while preserving its target', mode => {
  fs.writeFileSync(path, '{}', { mode: 0o600 });
  if (mode === 'symlink-file') { fs.renameSync(path, join(directory, 'retained')); fs.symlinkSync(join(directory, 'retained'), path); }
  if (mode === 'symlink-directory') {
    const moved = `${directory}-retained`; fs.renameSync(directory, moved); retained.push(moved); fs.symlinkSync(moved, directory);
  }
  if (mode === 'hardlink') fs.linkSync(path, join(directory, 'retained'));
  if (mode === 'mode') fs.chmodSync(path, 0o666);
  if (mode === 'unsafe-parent') fs.chmodSync(directory, 0o777);
  if (mode === 'pending') fs.writeFileSync(join(directory, 'settings.agent-pet.pending.json'), 'unknown pending');
  const plan = prepare(); expect(plan.canApply).toBe(false); expect(applyClaudeUserHook(plan)).toBeNull();
  expect(fs.readFileSync(path, 'utf8')).toBe('{}');
  if (mode === 'pending') expect(fs.readFileSync(join(directory, 'settings.agent-pet.pending.json'), 'utf8')).toBe('unknown pending');
});
it('requires an existing selected directory and never creates one', () => {
  const missing = join(directory, 'missing');
  expect(prepareClaudeUserHook({ directory: missing, command }).canApply).toBe(false); expect(fs.existsSync(missing)).toBe(false);
});
it.each(['bytes', 'identity', 'ancestor', 'pending', 'disabled'])('refuses changes after preview: %s', mode => {
  fs.writeFileSync(path, '{}', { mode: 0o600 }); const plan = prepare(); expect(plan.canApply).toBe(true);
  if (mode === 'bytes') fs.writeFileSync(path, '{"user":"new"}');
  if (mode === 'identity') { fs.renameSync(path, join(directory, 'retained')); fs.writeFileSync(path, '{}', { mode: 0o600 }); }
  if (mode === 'ancestor') {
    const moved = `${directory}-retained`; fs.renameSync(directory, moved); retained.push(moved); fs.mkdirSync(directory, { mode: 0o700 }); fs.writeFileSync(path, '{}', { mode: 0o600 });
  }
  if (mode === 'pending') fs.writeFileSync(join(directory, 'settings.agent-pet.pending.json'), 'unknown pending');
  if (mode === 'disabled') fs.writeFileSync(path, '{"disableAllHooks":true}');
  const before = fs.readFileSync(path); expect(applyClaudeUserHook(plan)).toBeNull(); expect(fs.readFileSync(path)).toEqual(before);
});
it('refuses persisted ownership whose directory identity was replaced', () => {
  const ownership = install(), bytes = fs.readFileSync(path), moved = `${directory}-retained`;
  fs.renameSync(directory, moved); retained.push(moved); fs.mkdirSync(directory, { mode: 0o700 }); fs.writeFileSync(path, bytes, { mode: 0o600 });
  expect(inspectClaudeUserHook(ownership)).toBe(false); expect(withdrawClaudeUserHook(ownership)).toBe(false);
  expect(fs.readFileSync(path)).toEqual(bytes);
});
it.each(['write', 'fsync', 'close', 'rename'])('preserves uncertain pending files after %s failure', operation => {
  const plan = prepare();
  if (operation === 'write') vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => { throw new Error('private fixture detail'); });
  if (operation === 'fsync') vi.spyOn(fs, 'fsyncSync').mockImplementationOnce(() => { throw new Error('private fixture detail'); });
  if (operation === 'close') {
    const original = fs.closeSync; vi.spyOn(fs, 'closeSync').mockImplementationOnce(fd => { original(fd); throw new Error('private fixture detail'); });
  }
  if (operation === 'rename') vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('private fixture detail'); });
  expect(applyClaudeUserHook(plan)).toBeNull(); expect(fs.existsSync(path)).toBe(false);
  expect(fs.existsSync(join(directory, 'settings.agent-pet.pending.json'))).toBe(true); expect(prepare().canApply).toBe(false);
});
it('preserves a concurrent user edit detected after pending fsync instead of replacing settings', () => {
  fs.writeFileSync(path, '{}', { mode: 0o600 }); const plan = prepare(), original = fs.fsyncSync;
  vi.spyOn(fs, 'fsyncSync').mockImplementationOnce(fd => { original(fd); fs.writeFileSync(path, '{"user":"concurrent edit"}'); });
  expect(applyClaudeUserHook(plan)).toBeNull(); expect(fs.readFileSync(path, 'utf8')).toBe('{"user":"concurrent edit"}');
  expect(fs.existsSync(join(directory, 'settings.agent-pet.pending.json'))).toBe(true);
});
it('retains an actually committed hook after an uncertain rename result for explicit later withdrawal', () => {
  const plan = prepare(), original = fs.renameSync;
  vi.spyOn(fs, 'renameSync').mockImplementationOnce((from, to) => { original(from, to); throw new Error('private fixture detail'); });
  expect(applyClaudeUserHook(plan)).toBeNull(); expect(inspectClaudeUserHook(plan.ownership!)).toBe(true);
  expect(withdrawClaudeUserHook(plan.ownership!)).toBe(true); expect(fs.readFileSync(path, 'utf8')).toBe('{}');
});
it('validates persisted ownership strictly and keeps original bytes out of it', () => {
  const secret = 'private fixture credential'; fs.writeFileSync(path, `{"credential":"${secret}"}`, { mode: 0o600 });
  const plan = prepare(), ownership = applyClaudeUserHook(plan)!;
  expect(plan.original).toContain(secret); expect(JSON.stringify(plan)).not.toContain(secret);
  expect(Object.keys(plan).sort()).toEqual(['canApply', 'exists', 'notice', 'path']);
  expect(JSON.stringify(ownership)).not.toContain(secret); expect(isClaudeUserHookOwnership(ownership)).toBe(true);
  for (const invalid of [{ ...ownership, extra: true }, { ...ownership, path: join(directory, 'other.json') },
    { ...ownership, command: 'other command' }, { ...ownership, directories: [] }, { ...ownership, entry: {} }]) {
    expect(isClaudeUserHookOwnership(invalid)).toBe(false); expect(inspectClaudeUserHook(invalid as never)).toBe(false);
    expect(withdrawClaudeUserHook(invalid as never)).toBe(false);
  }
});
it('rejects substitution between lstat and no-follow open before reading settings', () => {
  fs.writeFileSync(path, '{}', { mode: 0o600 }); const original = fs.openSync; let replaced = false;
  vi.spyOn(fs, 'openSync').mockImplementation((target, flags, mode) => {
    if (target === path && !replaced) {
      replaced = true; fs.renameSync(path, join(directory, 'retained'));
      fs.writeFileSync(path, '{"user":"substituted"}', { mode: 0o600 });
    }
    return original(target, flags, mode);
  });
  expect(prepare().canApply).toBe(false); expect(fs.readFileSync(path, 'utf8')).toBe('{"user":"substituted"}');
  expect(fs.existsSync(join(directory, 'settings.agent-pet.pending.json'))).toBe(false);
});
