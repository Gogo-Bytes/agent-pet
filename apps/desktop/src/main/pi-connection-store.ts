import * as fs from 'node:fs';
import { hostname } from 'node:os';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import type { PiBridgeConfig } from './pi-config.js';
import { saveStat, type SavedOwnership, type SavedStat } from './pi-temp-deployment.js';

export type SavedConnection = { target: string; config: PiBridgeConfig; runtime: SavedStat;
  ownership: SavedOwnership; disabled: boolean };
type RecordValue = { version: 1; host: string; uid: number; directory: SavedStat; connection: SavedConnection | null };
const MAX_BYTES = 16384;
const keys = (v: unknown, names: string): v is Record<string, unknown> => !!v && typeof v === 'object' &&
  !Array.isArray(v) && Object.keys(v).sort().join(',') === names.split(',').sort().join(',');
const uid = () => { if (!process.getuid) throw new Error(); return process.getuid(); };
export const sameIdentity = (a: SavedStat, b: SavedStat) => a.dev === b.dev && a.ino === b.ino &&
  a.birthtimeMs === b.birthtimeMs && a.mode === b.mode && a.uid === b.uid && a.gid === b.gid;
const sameFile = (a: SavedStat, b: SavedStat) => sameIdentity(a, b) && a.size === b.size && a.nlink === b.nlink &&
  a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
function validStat(v: unknown, kind: 'file' | 'directory'): v is SavedStat {
  if (!keys(v, 'dev,ino,birthtimeMs,mode,uid,gid,size,nlink,mtimeMs,ctimeMs') ||
    !Object.values(v).every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return false;
  const s = v as SavedStat;
  if (![s.dev, s.ino, s.mode, s.uid, s.gid, s.size, s.nlink].every(Number.isSafeInteger)) return false;
  return s.uid === uid() && (s.mode & 0o7777) === (kind === 'file' ? 0o600 : 0o700) &&
    (s.mode & fs.constants.S_IFMT) === (kind === 'file' ? fs.constants.S_IFREG : fs.constants.S_IFDIR) &&
    (kind !== 'file' || (s.nlink === 1 && s.size <= 65536));
}
function validConnection(v: unknown): v is SavedConnection {
  if (!keys(v, 'target,config,runtime,ownership,disabled') || typeof v.disabled !== 'boolean' ||
    typeof v.target !== 'string' || !isAbsolute(v.target) || normalize(v.target) !== v.target ||
    dirname(v.target) === v.target || Buffer.byteLength(v.target) > 4096 || v.target.includes('\0') ||
    v.target.split('/').length > 32 || !keys(v.config, 'endpoint,token') ||
    typeof v.config.endpoint !== 'string' || !/^\/tmp\/ap-[a-f0-9]{24}\/p\.sock$/.test(v.config.endpoint) ||
    typeof v.config.token !== 'string' || !/^[a-f0-9]{64}$/.test(v.config.token) || !validStat(v.runtime, 'directory') ||
    !keys(v.ownership, 'digest,file,directories') || typeof v.ownership.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.ownership.digest) || !validStat(v.ownership.file, 'file') ||
    !Array.isArray(v.ownership.directories) || v.ownership.directories.length > 2) return false;
  const allowed = [v.target, join(v.target, 'extensions')];
  let last = -1;
  return v.ownership.directories.every(entry => {
    if (!Array.isArray(entry) || entry.length !== 2 || !validStat(entry[1], 'directory')) return false;
    const index = allowed.indexOf(entry[0]);
    if (index <= last) return false;
    last = index; return true;
  });
}
function privateStat(path: string, kind: 'file' | 'directory'): fs.Stats {
  const s = fs.lstatSync(path);
  if (!validStat(saveStat(s), kind)) throw new Error();
  return s;
}
function absent(path: string): boolean {
  try { fs.lstatSync(path); return false; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return true; throw e; }
}

function validateParents(path: string): void {
  if (!isAbsolute(path) || normalize(path) !== path || path.includes('\0') || Buffer.byteLength(path) > 4096 || path.split('/').length > 32) throw new Error();
  let current = '/';
  for (const part of path.split('/').filter(Boolean)) {
    current = join(current, part);
    const s = fs.lstatSync(current);
    const sticky = s.uid === 0 && (s.mode & 0o1000) !== 0;
    if (!s.isDirectory() || (s.uid !== uid() && s.uid !== 0) || ((s.mode & 0o022) && !sticky)) throw new Error();
  }
}

