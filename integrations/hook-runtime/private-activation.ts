import * as fs from 'node:fs';
import { dirname, isAbsolute, join, normalize } from 'node:path';
export const privatePath = (value: unknown): value is string => typeof value === 'string' && isAbsolute(value) &&
  normalize(value) === value && Buffer.byteLength(value) <= 4096 && !/[\u0000-\u001f\u007f]/u.test(value);
const same = (a: fs.Stats, b: fs.Stats) => a.dev === b.dev && a.ino === b.ino && a.mode === b.mode &&
  a.uid === b.uid && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.nlink === b.nlink;
/** Explicit app-private path only. No Agent configuration, environment discovery or credentials. */
export function verifyPrivateDirectory(folder: string): fs.Stats {
  if (!privatePath(folder)) throw new Error('Invalid private directory');
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error('Private files unavailable');
  const directory = fs.lstatSync(folder);
  if (!directory.isDirectory() || directory.uid !== uid || (directory.mode & 0o7777) !== 0o700) throw new Error('Invalid directory');
  let ancestor = '/';
  for (const part of folder.split('/').filter(Boolean)) {
    ancestor = join(ancestor, part); const stat = fs.lstatSync(ancestor);
    if (!stat.isDirectory() || (stat.uid !== uid && stat.uid !== 0) ||
        ((stat.mode & 0o022) && !(stat.uid === 0 && (stat.mode & 0o1000)))) throw new Error('Unsafe ancestor');
  }
  return directory;
}
export function readPrivateFile(path: unknown, limit: number): Buffer {
  if (!privatePath(path) || !Number.isSafeInteger(limit) || limit < 1 || limit > 512 * 1024) throw new Error('Invalid private path');
  const folder = dirname(path), directory = verifyPrivateDirectory(folder), uid = process.getuid?.();
  const before = fs.lstatSync(path);
  if (!before.isFile() || before.nlink !== 1 || before.uid !== uid || (before.mode & 0o7777) !== 0o600 || before.size > limit) throw new Error('Invalid file');
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    if (!same(before, fs.fstatSync(fd))) throw new Error('Changed file');
    const bytes = Buffer.alloc(limit + 1); let count = 0;
    while (count < bytes.length) {
      const size = fs.readSync(fd, bytes, count, bytes.length - count, count);
      if (!size) break; count += size;
    }
    if (count > limit || !same(before, fs.fstatSync(fd)) || !same(before, fs.lstatSync(path)) ||
        !same(directory, fs.lstatSync(folder))) throw new Error('Changed file');
    return bytes.subarray(0, count);
  } finally { fs.closeSync(fd); }
}
export function readPrivateActivation(path: unknown): unknown {
  if (!privatePath(path) || path !== join(dirname(path), 'activation.json')) throw new Error('Invalid activation');
  return JSON.parse(readPrivateFile(path, 8192).toString('utf8'));
}
