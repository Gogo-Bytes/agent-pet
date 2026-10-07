import assert from 'node:assert/strict';
import { access, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork, spawnSync, type ChildProcess } from 'node:child_process';
import { loadDarwinPrimitives, type NativeHandle } from '../native-darwin.js';
import { acceptDarwinEvidence } from '../darwin-policy.js';
import { fixturePolicy } from '../test-policy.js';
import { PrivateFiles } from '../private-files.js';
import { openManagedCore } from '../service.js';
import { OwnedFixture, bounded } from './fixtures.js';
import type { CaseEvidence, Cleanup } from './evidence.js';
const nativeDirectory = fileURLToPath(new URL('../../../native/managed-darwin/', import.meta.url));
const helper = join(nativeDirectory, 'out/fixture-acl');

export async function runNativeControls(cases: CaseEvidence[], cleanup: Cleanup): Promise<boolean> {
  const aclCase = cases.find(c => c.id === 'native-acl')!;
  const leaseCase = cases.find(c => c.id === 'native-lease-owner')!;
  if (process.platform !== 'darwin' || !process.getuid || process.getuid() === 0) return false;
  try {
    await access(helper, constants.X_OK);
    await access(join(nativeDirectory, 'out/managed-darwin.node'), constants.R_OK);
  } catch { return false; }
  let native: ReturnType<typeof loadDarwinPrimitives>;
  try { native = loadDarwinPrimitives(); } catch {
    Object.assign(aclCase, { status: 'BLOCKED', code: 'PREREQUISITE' }); return false;
  }
  let f: OwnedFixture | undefined;
  let handles: NativeHandle[] = [];
  const keep = (h: NativeHandle) => { handles.push(h); return h; };
  const closeHandles = () => {
    const closing = handles; handles = [];
    let failed = false;
    for (const h of closing.reverse()) { try { native.close(h); } catch { failed = true; } }
    // Never retry an uncertain native close, including from a catch/finally path.
    if (failed) throw new Error('D6_CLOSE_UNCERTAIN');
  };
  const acl = async (path: string, mode: string) => {
    await f!.verify(path);
    const r = spawnSync(helper, [path, mode], { timeout: 2000, maxBuffer: 1024, stdio: 'pipe' });
    assert.equal(r.error, undefined); assert.equal(r.status, 0);
  };
  try {
    // Existing native helper permits only this synthetic /private/tmp prefix. Ancestor
    // evidence is deliberately NOT claimed accepted (sticky /tmp is production-rejected).
    f = await OwnedFixture.create('/private/tmp/agent-pet-p2b2-d61-acl-');
    const root = keep(native.openRoot(f.root));
    const initial = native.inspect(root);
    if (initial.filesystem !== 'apfs' || !(initial.mountFlags & 0x1000) || initial.mountFlags & 0x200000) {
      Object.assign(aclCase, { status: 'BLOCKED', code: 'PREREQUISITE' });
      closeHandles(); cleanup.status = 'BLOCKED';
      cleanup.roots.push({ alias: 'acl-root', verdict: 'PRESERVED', code: 'PREREQUISITE' }); return true;
    }
    acceptDarwinEvidence(initial, 'directory', process.getuid());
    assert.equal(initial.acl.state, 'absent');
    const positive = join(f.root, 'positive'); await f.file(positive, 'synthetic');
    const positiveHandle = keep(native.openFile(root, 'positive'));
    assert.equal(native.readBounded(positiveHandle, 64).bytes.toString(), 'synthetic');
    await unlink(positive); // positive control for the same unlink operation denied below
    const denied = join(f.root, 'denied'); await f.file(denied, 'synthetic');
    const deniedHandle = keep(native.openFile(root, 'denied'));
    await acl(denied, 'deny-delete');
    const denyEvidence = native.inspect(deniedHandle);
    acceptDarwinEvidence(denyEvidence, 'file', process.getuid());
    assert.ok(denyEvidence.acl.entries.some(e => e.tag === 2 && e.permissions === 16n));
    await assert.rejects(unlink(denied), error => ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? ''));
    await acl(denied, 'remove');
    const allowed = join(f.root, 'allowed'); await f.file(allowed, 'synthetic');
    const allowedHandle = keep(native.openFile(root, 'allowed'));
    await acl(allowed, 'allow-read');
    assert.throws(() => acceptDarwinEvidence(native.inspect(allowedHandle), 'file', process.getuid!()), /unsupported-acl/);
    assert.equal(native.readBounded(allowedHandle, 64).bytes.length, 9); // OS accessibility is not policy acceptance
    await acl(allowed, 'remove');
    const parent = join(f.root, 'inherit-parent'); await f.directory(parent);
    await acl(parent, 'inherit-allow');
    const child = join(parent, 'child'); await f.directory(child);
    const parentHandle = keep(native.openDirectory(root, 'inherit-parent'));
    const childHandle = keep(native.openDirectory(parentHandle, 'child'));
    const inherited = native.inspect(childHandle);
    assert.ok(inherited.acl.entries.some(e => e.tag === 1 && Boolean(e.flags & 0x10)));
    assert.throws(() => acceptDarwinEvidence(inherited, 'directory', process.getuid!()), /unsupported-acl/);
    // Exact owned ACL fixtures only; no existing or production ancestor ACL changes.
    await acl(child, 'remove'); await acl(parent, 'remove');
    closeHandles(); await f.cleanup();
    cleanup.roots.push({ alias: 'acl-root', verdict: 'REMOVED', code: 'CLEAN' });
    Object.assign(aclCase, { status: 'PASS', code: 'CHECKED', facts: { localApfs: true, ownershipEnabled: true, noAcl: true,
      positive: true, denied: true, denyRecognized: true, allowRejected: true, inheritedAllowRejected: true } });
  } catch {
    try { closeHandles(); } catch { /* preserve */ }
    Object.assign(aclCase, { status: 'FAIL', code: 'CHECK_FAILED' }); cleanup.status = 'FAIL';
    if (f) cleanup.roots.push({ alias: 'acl-root', verdict: 'PRESERVED', code: 'UNCERTAIN' });
    return true;
  }

  let child: ChildProcess | undefined;
  let childClosed: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;
  let closed = false;
  f = undefined;
  try {
    f = await OwnedFixture.create('/private/tmp/agent-pet-p2b2-d61-lease-');
    const roots = { storageRoot: f.root, runtimeRoot: join(f.root, 'r') }; await f.directory(roots.runtimeRoot);
    await f.file(join(f.root, 'writer.lock'), '');
    const policy = await fixturePolicy(roots);
    const files = new PrivateFiles(await policy.openRoots(roots));
    await files.acquireOwner(); await f.track(join(f.root, 'owner'));
    child = fork(fileURLToPath(new URL('./bounded-lease-child.mjs', import.meta.url)), [f.root, 'hold'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] });
    childClosed = new Promise(resolve => child!.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
    await bounded(new Promise<void>((resolve, reject) => {
      child!.once('message', value => { if (value && typeof value === 'object' && 'state' in value && value.state === 'held') resolve(); else reject(new Error('D6_CHILD')); });
      child!.once('error', reject); child!.once('exit', () => reject(new Error('D6_CHILD')));
    }));
    const root = keep(native.openRoot(f.root));
    assert.throws(() => keep(native.acquireWriter(root)), { code: 'ownership-busy' });
    child.kill('SIGKILL');
    const ended = await bounded(childClosed); assert.equal(ended.signal, 'SIGKILL');
    const released = native.acquireWriter(root); native.close(released);
    await f.verify(join(f.root, 'writer.lock')); await f.verify(join(f.root, 'owner'));
    await assert.rejects(openManagedCore({ roots, policy, initialize: false, publish() {} }), /ownership-busy/);
    await f.verify(join(f.root, 'owner'));
    closeHandles();
    Object.assign(leaseCase, { status: 'PASS', code: 'CHECKED', facts: { leaseBusy: true, leaseReleased: true, ownerRetained: true, coreRefused: true } });
    // Successful crash probe intentionally leaves a durable barrier. No recovery or lease steal.
    cleanup.roots.push({ alias: 'lease-root', verdict: 'PRESERVED', code: 'BARRIER' });
    cleanup.status = 'BLOCKED';
  } catch {
    Object.assign(leaseCase, { status: 'FAIL', code: 'CHECK_FAILED' }); cleanup.status = 'FAIL';
    if (f) cleanup.roots.push({ alias: 'lease-root', verdict: 'PRESERVED', code: 'UNCERTAIN' });
  } finally {
    if (child && !closed) { child.kill('SIGKILL'); try { await bounded(childClosed!); } catch { cleanup.status = 'FAIL'; } }
    try { closeHandles(); } catch { cleanup.status = 'FAIL'; }
  }
  return true;
}
