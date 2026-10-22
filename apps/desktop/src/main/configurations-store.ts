import * as fs from 'node:fs';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import { configurationProviders, type ConfigurationMetadata } from '../shared/configurations.js';
import { sameIdentity } from './pi-connection-store.js';
import { saveStat, type SavedStat } from './pi-temp-deployment.js';
import { PET_ASSET_ID } from '../shared/pet-assets.js';

export const MAX_CONFIGURATIONS = 64;
const MAX_BYTES = 128 * 1024;
export function configurationName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length > 0 && Array.from(name).length <= 40 && !/[\u0000-\u001f\u007f]/.test(name) ? name : null;
}
export function configurationPath(value: unknown): string | null {
  return typeof value === 'string' && isAbsolute(value) && !value.includes('\0') && Buffer.byteLength(value) <= 4096 &&
    value.split('/').length <= 32 && dirname(normalize(value)) !== normalize(value) ? normalize(value) : null;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function validMetadata(value: unknown): value is ConfigurationMetadata {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'id,installation,name,pet,provider,targetPath' ||
      typeof value.id !== 'string' || !/^(legacy-pi|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/.test(value.id) ||
      configurationName(value.name) !== value.name || !configurationProviders.includes(value.provider as never) ||
      (value.id === 'legacy-pi' && value.provider !== 'pi') ||
      configurationPath(value.targetPath) !== value.targetPath || (value.pet !== null && (!object(value.pet) ||
      Object.keys(value.pet).sort().join(',') !== 'assetId,name' || typeof value.pet.assetId !== 'string' || !PET_ASSET_ID.test(value.pet.assetId) ||
      configurationName(value.pet.name) !== value.pet.name))) return false;
  if (value.installation === null) return true;
  const installation = value.installation;
  return object(installation) && Object.keys(installation).sort().join(',') === 'compatibility,id,path,version' &&
    typeof installation.id === 'string' && installation.id.length <= 80 && configurationPath(installation.path) === installation.path &&
    ['verified-0.85.1', 'unverified'].includes(String(installation.compatibility)) &&
    (installation.version === null || (typeof installation.version === 'string' && installation.version.length <= 80));
}
function validRecords(value: unknown): value is ConfigurationMetadata[] {
  if (!Array.isArray(value) || value.length > MAX_CONFIGURATIONS || !value.every(validMetadata)) return false;
  return new Set(value.map(record => record.id)).size === value.length &&
    new Set(value.map(record => `${record.provider}:${record.targetPath}`)).size === value.length;
}
function absent(path: string): boolean {
  try { fs.lstatSync(path); return false; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
}
function sameFile(left: SavedStat, right: fs.Stats): boolean {
  return sameIdentity(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.nlink === right.nlink;
}

/** Main-only bounded non-secret metadata. Unknown/edited/pending files fail closed and are preserved. */
export class ConfigurationsStore {
  readonly directory: string;
  private readonly path: string;
  private readonly pending: string;
  private directoryStat: SavedStat;
  private fileStat?: SavedStat;
  private records: ConfigurationMetadata[] = [];
  error = false;
  constructor(userData: string) {
    this.directory = userData;
    this.path = join(userData, 'configurations.json');
    this.pending = join(userData, 'configurations.pending.json');
    this.directoryStat = {} as SavedStat;
    let fd: number | undefined;
    try {
      this.checkParents();
      this.directoryStat = saveStat(fs.lstatSync(userData));
      if (!absent(this.pending)) throw new Error();
      if (absent(this.path)) return;
      const before = this.privateFile(this.path);
      fd = fs.openSync(this.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      if (!sameFile(saveStat(before), fs.fstatSync(fd))) throw new Error();
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let count = 0;
      while (count < buffer.length) {
        const size = fs.readSync(fd, buffer, count, buffer.length - count, count);
        if (!size) break;
        count += size;
      }
      if (count > MAX_BYTES || !sameFile(saveStat(before), fs.fstatSync(fd)) || !sameFile(saveStat(before), fs.lstatSync(this.path))) throw new Error();
      const value: unknown = JSON.parse(buffer.subarray(0, count).toString('utf8'));
      if (!object(value) || Object.keys(value).sort().join(',') !== 'records,version' || value.version !== 1 || !validRecords(value.records)) throw new Error();
      this.records = value.records; this.fileStat = saveStat(before);
    } catch { this.error = true; }
    finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { this.error = true; } } }
  }
  private checkParents(): void {
    if (!configurationPath(this.directory) || normalize(this.directory) !== this.directory) throw new Error();
    let path = '/';
    for (const part of this.directory.split('/').filter(Boolean)) {
      path = join(path, part); const stat = fs.lstatSync(path);
      const sticky = stat.uid === 0 && !!(stat.mode & 0o1000);
      if (!stat.isDirectory() || (stat.uid !== process.getuid?.() && stat.uid !== 0) || ((stat.mode & 0o022) && !sticky)) throw new Error();
    }
    const stat = fs.lstatSync(this.directory);
    if (stat.uid !== process.getuid?.() || (stat.mode & 0o700) !== 0o700) throw new Error();
  }
  private privateFile(path: string): fs.Stats {
    const stat = fs.lstatSync(path);
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || (stat.mode & 0o7777) !== 0o600 || stat.size > MAX_BYTES) throw new Error();
    return stat;
  }
  snapshot(): ConfigurationMetadata[] { return structuredClone(this.records); }
  save(records: ConfigurationMetadata[]): boolean {
    if (this.error) return false;
    let fd: number | undefined;
    try {
      if (!validRecords(records)) throw new Error();
      this.checkParents();
      if (!sameIdentity(this.directoryStat, fs.lstatSync(this.directory)) || !absent(this.pending) ||
          (this.fileStat ? !sameFile(this.fileStat, this.privateFile(this.path)) : !absent(this.path))) throw new Error();
      const text = JSON.stringify({ version: 1, records }) + '\n';
      if (Buffer.byteLength(text) > MAX_BYTES) throw new Error();
      fd = fs.openSync(this.pending, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      fs.writeFileSync(fd, text); fs.fsyncSync(fd);
      const pendingStat = saveStat(fs.fstatSync(fd));
      fs.closeSync(fd); fd = undefined;
      if (!sameIdentity(this.directoryStat, fs.lstatSync(this.directory)) || !sameFile(pendingStat, this.privateFile(this.pending)) ||
          (this.fileStat ? !sameFile(this.fileStat, this.privateFile(this.path)) : !absent(this.path))) throw new Error();
      fs.renameSync(this.pending, this.path);
      this.fileStat = saveStat(this.privateFile(this.path));
      if (!sameIdentity(pendingStat, this.fileStat)) throw new Error();
      this.records = structuredClone(records); return true;
    } catch { this.error = true; return false; }
    finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { this.error = true; } } }
  }
}
