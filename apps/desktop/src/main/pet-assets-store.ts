import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, normalize } from 'node:path';
import { starterPetAsset, validPetAssetsState, type PetAsset, type PetAssetsState } from '../shared/pet-assets.js';

const MAX_BYTES = 128 * 1024;
const objectMode = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;

function privateDirectory(path: string): void {
  const stat = fs.lstatSync(path);
  if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o700) !== 0o700 || (stat.mode & 0o077) !== 0) throw new Error('unsafe pet asset directory');
}
function privateFile(path: string): fs.Stats {
  const stat = fs.lstatSync(path);
  if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || (stat.mode & 0o7777) !== 0o600 || stat.size > MAX_BYTES) throw new Error('unsafe pet asset registry');
  return stat;
}
function absent(path: string): boolean {
  try { fs.lstatSync(path); return false; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
}

/** Main-only registry metadata. Imported model files will live beside this record in a later stage. */
export class PetAssetsStore {
  readonly directory: string;
  private readonly path: string;
  private readonly pending: string;
  private fileStat?: fs.Stats;
  private records: PetAsset[] = [];
  error = false;

  constructor(userData: string) {
    this.directory = join(userData, 'pet-assets');
    this.path = join(this.directory, 'registry.json');
    this.pending = join(this.directory, 'registry.pending.json');
    try {
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      privateDirectory(this.directory);
      if (!absent(this.pending)) throw new Error('pending pet asset registry');
      if (absent(this.path)) return;
      const before = privateFile(this.path);
      const fd = fs.openSync(this.path, objectMode);
      try {
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
        if (count > MAX_BYTES || before.size !== fs.fstatSync(fd).size || before.mtimeMs !== fs.fstatSync(fd).mtimeMs) throw new Error('changed pet asset registry');
        const value: unknown = JSON.parse(buffer.subarray(0, count).toString('utf8'));
        if (!validPetAssetsState(value)) throw new Error('invalid pet asset registry');
        this.records = value.records;
      } finally { fs.closeSync(fd); }
      this.fileStat = privateFile(this.path);
    } catch { this.error = true; }
  }

  snapshot(): PetAssetsState {
    return { version: 1, records: [structuredClone(starterPetAsset), ...structuredClone(this.records)] };
  }

  saveImported(asset: PetAsset): boolean {
    if (this.error || asset.source !== 'imported' || asset.importedAt === null || asset.id === 'starter' || this.records.some(record => record.id === asset.id)) return false;
    const records = [...this.records, structuredClone(asset)];
    if (!validPetAssetsState({ version: 1, records })) return false;
    return this.save(records);
  }

  removeImported(id: string): boolean {
    if (this.error || id === 'starter' || !this.records.some(record => record.id === id)) return false;
    const source = join(this.directory, id); const tombstone = join(this.directory, `.deleting-${id}-${randomUUID()}`);
    try {
      fs.renameSync(source, tombstone);
      const saved = this.save(this.records.filter(record => record.id !== id));
      if (!saved) { fs.renameSync(tombstone, source); return false; }
      fs.rmSync(tombstone, { recursive: true, force: true });
      return true;
    } catch { this.error = true; try { if (absent(source) && !absent(tombstone)) fs.renameSync(tombstone, source); } catch { /* fail closed */ } return false; }
  }

  private save(records: PetAsset[]): boolean {
    let fd: number | undefined;
    try {
      privateDirectory(this.directory);
      if (!absent(this.pending) || (this.fileStat ? !sameFile(this.fileStat, privateFile(this.path)) : !absent(this.path))) throw new Error('pet asset registry changed');
      const text = JSON.stringify({ version: 1, records }) + '\n';
      if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('pet asset registry too large');
      fd = fs.openSync(this.pending, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      fs.writeFileSync(fd, text); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      privateFile(this.pending);
      if (this.fileStat ? !sameFile(this.fileStat, privateFile(this.path)) : !absent(this.path)) throw new Error('pet asset registry changed');
      fs.renameSync(this.pending, this.path);
      this.fileStat = privateFile(this.path);
      this.records = structuredClone(records);
      return true;
    } catch { this.error = true; return false; }
    finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { this.error = true; } } }
  }
}

function sameFile(left: fs.Stats, right: fs.Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.nlink === right.nlink;
}

export function petAssetDirectory(userData: string): string {
  return normalize(join(userData, 'pet-assets'));
}