/** Fixed Main-owned metadata only. No target/runtime reads on startup; never repairs unknown data.
 * Atomic clean-restart publication, not crash recovery or same-UID attacker isolation.
 */
export class PiConnectionStore {
  private readonly directory: string;
  private readonly path: string;
  private readonly pendingPath: string;
  private directoryStat: SavedStat | undefined;
  private fileStat: SavedStat | undefined;
  private value: SavedConnection | null = null;
  error = false;
  constructor(userData: string) {
    this.directory = join(userData, 'pi-connection');
    this.path = join(this.directory, 'connection.json');
    this.pendingPath = join(this.directory, 'pending.json');
    let fd: number | undefined;
    try {
      validateParents(userData);
      if (absent(this.directory)) return;
      this.directoryStat = saveStat(privateStat(this.directory, 'directory'));
      // An interrupted/uncertain write is visible, never silently repaired or wiped.
      if (!absent(this.pendingPath)) throw new Error();
      const before = privateStat(this.path, 'file');
      if (before.size > MAX_BYTES) throw new Error();
      fd = fs.openSync(this.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      if (!sameFile(before, fs.fstatSync(fd))) throw new Error();
      const bytes = Buffer.alloc(MAX_BYTES + 1);
      let count = 0;
      while (count < bytes.length) {
        const read = fs.readSync(fd, bytes, count, bytes.length - count, count);
        if (!read) break;
        count += read;
      }
      if (count > MAX_BYTES || !sameFile(before, fs.fstatSync(fd)) || !sameFile(before, fs.lstatSync(this.path))) throw new Error();
      const v: unknown = JSON.parse(bytes.subarray(0, count).toString('utf8'));
      if (!keys(v, 'version,host,uid,directory,connection') || v.version !== 1 || v.host !== hostname() || v.uid !== uid() ||
        !validStat(v.directory, 'directory') || !sameIdentity(v.directory, this.directoryStat) ||
        (v.connection !== null && !validConnection(v.connection))) throw new Error();
      fs.closeSync(fd); fd = undefined;
      this.value = v.connection as SavedConnection | null; this.fileStat = saveStat(before);
    } catch { this.error = true; }
    finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { this.error = true; } } }
  }
  snapshot(): SavedConnection | null { return structuredClone(this.value); }
  save(connection: SavedConnection | null): boolean {
    if (this.error) return false;
    let fd: number | undefined;
    try {
      validateParents(dirname(this.directory));
      if (connection !== null && !validConnection(connection)) throw new Error();
      if (!this.directoryStat) {
        fs.mkdirSync(this.directory, { mode: 0o700 }); // no recursive mkdir or adoption
        this.directoryStat = saveStat(privateStat(this.directory, 'directory'));
      }
      if (!sameIdentity(this.directoryStat, privateStat(this.directory, 'directory')) || !absent(this.pendingPath)) throw new Error();
      if (this.fileStat ? !sameFile(this.fileStat, privateStat(this.path, 'file')) : !absent(this.path)) throw new Error();
      const record: RecordValue = { version: 1, host: hostname(), uid: uid(), directory: this.directoryStat, connection };
      const text = JSON.stringify(record) + '\n';
      if (Buffer.byteLength(text) > MAX_BYTES) throw new Error();
      fd = fs.openSync(this.pendingPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      fs.writeFileSync(fd, text); fs.fsyncSync(fd);
      const next = fs.fstatSync(fd);
      if (!validStat(saveStat(next), 'file')) throw new Error();
      fs.closeSync(fd); fd = undefined;
      if (!sameIdentity(this.directoryStat, privateStat(this.directory, 'directory')) ||
        !sameFile(next, privateStat(this.pendingPath, 'file')) ||
        (this.fileStat ? !sameFile(this.fileStat, privateStat(this.path, 'file')) : !absent(this.path))) throw new Error();
      fs.renameSync(this.pendingPath, this.path);
      this.fileStat = saveStat(privateStat(this.path, 'file'));
      if (!sameIdentity(next, this.fileStat)) throw new Error();
      this.value = structuredClone(connection); return true;
    } catch { this.error = true; return false; }
    finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { this.error = true; } } }
  }
}
