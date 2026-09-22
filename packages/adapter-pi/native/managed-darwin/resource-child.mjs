// Isolated test process: resource counts concern this addon's descriptors, not an OS-wide budget.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, chmodSync, writeFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const n = createRequire(import.meta.url)('./out/managed-darwin.node');
const path = mkdtempSync('/private/tmp/agent-pet-native-resources-');
chmodSync(path, 0o700);
writeFileSync(join(path, 'payload'), 'synthetic', { mode: 0o600 });
const count = () => readdirSync('/dev/fd').length;
// Warm Node's output before measuring fd deltas; do not open/read the listed descriptors.
console.log(`resource scenario: ${process.argv[2]}`);
const before = count();
const handles = [];
try {
  if (process.argv[2] === 'historical') {
    const root = n.openRoot(path); handles.push(root);
    const pinned = count();
    for (let i = 0; i < 600; i++) {
      const file = n.openFile(root, 'payload'); handles.push(file);
      n.close(file); n.close(file);
      assert.equal(count(), pinned, 'explicit close must return its descriptor exactly once');
    }
    console.log('600 explicit open/close cycles without GC; wrappers deliberately retained');
  } else if (process.argv[2] === 'descriptors') {
    const root = n.openRoot(path); handles.push(root);
    const depth = n.ancestors(root).length + 1;
    assert.equal(count() - before, depth, 'root alias must not double-count its last segment');
    let refusal;
    for (let i = 1; i < 256; i++) {
      try { handles.push(n.openRoot(path)); } catch (error) { refusal = error.code; break; }
      if (count() - before > 256) break;
    }
    console.log(`owned descriptor delta=${count() - before}, root handles=${handles.length}, depth=${depth}`);
    assert.ok(count() - before <= 256, '256 wrappers do not bound retained ancestor descriptors to 256');
    assert.equal(refusal, 'descriptor-limit');
    assert.equal(count() - before, 256);
    n.close(handles.at(-1)); n.close(handles.at(-1));
    assert.throws(() => n.inspect(handles.at(-1)), { code: 'closed-handle' });
    for (let i = 0; i < depth - 2; i++) handles.push(n.openFile(root, 'payload'));
    const partial = count();
    assert.equal(partial - before, 254);
    // A root walk consumes the last two slots, then must undo both on refusal.
    for (let i = 0; i < 300; i++) {
      assert.throws(() => n.openRoot(path), { code: 'descriptor-limit' });
      assert.equal(count(), partial, 'failed partial root walk must return all of its descriptors');
    }
    handles.push(n.openFile(root, 'payload'), n.openFile(root, 'payload'));
    assert.equal(count() - before, 256);
    assert.throws(() => n.openFile(root, 'payload'), { code: 'descriptor-limit' });
    console.log('exact ceiling, idempotent close, partial-walk rollback and capacity recovery');
  } else if (process.argv[2] === 'failed-opens') {
    const root = n.openRoot(path); handles.push(root);
    const file = n.openFile(root, 'payload'); handles.push(file);
    mkdirSync(join(path, 'directory'), { mode: 0o700 });
    const pinned = count();
    for (let i = 0; i < 600; i++) {
      assert.throws(() => n.openRoot(`${path}/directory/missing`), { code: 'native-open' });
      assert.throws(() => n.openRoot(`${path}/directory/..`), { code: 'invalid-argument' });
      assert.throws(() => n.openFile(root, 'missing'), { code: 'native-open' });
      assert.throws(() => n.openFile(root, 'directory'), { code: 'unsafe-object' });
      assert.throws(() => n.openFile(file, 'payload'), { code: 'path-changed' });
      assert.throws(() => n.openFile(root, '../payload'), { code: 'invalid-argument' });
      assert.throws(() => n.openFile({}, 'payload'), { code: 'invalid-handle' });
      assert.equal(count(), pinned, 'failed calls must not leak descriptors');
    }
    let deep = path;
    for (let i = 0; i < 65; i++) { deep = join(deep, 'd'); mkdirSync(deep, { mode: 0o700 }); }
    assert.throws(() => n.openRoot(deep), { code: 'invalid-argument' });
    assert.equal(count(), pinned, 'segment-limit failure must release the entire partial walk');
    // Thousands of failed allocations did not consume the wrapper budget either.
    handles.push(n.openFile(root, 'payload'));
    console.log('4200 failed root/child/argument calls: no descriptor leaks or lost wrapper capacity');
  } else if (process.argv[2] === 'wrappers') {
    const root = n.openRoot(path); handles.push(root);
    const pinned = count();
    // Keep every wrapper reachable: no implicit or explicit GC can reclaim them.
    for (let i = 1; i < 4096; i++) {
      const file = n.openFile(root, 'payload'); handles.push(file); n.close(file);
    }
    assert.equal(count(), pinned);
    assert.throws(() => n.openFile(root, 'payload'), { code: 'wrapper-limit' });
    assert.equal(count(), pinned, 'wrapper refusal must occur before opening descriptors');
    handles.splice(1);
    for (let i = 0; i < 5; i++) { await new Promise(setImmediate); global.gc(); }
    await new Promise(setImmediate);
    // Finalizing already closed wrappers must not free capacity a second time.
    const depth = n.ancestors(root).length + 1;
    for (let i = depth; i < 256; i++) handles.push(n.openFile(root, 'payload'));
    assert.equal(count() - before, 256);
    assert.throws(() => n.openFile(root, 'payload'), { code: 'descriptor-limit' });
    console.log('4096-wrapper ceiling, GC recovery, no double decrement after explicit close');
  } else if (process.argv[2] === 'ordinary-gc') {
    const root = n.openRoot(path); handles.push(root);
    const pinned = count();
    for (let i = 0; i < 200; i++) handles.push(n.openFile(root, 'payload'));
    assert.equal(count(), pinned + 200);
    handles.splice(1);
    for (let i = 0; i < 5; i++) { await new Promise(setImmediate); global.gc(); }
    await new Promise(setImmediate);
    assert.equal(count(), pinned, 'GC must release ordinary unclosed handles');
    const file = n.openFile(root, 'payload'); handles.push(file);
    n.close(root);
    assert.equal(count() - before, 1, 'closed parent must not uncount an open descendant');
    assert.throws(() => n.inspect(file), { code: 'path-changed' });
    console.log('ordinary GC returns descriptor capacity; root close retains descendant accounting');
  } else if (process.argv[2] === 'lease') {
    writeFileSync(join(path, 'writer.lock'), '', { mode: 0o600 });
    const root = n.openRoot(path); handles.push(root);
    const depth = n.ancestors(root).length + 1;
    const lease = n.acquireWriter(root); handles.push(lease);
    assert.equal(count() - before, depth + 1, 'lease owns exactly one additional descriptor');
    for (let i = 0; i < 600; i++) {
      assert.throws(() => n.acquireWriter(root), { code: 'ownership-busy' });
      assert.equal(count() - before, depth + 1, 'failed flock must close its independent descriptor');
    }
    n.close(root); n.close(root);
    assert.equal(count() - before, 1, 'root close must not release or uncount the lease');
    assert.throws(() => n.inspect(lease), { code: 'path-changed' });
    n.close(lease); n.close(lease);
    assert.equal(count(), before);
    console.log('lease fd counted once; 600 failed flocks cleaned; root close retains lease fd');
  } else {
    throw new Error('unknown resource scenario');
  }
} finally {
  try {
    for (const h of handles.reverse()) n.close(h);
    assert.equal(count(), before, 'all owned descriptors returned after explicit close');
  } finally { rmSync(path, { recursive: true, force: true }); }
}
