import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { platform } from 'node:os';
import { beforeEach, expect, it, vi } from 'vitest';
import { readVolumeIdentity, samePersistedIdentity, withVolumeIdentity } from './durable-file-identity.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('node:fs', () => ({ lstatSync: vi.fn() }));
vi.mock('node:os', () => ({ platform: vi.fn() }));
const volumeId = '12345678-abcd-1234-abcd-123456789abc';
const stat = { dev: 1, ino: 2, birthtimeMs: 3, mode: 0o100600, uid: 501, gid: 20 };
const plist = (id: string) => `<?xml version="1.0"?><plist><dict><key>VolumeUUID</key><string>${id}</string></dict></plist>`;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(platform).mockReturnValue('darwin');
  vi.mocked(lstatSync).mockReturnValue({ ...stat, isSymbolicLink: () => false } as ReturnType<typeof lstatSync>);
  vi.mocked(execFileSync).mockImplementation(command => command === '/bin/df' ? 'Filesystem 512-blocks Used Available Capacity Mounted on\n/dev/disk3s1 100 20 80 20% /fixture\n' : plist(volumeId.toUpperCase()));
});

it('captures a normalized volume UUID using a bounded shell-free lookup', () => {
  expect(withVolumeIdentity('/fixture/file', stat)).toEqual({ ...stat, volumeId });
  expect(execFileSync).toHaveBeenCalledWith('/usr/sbin/diskutil', ['info', '-plist', '/dev/disk3s1'], {
    encoding: 'utf8', timeout: 2_000, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
});
it('accepts the same persisted object after a device number change', () => {
  vi.mocked(lstatSync).mockReturnValue({ ...stat, dev: 99, isSymbolicLink: () => false } as ReturnType<typeof lstatSync>);
  expect(samePersistedIdentity({ ...stat, volumeId }, { ...stat, dev: 99 }, '/fixture/file')).toBe(true);
});
it.each(['ino', 'birthtimeMs', 'mode', 'uid', 'gid'] as const)('rejects changed %s even on the same volume', key => {
  expect(samePersistedIdentity({ ...stat, volumeId }, { ...stat, [key]: stat[key] + 1 }, '/fixture/file')).toBe(false);
  expect(execFileSync).not.toHaveBeenCalled();
});
it('requires strict device identity for legacy receipts', () => {
  expect(samePersistedIdentity(stat, stat, '/fixture/file')).toBe(true);
  expect(samePersistedIdentity(stat, { ...stat, dev: 99 }, '/fixture/file')).toBe(false);
  expect(execFileSync).not.toHaveBeenCalled();
});
it('rejects a different volume even when all stat fields match', () => {
  vi.mocked(execFileSync).mockReturnValueOnce('header\n/dev/disk3s1 1 2 3 4 /fixture').mockReturnValueOnce(plist('87654321-abcd-1234-abcd-123456789abc'));
  expect(samePersistedIdentity({ ...stat, volumeId }, stat, '/fixture/file')).toBe(false);
});
it.each(['', plist('bad'), plist(volumeId) + plist(volumeId), '<key>DiskUUID</key><string>' + volumeId + '</string>'])('fails closed for missing or malformed volume evidence', value => {
  vi.mocked(execFileSync).mockImplementation(command => command === '/bin/df' ? 'header\n/dev/disk3s1 1 2 3 4 /fixture' : value);
  expect(readVolumeIdentity('/fixture/file')).toBeUndefined();
  expect(() => withVolumeIdentity('/fixture/file', stat)).toThrow('volume-identity-unavailable');
  expect(samePersistedIdentity({ ...stat, volumeId }, stat, '/fixture/file')).toBe(false);
});
it('fails closed when diskutil fails or times out', () => {
  vi.mocked(execFileSync).mockImplementation(() => { throw new Error('ETIMEDOUT'); });
  expect(samePersistedIdentity({ ...stat, volumeId }, stat, '/fixture/file')).toBe(false);
  expect(() => withVolumeIdentity('/fixture/file', stat)).toThrow('volume-identity-unavailable');
});
it('retains strict device fallback on other platforms', () => {
  vi.mocked(platform).mockReturnValue('linux');
  expect(withVolumeIdentity('/fixture/file', stat)).toEqual(stat);
  expect(samePersistedIdentity({ ...stat, volumeId }, stat, '/fixture/file')).toBe(false);
  expect(execFileSync).not.toHaveBeenCalled();
});

it('rejects a target changed during the volume lookup', () => {
  vi.mocked(lstatSync).mockReturnValueOnce({ ...stat, isSymbolicLink: () => false } as ReturnType<typeof lstatSync>).mockReturnValueOnce({ ...stat, ino: 99, isSymbolicLink: () => false } as ReturnType<typeof lstatSync>);
  expect(readVolumeIdentity('/fixture/file')).toBeUndefined();
});
it.each(['header\nserver:/share 1 2 3 4 /fixture', 'header\n/dev/disk3s1;bad 1 2 3 4 /fixture', 'header\n/dev/disk3s1 1 2 3 4 /fixture\nextra'])('rejects ambiguous or unsupported device output', output => {
  vi.mocked(execFileSync).mockReturnValue(output);
  expect(readVolumeIdentity('/fixture/file')).toBeUndefined();
  expect(execFileSync).toHaveBeenCalledTimes(1);
});
