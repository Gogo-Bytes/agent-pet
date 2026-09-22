import { expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from './test-helpers.js';
import { fixturePolicy } from './test-policy.js';
import { openManagedCore } from './service.js';
import { parseRegistry } from './auth-store.js';

// This environment switch belongs only to a subprocess TEST, not any production/core entry.
const crashFixture = process.env.AGENT_PET_SYNTHETIC_CRASH_ROOT;
if (crashFixture) {
  test('crash worker', async () => {
    const roots = { storageRoot: join(crashFixture, 'd'), runtimeRoot: join(crashFixture, 'r') };
    const policy = await fixturePolicy(roots); let armed = false;
    const service = await openManagedCore({ roots, policy, initialize: true, publish() {}, fault: async (boundary, operation) => {
      if (armed && boundary === 'directory-sync' && operation === 'authority-write') {
        await writeFile(join(crashFixture, 'crash-ready'), 'revoked rename visible; directory fsync not reached', { mode: 0o600 });
        process.kill(process.pid, 'SIGKILL');
        await new Promise(() => {});
      }
    } });
    const target = await service.store.prepareTarget();
    await service.store.enableTarget(target.targetId, 1, service.store.snapshot().revision);
    await service.start(); armed = true;
    await service.store.revokeTarget(target.targetId, 1, service.store.snapshot().revision);
    throw new Error('crash boundary not reached');
  });
} else {
  test('actual killed worker after revoke rename leaves durable claim and refuses fresh-process admission', async () => {
    const f = await fixture();
    const child = spawn(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run',
      'packages/adapter-pi/src/managed/crash.test.ts', '--testNamePattern=^crash worker$', '--maxWorkers=1', '--no-file-parallelism'],
    { env: { ...process.env, AGENT_PET_SYNTHETIC_CRASH_ROOT: f.base }, stdio: 'ignore' });
    const result = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('crash infrastructure timeout')); }, 20000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); resolve(code); });
    });
    expect(result).not.toBe(0);
    await access(join(f.base, 'crash-ready'));
    await access(join(f.roots.storageRoot, 'owner'));
    const disk = parseRegistry(JSON.parse(await readFile(join(f.roots.storageRoot, 'authorization.json'), 'utf8')));
    expect(disk.targets[0]).toMatchObject({ state: 'revoked', epoch: 2 });
    await expect(openManagedCore({ ...f, initialize: false, publish() {} })).rejects.toThrow('ownership-busy');
    // Visible rename is NOT a sudden-power-loss durability claim; barrier is authoritative for refusal.
  }, 30000);
}
