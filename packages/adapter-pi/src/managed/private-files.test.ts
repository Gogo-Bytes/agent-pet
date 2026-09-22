import { expect, test, vi } from 'vitest';
import net from 'node:net';
import * as protocol from './protocol.js';
import { access, chmod, lstat, link, mkdir, readFile, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PrivateFiles } from './private-files.js';
import { fail } from './errors.js';
import { productionPolicy, validatePath } from './path-policy.js';
import { endpoint } from './discovery.js';
import { fixture, opened, cleanups } from './test-helpers.js';
import { openManagedCore } from './service.js';

async function fileFixture() {
  const f = await fixture(); const files = new PrivateFiles(await f.policy.openRoots(f.roots));
  const path = join(f.roots.storageRoot, 'fixture.json');
  await writeFile(path, '{"value":1}', { mode: 0o600 });
  return { ...f, files, path };
}
test('production policy blocks unknown ACL evidence; injected mount denial precedes all owned writes', async () => {
  const f = await fixture();
  await expect(openManagedCore({ ...f, policy: productionPolicy, initialize: true, publish() {} })).rejects.toThrow('acl-unverified');
  await expect(access(join(f.roots.storageRoot, 'owner'))).rejects.toThrow();
  await expect(openManagedCore({ ...f, policy: { async openRoots() { fail('mount-unverified'); } }, initialize: true, publish() {} })).rejects.toThrow('mount-unverified');
  await expect(access(join(f.roots.storageRoot, 'authorization.json'))).rejects.toThrow();
});
test('rejects unsafe path forms and measures endpoint length in UTF8 bytes', () => {
  for (const path of ['relative', '/a/../b', '/a/./b', '/a\0b', '/a//b']) expect(() => validatePath(path)).toThrow('unsupported-path');
  expect(() => endpoint('/' + '界'.repeat(23), 'a'.repeat(32))).toThrow('path-too-long');
  expect(() => endpoint('/safe', '../escape')).toThrow('unsupported-path');
});
for (const kind of ['symlink', 'hardlink', 'fifo', 'directory', 'mode', 'oversize'] as const) {
  test(`real bounded descriptor read rejects ${kind} without exposing content`, async () => {
    const f = await fileFixture(); const other = join(f.roots.storageRoot, 'other');
    if (kind === 'symlink') { await rename(f.path, other); await symlink(other, f.path); }
    if (kind === 'hardlink') await link(f.path, other);
    if (kind === 'fifo') { await unlink(f.path); execFileSync('/usr/bin/mkfifo', ['-m', '600', f.path]); }
    if (kind === 'directory') { await unlink(f.path); await mkdir(f.path, { mode: 0o700 }); }
    if (kind === 'mode') await chmod(f.path, 0o640);
    if (kind === 'oversize') await writeFile(f.path, 'SENTINEL-SECRET'.repeat(2000));
    const error = await f.files.read(f.path, 2048, 'credential-read').catch(error => error);
    expect(error).toBeInstanceOf(Error); expect(error.message).not.toContain('SENTINEL'); expect(error.message).not.toContain(f.base);
  });
}
test('checks all ancestors/private directory modes, symlinks and root identity changes', async () => {
  const f = await fileFixture();
  await chmod(f.roots.storageRoot, 0o750);
  await expect(f.files.read(f.path, 2048, 'credential-read')).rejects.toThrow('path-changed');
  await chmod(f.roots.storageRoot, 0o700);
  const wide = join(f.roots.storageRoot, 'wide'); await mkdir(wide, { mode: 0o750 });
  await expect(f.files.directory(wide, 'credential-read')).rejects.toThrow('unsafe-mode');
  const old = f.roots.storageRoot + '-old'; await rename(f.roots.storageRoot, old);
  await mkdir(f.roots.storageRoot, { mode: 0o700 }); await writeFile(f.path, '{}', { mode: 0o600 });
  await expect(f.files.read(f.path, 2048, 'credential-read')).rejects.toThrow('path-changed');
  const g = await fileFixture();
  const nested = join(g.roots.storageRoot, 'nested'); await symlink(g.roots.storageRoot, nested);
  await expect(g.files.read(join(nested, 'fixture.json'), 2048, 'credential-read')).rejects.toThrow('unsafe-type');
});
test('unknown sticky ancestor permission is not a blanket mode exception', async () => {
  const f = await fileFixture(); const scope = await f.policy.openRoots(f.roots);
  const files = new PrivateFiles({ ...scope, async allowStickyAncestor() { fail('acl-unverified'); } });
  await expect(files.read(f.path, 2048, 'credential-read')).rejects.toThrow('acl-unverified');
});
test('owner mismatch guard uses actual stat shape (not native cross-user evidence)', async () => {
  const f = await fileFixture(); const stat = await lstat(f.path);
  const changed = Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { uid: stat.uid + 1 });
  expect(() => f.files.checkFile(changed, 2048)).toThrow('unsafe-owner');
});
for (const boundary of ['read-open', 'read-complete'] as const) {
  test(`descriptor and mutation checks detect substitution at ${boundary}`, async () => {
    const f = await fileFixture(); let armed = true;
    const files = new PrivateFiles(await f.policy.openRoots(f.roots), async step => {
      if (armed && step === boundary) { armed = false; await rename(f.path, f.path + '.old'); await writeFile(f.path, '{"secret":true}', { mode: 0o600 }); }
    });
    await expect(files.read(f.path, 2048, 'credential-read')).rejects.toThrow('path-changed');
  });
}
test('NONBLOCK/NOFOLLOW reject a FIFO/symlink substitution during open without hanging', async () => {
  for (const fifo of [true, false]) {
    const f = await fileFixture();
    const files = new PrivateFiles(await f.policy.openRoots(f.roots), async step => {
      if (step === 'read-open') { await rename(f.path, f.path + '.old');
        if (fifo) execFileSync('/usr/bin/mkfifo', ['-m', '600', f.path]); else await symlink(f.path + '.old', f.path);
      }
    });
    await expect(files.read(f.path, 2048, 'credential-read')).rejects.toThrow();
  }
});
test('exclusive initial publication never clobbers foreign leaf; owned replacement and cleanup detect edits', async () => {
  const f = await fileFixture(); const before = await readFile(f.path, 'utf8');
  await expect(f.files.publish(f.path, { foreign: false }, 2048, 'credential-write')).rejects.toThrow('durability-failed');
  expect(await readFile(f.path, 'utf8')).toBe(before);
  const owned = (await f.files.read(f.path, 2048, 'credential-read')).owned;
  await writeFile(f.path, '{"changed":true}');
  await expect(f.files.publish(f.path, {}, 2048, 'credential-write', owned)).rejects.toThrow('path-changed');
  await expect(f.files.remove(owned)).rejects.toThrow('path-changed');
  expect(await readFile(f.path, 'utf8')).toContain('changed');
});
test('exclusive ownership directory collision leaves unknown contents untouched', async () => {
  const f = await fixture(); await mkdir(join(f.roots.storageRoot, 'owner'), { mode: 0o700 });
  await writeFile(join(f.roots.storageRoot, 'owner', 'foreign'), 'keep', { mode: 0o600 });
  await expect(openManagedCore({ ...f, initialize: true, publish() {} })).rejects.toThrow('ownership-busy');
  expect(await readFile(join(f.roots.storageRoot, 'owner', 'foreign'), 'utf8')).toBe('keep');
});
test('normal Node socket close removes owned leaf; unknown instance siblings prevent directory and claim cleanup', async () => {
  const f = await opened(); const discovery = await f.service.start(); const path = endpoint(f.roots.runtimeRoot, discovery.instance);
  expect((await lstat(path)).isSocket()).toBe(true);
  await writeFile(join(f.roots.runtimeRoot, discovery.instance, 'foreign'), 'keep', { mode: 0o600 });
  await expect(f.service.stop()).rejects.toThrow('unavailable');
  await expect(access(path)).rejects.toThrow();
  expect(await readFile(join(f.roots.runtimeRoot, discovery.instance, 'foreign'), 'utf8')).toBe('keep');
  await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
});
test('owned discovery cleanup preserves modified/replacement record and retains claim', async () => {
  const f = await opened(); await f.service.start(); const path = join(f.roots.storageRoot, 'discovery.json');
  await rename(path, path + '.old'); await writeFile(path, '{"foreign-generation":true}', { mode: 0o600 });
  await expect(f.service.stop()).rejects.toThrow('path-changed');
  expect(await readFile(path, 'utf8')).toBe('{"foreign-generation":true}');
  await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
});
test('colliding random instance directories/socket are never unlinked; retry count is bounded', async () => {
  const f = await opened(); const id = 'd'.repeat(32); await mkdir(join(f.roots.runtimeRoot, id), { mode: 0o700 });
  const path = endpoint(f.roots.runtimeRoot, id); const server = net.createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
  cleanups.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  const original = await lstat(path); const random = vi.spyOn(protocol, 'opaqueId').mockReturnValue(id);
  try {
    await expect(f.service.start()).rejects.toThrow('ownership-busy'); expect(random).toHaveBeenCalledTimes(4);
    expect((await lstat(path)).ino).toBe(original.ino);
    await expect(f.service.stop()).rejects.toThrow('outcome-uncertain');
    expect((await lstat(path)).ino).toBe(original.ino);
  } finally { random.mockRestore(); }
});
test('native Node close limitation: substituted socket leaf is unlinked by runtime; shutdown reports path-changed and retains barrier', async () => {
  const f = await opened(); const discovery = await f.service.start(); const path = endpoint(f.roots.runtimeRoot, discovery.instance);
  await unlink(path); await writeFile(path, 'foreign-synthetic-leaf', { mode: 0o600 });
  await expect(f.service.stop()).rejects.toThrow('path-changed');
  // Observed Node v22 behavior, NOT a foreign-preservation or ACL proof.
  await expect(access(path)).rejects.toThrow();
  await access(join(f.roots.storageRoot, 'owner'));
  await access(join(f.roots.storageRoot, 'discovery.json'));
  await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
});
