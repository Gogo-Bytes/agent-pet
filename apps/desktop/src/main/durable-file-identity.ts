import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { platform } from 'node:os';

export interface DurableFileIdentity {
  dev: number;
  ino: number;
  birthtimeMs: number;
  mode: number;
  uid: number;
  gid: number;
  volumeId?: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lookup failures are intentionally not replaced by a device-number guess. */
export function readVolumeIdentity(path: string, expected?: DurableFileIdentity): string | undefined {
  if (platform() !== 'darwin') return undefined;
  try {
    const before = lstatSync(path);
    if (before.isSymbolicLink() || (expected && !sameLiveIdentity(expected, before))) return undefined;
    const output = execFileSync('/bin/df', ['-P', path], {
      encoding: 'utf8', timeout: 2_000, maxBuffer: 64 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = output.trim().split(/\r?\n/);
    const device = lines.length === 2 ? lines[1]?.trim().split(/\s+/)[0] : undefined;
    if (!device || !/^\/dev\/disk[0-9]+(?:s[0-9]+)*$/.test(device)) return undefined;
    const plist = execFileSync('/usr/sbin/diskutil', ['info', '-plist', device], {
      encoding: 'utf8', timeout: 2_000, maxBuffer: 64 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const matches = [...plist.matchAll(/<key>VolumeUUID<\/key>\s*<string>([^<]*)<\/string>/g)];
    const value = matches.length === 1 ? matches[0]?.[1] : undefined;
    const after = lstatSync(path);
    if (after.isSymbolicLink() || !sameLiveIdentity(before, after)) return undefined;
    return value && uuid.test(value) ? value.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

/** Capture only for persisted receipts; live descriptor checks must still compare dev. */
export function withVolumeIdentity<T extends DurableFileIdentity>(path: string, stat: T): T & { volumeId?: string } {
  const volumeId = readVolumeIdentity(path, stat);
  if (platform() === 'darwin' && volumeId === undefined) throw new Error('volume-identity-unavailable');
  return volumeId === undefined ? { ...stat } : { ...stat, volumeId };
}

export function samePersistedIdentity(saved: DurableFileIdentity, current: DurableFileIdentity, path: string): boolean {
  if (saved.ino !== current.ino || saved.birthtimeMs !== current.birthtimeMs || saved.mode !== current.mode
    || saved.uid !== current.uid || saved.gid !== current.gid) return false;
  if (saved.volumeId === undefined) return saved.dev === current.dev;
  return uuid.test(saved.volumeId) && readVolumeIdentity(path, current) === saved.volumeId.toLowerCase();
}

function sameLiveIdentity(left: DurableFileIdentity, right: DurableFileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.birthtimeMs === right.birthtimeMs
    && left.mode === right.mode && left.uid === right.uid && left.gid === right.gid;
}
