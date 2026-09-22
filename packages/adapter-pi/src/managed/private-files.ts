import { constants, type Stats } from 'node:fs';
import { lstat, open, mkdir, link, rename, unlink, rmdir } from 'node:fs/promises';
import { dirname, join, parse, relative, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fail, missing, sanitized } from './errors.js';
import { sameIdentity, validatePath, type Identity, type Operation, type PolicyScope } from './path-policy.js';

export type Boundary = 'read-open' | 'read-complete' | 'create' | 'write' | 'file-sync' | 'publish' | 'directory-sync' | 'cleanup';
/** Internal deterministic fault seam, not native ACL/mount evidence. */
export type FaultHook = (boundary: Boundary, operation: Operation) => void | Promise<void>;
export type OwnedFile = { path: string; identity: Stats };
const sameFile = (a: Stats, b: Stats): boolean => sameIdentity(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.nlink === b.nlink;
export class PrivateFiles {
  constructor(readonly scope: PolicyScope, private readonly fault: FaultHook = () => {}) {
    validatePath(scope.roots.storageRoot); validatePath(scope.roots.runtimeRoot);
    if (scope.uid !== process.getuid!()) fail('unsafe-owner');
  }
  private contained(path: string): void {
    validatePath(path);
    if (![this.scope.roots.storageRoot, this.scope.roots.runtimeRoot].some(root => path === root ||
      (!relative(root, path).startsWith(`..${sep}`) && relative(root, path) !== '..' && !relative(root, path).startsWith(sep)))) fail('unsupported-path');
  }
  async directory(path: string, operation: Operation): Promise<Stats> {
    this.contained(path);
    let current = parse(path).root;
    const roots = [this.scope.roots.storageRoot, this.scope.roots.runtimeRoot];
    for (const part of ['', ...path.slice(current.length).split(sep).filter(Boolean)]) {
      if (part) current = join(current, part);
      const stat = await lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('unsafe-type');
      const privateDirectory = roots.some(root => current === root || current.startsWith(root + sep));
      if (privateDirectory) {
        if (stat.uid !== this.scope.uid) fail('unsafe-owner');
        if ((stat.mode & 0o7777) !== 0o700) fail('unsafe-mode');
      } else {
        if (stat.uid !== this.scope.uid && stat.uid !== 0) fail('unsafe-owner');
        if (stat.mode & 0o022) {
          if (!(stat.mode & 0o1000)) fail('unsafe-mode');
          await this.scope.allowStickyAncestor(current, stat);
        }
      }
      await this.scope.revalidate(operation, current, stat);
    }
    return lstat(path);
  }
  checkFile(stat: Stats, max: number): void {
    if (!stat.isFile() || stat.isSymbolicLink()) fail('unsafe-type');
    if (stat.uid !== this.scope.uid) fail('unsafe-owner');
    if ((stat.mode & 0o7777) !== 0o600) fail('unsafe-mode');
    if (stat.nlink !== 1) fail('unsafe-link');
    if (stat.size > max) fail('limit-exceeded');
  }
  async inspect(path: string, max: number, operation: Operation): Promise<Stats> {
    await this.directory(dirname(path), operation);
    const stat = await lstat(path);
    this.checkFile(stat, max);
    await this.scope.revalidate(operation, path, stat);
    return stat;
  }
  async read(path: string, max: number, operation: Operation): Promise<{ value: unknown; owned: OwnedFile }> {
    try {
      const before = await this.inspect(path, max, operation);
      await this.fault('read-open', operation);
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const start = await file.stat(); this.checkFile(start, max);
        if (!sameFile(before, start)) fail('path-changed');
        const buffer = Buffer.alloc(max + 1); let length = 0;
        while (length < buffer.length) {
          const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
          if (!bytesRead) break;
          length += bytesRead;
        }
        await this.fault('read-complete', operation);
        const end = await file.stat(); this.checkFile(end, max);
        const leaf = await this.inspect(path, max, operation);
        if (length > max || length !== start.size || !sameFile(start, end) || !sameFile(end, leaf) ||
          start.size !== end.size || start.mtimeMs !== end.mtimeMs || start.ctimeMs !== end.ctimeMs) fail('path-changed');
        return { value: JSON.parse(buffer.subarray(0, length).toString('utf8')) as unknown, owned: { path, identity: end } };
      } finally { await file.close(); }
    } catch (error) { throw sanitized(error, 'store-corrupt'); }
  }
  async syncDirectory(path: string, operation: Operation): Promise<void> {
    const before = await this.directory(path, operation);
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY);
    try {
      if (!sameIdentity(before, await file.stat())) fail('path-changed');
      await this.fault('directory-sync', operation); await file.sync();
    } finally { await file.close(); }
  }
  async createDirectory(path: string, operation: Operation): Promise<OwnedFile> {
    await this.directory(dirname(path), operation);
    await this.fault('create', operation);
    try { await mkdir(path, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('ownership-busy'); throw sanitized(error); }
    const identity = await this.directory(path, operation);
    await this.syncDirectory(path, operation);
    await this.syncDirectory(dirname(path), operation);
    return { path, identity };
  }
  async publish(path: string, value: unknown, max: number, operation: Operation, previous?: OwnedFile): Promise<OwnedFile> {
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length > max) fail('limit-exceeded');
    let published = false;
    try {
      await this.directory(dirname(path), operation);
      const temporary = join(dirname(path), `.write-${randomBytes(16).toString('hex')}`);
      await this.fault('create', operation);
      const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try {
        this.checkFile(await file.stat(), max);
        await this.fault('write', operation); await file.writeFile(bytes);
        await this.fault('file-sync', operation); await file.sync();
      } finally { await file.close(); }
      await this.inspect(temporary, max, operation);
      await this.directory(dirname(path), operation);
      if (previous) {
        if (previous.path !== path || !sameFile(previous.identity, await this.inspect(path, max, operation))) fail('path-changed');
      }
      await this.fault('publish', operation);
      if (previous) { await rename(temporary, path); published = true; }
      else {
        // Hard-link publication is atomic no-clobber; remove temporary link before admitting readers.
        await link(temporary, path); published = true; await unlink(temporary);
      }
      await this.syncDirectory(dirname(path), operation);
      return { path, identity: await this.inspect(path, max, operation) };
    } catch (error) {
      if (published) fail('outcome-uncertain');
      throw sanitized(error, 'durability-failed');
    }
  }
  async remove(owned: OwnedFile, directory = false): Promise<void> {
    try {
      await this.directory(dirname(owned.path), 'cleanup');
      const current = await lstat(owned.path);
      if (!sameIdentity(current, owned.identity) || (!directory && !sameFile(current, owned.identity))) fail('path-changed');
      await this.scope.revalidate('cleanup', owned.path, current);
      await this.fault('cleanup', 'cleanup');
      if (directory) await rmdir(owned.path); else await unlink(owned.path);
      await this.syncDirectory(dirname(owned.path), 'cleanup');
    } catch (error) { if (!missing(error)) throw sanitized(error); }
  }
  async socket(path: string, operation: 'socket-bind' | 'socket-connect'): Promise<OwnedFile> {
    await this.directory(dirname(path), operation);
    const identity = await lstat(path);
    if (!identity.isSocket()) fail('unsafe-type');
    if (identity.uid !== this.scope.uid) fail('unsafe-owner');
    if ((identity.mode & 0o7777) !== 0o600) fail('unsafe-mode');
    await this.scope.revalidate(operation, path, identity);
    return { path, identity };
  }
}
