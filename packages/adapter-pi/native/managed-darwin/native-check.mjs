import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, chmodSync, renameSync,
  symlinkSync, linkSync, unlinkSync, statSync, existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { spawnSync, fork } from 'node:child_process';
import { once } from 'node:events';
const here = dirname(fileURLToPath(import.meta.url));
const n = createRequire(import.meta.url)('./out/managed-darwin.node');
const childPath = join(here, 'lease-child.mjs');
const timeout = 10_000;
// Exercise the actual TS policy against native evidence, without adding a runtime dependency.
const policySource = readFileSync(join(here, '../../src/managed/darwin-policy.ts'), 'utf8');
const policyJs = ts.transpileModule(policySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { acceptDarwinEvidence } = await import(`data:text/javascript;base64,${Buffer.from(policyJs).toString('base64')}`);
function fixture(t) {
  const path = mkdtempSync('/private/tmp/agent-pet-p2b2-'); chmodSync(path, 0o700);
  const handles = [], aclPaths = new Set();
  t.after(() => {
    for (const h of handles.reverse()) n.close(h);
    // Only explicitly created/tracked fixture entries; helper verifies owner/type/nofollow.
    for (const entry of aclPaths) acl(entry, 'remove');
    rmSync(path, { recursive: true, force: true });
  });
  const keep = h => { handles.push(h); return h; };
  return { path, keep, root: keep(n.openRoot(path)), acl(entry, mode) { aclPaths.add(entry); acl(entry, mode); },
    trackInherited(entry) { aclPaths.add(entry); }, file(name, value = 'synthetic') {
    writeFileSync(join(path, name), value, { mode: 0o600 }); return join(path, name);
  } };
}
function acl(path, mode) {
  const r = spawnSync(join(here, 'out/fixture-acl'), [path, mode], { timeout: 3000, maxBuffer: 4096, encoding: 'utf8' });
  assert.equal(r.error, undefined); assert.equal(r.status, 0, r.stderr);
}
function contender(path) {
  const r = spawnSync(process.execPath, [childPath, path, 'attempt'], { timeout: 3000, maxBuffer: 4096, encoding: 'utf8' });
  assert.equal(r.error, undefined); assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
}
test('actual native no-ACL APFS fixture, exact identities and fresh descriptor evidence', { timeout }, t => {
  const f = fixture(t), e = n.inspect(f.root), st = statSync(f.path, { bigint: true });
  assert.equal(e.filesystem, 'apfs'); assert.ok(e.mountFlags & 0x1000);
  assert.equal(e.mountFlags & 0x200000, 0); assert.equal(e.ino, st.ino); assert.equal(e.dev, st.dev);
  assert.equal(e.mtimeNs, st.mtimeNs); assert.equal(e.ctimeNs, st.ctimeNs);
  assert.deepEqual(e.acl.entries, []); assert.equal(e.acl.flags, 0); assert.equal(e.acl.state, 'absent');
  acceptDarwinEvidence(e, 'directory', process.getuid());
  const ancestors = n.ancestors(f.root);
  assert.equal(ancestors.length, f.path.split('/').length - 1);
  assert.ok(ancestors.every(e => typeof e.ino === 'bigint' && typeof e.mountFlags === 'number'));
  console.log(`Native fixture evidence only: APFS flags=0x${e.mountFlags.toString(16)}, ${process.version}/${process.arch}`);
});
test('actual ACL allow/deny, multiple entries, empty ACL and inherited ACE extraction', { timeout }, t => {
  const f = fixture(t);
  for (const [mode, tag, permissions, count] of [['deny-delete', 2, 16n, 1], ['allow-read', 1, 2n, 1],
    ['allow-write', 1, 4n, 1], ['multiple', 2, 16n, 3], ['maximum', 2, 16n, 128], ['empty', 0, 0n, 0]]) {
    f.acl(f.path, mode); const e = n.inspect(f.root);
    assert.equal(e.acl.entries.length, count);
    for (const a of e.acl.entries) { assert.equal(a.tag, tag); assert.equal(a.permissions, permissions); assert.match(a.principal, /^[0-9a-f]{32}$/); }
    if (tag === 1) assert.throws(() => acceptDarwinEvidence(e, 'directory', process.getuid()), /unsupported-acl/);
    else acceptDarwinEvidence(e, 'directory', process.getuid());
    if (mode === 'allow-write') assert.throws(() => acceptDarwinEvidence(e, 'ancestor', process.getuid()), /unsupported-acl/);
    else acceptDarwinEvidence(e, 'ancestor', process.getuid());
  }
  for (const mode of ['inherit-allow', 'inherit-deny']) {
    f.acl(f.path, mode);
    const name = mode; mkdirSync(join(f.path, name), { mode: 0o700 }); f.trackInherited(join(f.path, name));
    const h = f.keep(n.openDirectory(f.root, name)); const e = n.inspect(h);
    assert.ok(e.acl.entries.some(a => (a.flags & 0x10) && a.tag === (mode === 'inherit-allow' ? 1 : 2)));
    if (mode === 'inherit-allow') assert.throws(() => acceptDarwinEvidence(e, 'directory', process.getuid()), /unsupported-acl/);
    else acceptDarwinEvidence(e, 'directory', process.getuid());
  }
  f.acl(f.path, 'remove'); assert.deepEqual(n.inspect(f.root).acl.entries, []);
  assert.equal(n.inspect(f.root).acl.state, 'absent');
});
test('same-descriptor bounded reads; no path fallback or truncated max/identity', { timeout }, t => {
  const f = fixture(t); f.file('payload'); const h = f.keep(n.openFile(f.root, 'payload'));
  const read = n.readBounded(h, 256); assert.equal(read.bytes.toString(), 'synthetic');
  assert.equal(read.before.ino, read.after.ino); assert.equal(read.before.ctimeNs, read.after.ctimeNs);
  for (const max of [0, -1, 1.2, NaN, Infinity, 262145, 2 ** 32 + 1, '256']) assert.throws(() => n.readBounded(h, max));
  assert.throws(() => n.readBounded(h, 2));
  n.close(h); n.close(h); assert.throws(() => n.readBounded(h, 256), { code: 'closed-handle' });
});
test('rejects invalid/forged handles, NUL/traversal/oversize components and argument counts', { timeout }, t => {
  const f = fixture(t);
  for (const bad of [{}, null, 1, Buffer.alloc(8)]) assert.throws(() => n.inspect(bad));
  for (const bad of ['..', '.', '../outside', 'a/b', 'a\0b', '', 'a'.repeat(256)]) assert.throws(() => n.openFile(f.root, bad));
  for (const bad of ['', 'relative', `${f.path}/`, `${f.path}/../`, `${f.path}//x`, `${f.path}/./x`, `${f.path}\0x`]) assert.throws(() => n.openRoot(bad));
  assert.throws(() => n.openRoot(f.path, 'extra')); assert.throws(() => n.inspect());
  assert.throws(() => n.acquireWriter(f.root, 'arbitrary-lock-name'));
});
test('symlink, hardlink, FIFO and broad mode rejected without blocking', { timeout }, t => {
  const f = fixture(t); const path = f.file('payload');
  symlinkSync(path, join(f.path, 'symlink')); assert.throws(() => n.openFile(f.root, 'symlink'));
  linkSync(path, join(f.path, 'hard')); assert.throws(() => n.openFile(f.root, 'payload'));
  unlinkSync(join(f.path, 'hard')); chmodSync(path, 0o640); assert.throws(() => n.openFile(f.root, 'payload'));
  const fifo = spawnSync('/usr/bin/mkfifo', [join(f.path, 'fifo')], { timeout: 3000, maxBuffer: 4096 });
  assert.equal(fifo.status, 0); assert.throws(() => n.openFile(f.root, 'fifo'));
  symlinkSync(f.path, join(f.path, 'dirlink')); assert.throws(() => n.openRoot(join(f.path, 'dirlink')));
});
test('substituted leaf and detached root/parent rejected; closed fd cannot be reused as handle', { timeout }, t => {
  const f = fixture(t); const path = f.file('payload'); const h = f.keep(n.openFile(f.root, 'payload'));
  renameSync(path, `${path}.old`); f.file('payload', 'replacement'); assert.throws(() => n.inspect(h), { code: 'path-changed' });
  mkdirSync(join(f.path, 'parent'), { mode: 0o700 }); const p = f.keep(n.openDirectory(f.root, 'parent'));
  renameSync(join(f.path, 'parent'), join(f.path, 'old-parent')); mkdirSync(join(f.path, 'parent'), { mode: 0o700 });
  assert.throws(() => n.inspect(p), { code: 'path-changed' });
  n.close(h); const newer = f.keep(n.openFile(f.root, 'payload')); assert.throws(() => n.inspect(h)); assert.ok(n.inspect(newer));
  renameSync(f.path, `${f.path}-moved`); mkdirSync(f.path, { mode: 0o700 });
  t.after(() => rmSync(`${f.path}-moved`, { recursive: true, force: true }));
  assert.throws(() => n.inspect(f.root), { code: 'path-changed' }); assert.throws(() => n.inspect(newer), { code: 'path-changed' });
});
test('ACL changes are observed on retained handles; no verification TTL', { timeout }, t => {
  const f = fixture(t); f.file('payload'); const h = f.keep(n.openFile(f.root, 'payload'));
  assert.equal(n.inspect(h).acl.entries.length, 0); f.acl(join(f.path, 'payload'), 'allow-read');
  assert.equal(n.readBounded(h, 256).after.acl.entries[0].tag, 1);
  f.acl(join(f.path, 'payload'), 'remove'); assert.equal(n.inspect(h).acl.entries.length, 0);
});
test('stable writer inode: same-process + cross-channel independent process contention, close/reacquire', { timeout }, t => {
  const f = fixture(t); assert.throws(() => n.acquireWriter(f.root)); assert.equal(existsSync(join(f.path, 'writer.lock')), false);
  f.file('writer.lock', ''); const before = statSync(join(f.path, 'writer.lock'), { bigint: true });
  const lease = f.keep(n.acquireWriter(f.root)); const second = f.keep(n.openRoot(f.path));
  assert.throws(() => n.acquireWriter(second), { code: 'ownership-busy' }); assert.equal(contender(f.path), 'busy');
  n.close(lease); assert.equal(contender(f.path), 'acquired');
  const after = statSync(join(f.path, 'writer.lock'), { bigint: true }); assert.equal(after.ino, before.ino); assert.equal(after.nlink, 1n);
});
test('failed lease acquisition preserves unsafe inode; closing root never releases a live lease', { timeout }, t => {
  const f = fixture(t); const path = f.file('writer.lock', 'not-empty');
  const before = statSync(path, { bigint: true });
  assert.throws(() => n.acquireWriter(f.root), { code: 'unsafe-object' });
  assert.equal(statSync(path, { bigint: true }).ino, before.ino);
  writeFileSync(path, ''); chmodSync(path, 0o640);
  assert.throws(() => n.acquireWriter(f.root), { code: 'unsafe-object' });
  chmodSync(path, 0o600); linkSync(path, join(f.path, 'extra-link'));
  assert.throws(() => n.acquireWriter(f.root), { code: 'unsafe-object' }); unlinkSync(join(f.path, 'extra-link'));
  const lease = f.keep(n.acquireWriter(f.root)); n.close(f.root);
  assert.throws(() => n.inspect(lease), { code: 'path-changed' });
  assert.equal(contender(f.path), 'busy'); n.close(lease); assert.equal(contender(f.path), 'acquired');
  assert.equal(statSync(path, { bigint: true }).ino, before.ino);
});
test('GC cannot silently release writer lease; child process exit releases it', { timeout }, t => {
  const f = fixture(t); f.file('writer.lock', '');
  const code = `const n=require(${JSON.stringify(join(here, 'out/managed-darwin.node'))}); const r=n.openRoot(${JSON.stringify(f.path)}); n.acquireWriter(r); for(let i=0;i<4;i++)global.gc(); try{n.acquireWriter(r);process.exitCode=1}catch(e){if(e.code!=='ownership-busy')throw e;}`;
  const child = spawnSync(process.execPath, ['--expose-gc', '-e', code], { timeout: 3000, maxBuffer: 4096, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr); assert.equal(contender(f.path), 'acquired');
});
test('live unresponsive writer never stolen; SIGKILL releases lock but preserves durable claim fixture', { timeout }, async t => {
  const f = fixture(t); f.file('writer.lock', ''); mkdirSync(join(f.path, 'owner'), { mode: 0o700 });
  const child = fork(childPath, [f.path, 'hold'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [] });
  let output = 0;
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk.length; if (output > 4096) child.kill('SIGKILL'); });
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  t.after(() => { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); });
  const ready = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error('holder exited before ready'); })]);
  assert.equal(ready[0].state, 'held'); assert.equal(contender(f.path), 'busy');
  const exit = once(child, 'exit'); child.kill('SIGKILL'); await exit;
  assert.equal(contender(f.path), 'acquired'); assert.ok(existsSync(join(f.path, 'owner'))); assert.equal(output, 0);
});
