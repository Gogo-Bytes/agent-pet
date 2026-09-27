import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from 'vitest';
import { fixture, cleanups } from '../test-helpers.js';
import { openWorkerManagedCore } from '../service.js';

test('B4.1 Worker Core cleans discovery and owner on start/stop', async () => {
  const f = await fixture();
  const service = await openWorkerManagedCore({ ...f, initialize: true, publish() {} });
  cleanups.push(() => service.stop().catch(() => {}));
  const target = await service.store.prepareTarget();
  await service.store.enableTarget(target.targetId, target.epoch, service.store.snapshot().revision);
  expect(service.store.current(target.targetId, target.epoch)).toBe(true);
  await service.store.revokeTarget(target.targetId, target.epoch, service.store.snapshot().revision);
  expect(service.store.current(target.targetId, target.epoch)).toBe(false);

  await service.start();
  await access(join(f.roots.storageRoot, 'discovery.json'));
  await service.stop();
  await expect(access(join(f.roots.storageRoot, 'discovery.json'))).rejects.toThrow();
  await expect(access(join(f.roots.storageRoot, 'owner'))).rejects.toThrow();
});
