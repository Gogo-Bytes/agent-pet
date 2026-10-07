import { afterEach, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { access, unlink } from 'node:fs/promises';
import { fork, spawnSync } from 'node:child_process';
import { loadDarwinPrimitives, type DarwinEvidence, type NativeHandle } from '../native-darwin.js';
import { fixturePolicy } from '../test-policy.js';
import { PrivateFiles } from '../private-files.js';
import { openManagedCore } from '../service.js';
import { OwnedFixture } from './fixtures.js';
import { runNativeControls } from './native-controls.js';
import { caseIds, exitCode, type CaseEvidence, type Cleanup } from './evidence.js';

vi.mock('node:fs/promises', () => ({ access: vi.fn(), unlink: vi.fn() }));
vi.mock('node:child_process', () => ({ fork: vi.fn(), spawnSync: vi.fn() }));
vi.mock('../native-darwin.js', () => ({ loadDarwinPrimitives: vi.fn() }));
vi.mock('../test-policy.js', () => ({ fixturePolicy: vi.fn() }));
vi.mock('../private-files.js', () => ({ PrivateFiles: vi.fn() }));
vi.mock('../service.js', () => ({ openManagedCore: vi.fn() }));
vi.mock('./fixtures.js', async importOriginal => ({
  ...await importOriginal<typeof import('./fixtures.js')>(), OwnedFixture: { create: vi.fn() },
}));

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const getuid = Object.getOwnPropertyDescriptor(process, 'getuid');
afterEach(() => {
  Object.defineProperty(process, 'platform', platform);
  if (getuid) Object.defineProperty(process, 'getuid', getuid);
  else Reflect.deleteProperty(process, 'getuid');
  vi.restoreAllMocks(); vi.resetAllMocks();
});

// Controlled harness doubles only: no native fault injection, child process or disk fixtures.
// Invoke the real runNativeControls assertion/catch/finally, not a duplicate cleanup helper.
test.each([false, true])('D6 unexpected successful contention probe closes once and preserves FAIL (close throws=%s)', async closeThrows => {
  Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' });
  Object.defineProperty(process, 'getuid', { configurable: true, value: () => 501 });
  const fixture = (root: string) => ({ root, directory: vi.fn(), file: vi.fn(), track: vi.fn(), verify: vi.fn(), cleanup: vi.fn() });
  const aclFixture = fixture('/synthetic/acl');
  const leaseFixture = fixture('/synthetic/lease');
  vi.mocked(OwnedFixture.create).mockResolvedValueOnce(aclFixture as unknown as OwnedFixture)
    .mockResolvedValueOnce(leaseFixture as unknown as OwnedFixture);
  vi.mocked(access).mockResolvedValue(undefined);
  vi.mocked(unlink).mockResolvedValueOnce(undefined).mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EPERM' }));
  vi.mocked(spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);
  vi.mocked(fixturePolicy).mockResolvedValue({ openRoots: vi.fn() } as unknown as Awaited<ReturnType<typeof fixturePolicy>>);
  const acquireOwner = vi.fn();
  vi.mocked(PrivateFiles).mockImplementation(() => ({ acquireOwner }) as unknown as PrivateFiles);

  const child = new EventEmitter();
  const kill = vi.fn(() => { child.emit('close', null, 'SIGKILL'); return true; });
  vi.mocked(fork).mockImplementation(() => {
    queueMicrotask(() => child.emit('message', { state: 'held' }));
    return Object.assign(child, { kill }) as unknown as ReturnType<typeof fork>;
  });
  const handle = () => ({}) as NativeHandle;
  const aclRoot = handle(), leaseRoot = handle(), writer = handle();
  const evidence = (mode: number, entries: DarwinEvidence['acl']['entries'] = []): DarwinEvidence => ({
    dev: 1n, ino: 1n, uid: 501, gid: 20, mode, nlink: 1n, size: 9n,
    mtimeNs: 1n, ctimeNs: 1n, filesystem: 'apfs', mountFlags: 0x1000, fsid0: 1, fsid1: 1,
    acl: { state: entries.length ? 'present' : 'absent', flags: 0, entries },
  });
  const inspect = vi.fn().mockReturnValueOnce(evidence(0o40700))
    .mockReturnValueOnce(evidence(0o100600, [{ tag: 2, permissions: 16n, flags: 0, principal: '0'.repeat(32) }]))
    .mockReturnValueOnce(evidence(0o100600, [{ tag: 1, permissions: 2n, flags: 0, principal: '0'.repeat(32) }]))
    .mockReturnValueOnce(evidence(0o40700, [{ tag: 1, permissions: 2n, flags: 0x10, principal: '0'.repeat(32) }]));
  const acquireWriter = vi.fn(() => writer); // Unexpected success, independent of scheduling.
  const close = vi.fn((h: NativeHandle) => { if (h === writer && closeThrows) throw new Error('uncertain-close'); });
  vi.mocked(loadDarwinPrimitives).mockReturnValue({ version: 1, napi: 8,
    openRoot: vi.fn().mockReturnValueOnce(aclRoot).mockReturnValueOnce(leaseRoot),
    openFile: vi.fn(handle), openDirectory: vi.fn(handle), inspect, ancestors: vi.fn(),
    readBounded: vi.fn().mockReturnValue({ bytes: Buffer.from('synthetic') }), acquireWriter, close,
  });
  const cases: CaseEvidence[] = caseIds.map(id => ({ id, status: 'NOT-RUN', code: 'PREREQUISITE', fixtureOnly: true, facts: {} }));
  const cleanup: Cleanup = { schema: 1, status: 'NOT-RUN', roots: [] };

  expect(await runNativeControls(cases, cleanup)).toBe(true);

  expect(cases.find(c => c.id === 'native-acl')?.status).toBe('PASS');
  expect(cases.find(c => c.id === 'native-lease-owner')).toMatchObject({ status: 'FAIL', code: 'CHECK_FAILED', facts: {} });
  expect(cleanup).toEqual({ schema: 1, status: 'FAIL', roots: [
    { alias: 'acl-root', verdict: 'REMOVED', code: 'CLEAN' },
    { alias: 'lease-root', verdict: 'PRESERVED', code: 'UNCERTAIN' },
  ] });
  expect(exitCode(cases, cleanup)).toBe(1);
  expect(acquireWriter).toHaveBeenCalledExactlyOnceWith(leaseRoot);
  expect(close.mock.calls.filter(([h]) => h === writer)).toEqual([[writer]]);
  expect(close.mock.calls.filter(([h]) => h === leaseRoot)).toEqual([[leaseRoot]]);
  expect(close.mock.calls.slice(-2)).toEqual([[writer], [leaseRoot]]);
  expect(kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
  expect(child.listenerCount('close')).toBe(0);
  expect(acquireOwner).toHaveBeenCalledTimes(1);
  expect(leaseFixture.track).toHaveBeenCalledExactlyOnceWith('/synthetic/lease/owner');
  expect(leaseFixture.cleanup).not.toHaveBeenCalled();
  expect(aclFixture.cleanup).toHaveBeenCalledTimes(1);
  expect(openManagedCore).not.toHaveBeenCalled();
});
