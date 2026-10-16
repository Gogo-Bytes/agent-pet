import * as fs from 'node:fs';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';

/** Explicit native selection only. No PATH scan, execution, settings or credential reads.
 * This slice supports the npm layout/version verified by the isolated native hook check.
 */
export function inspectClaudeExecutable(selected: string): string | null {
  try {
    if (!isAbsolute(selected) || Buffer.byteLength(selected) > 4096 || /[\u0000-\u001f\u007f]/.test(selected)) return null;
    let path = normalize(selected), links = 0, steps = 0;
    // Walk links ourselves so both link expansion and directory work are bounded.
    for (;;) {
      let current = '/', replaced = false;
      const parts = path.split('/').filter(Boolean);
      for (let index = 0; index < parts.length; index++) {
        if (++steps > 128) return null;
        current = join(current, parts[index]!);
        const stat = fs.lstatSync(current);
        if (stat.uid !== 0 && stat.uid !== process.getuid?.()) return null;
        if (stat.isSymbolicLink()) {
          if (++links > 8) return null;
          path = resolve(dirname(current), fs.readlinkSync(current), ...parts.slice(index + 1));
          replaced = true; break;
        }
        const sticky = stat.uid === 0 && !!(stat.mode & 0o1000);
        if ((stat.mode & 0o022) && !sticky) return null;
        if (index < parts.length - 1 && !stat.isDirectory()) return null;
      }
      if (!replaced) break;
    }
    const executable = fs.lstatSync(path);
    if (!executable.isFile() || !(executable.mode & 0o111) || !path.endsWith('/bin/claude.exe')) return null;
    const manifestPath = join(dirname(dirname(path)), 'package.json');
    const before = fs.lstatSync(manifestPath);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 65536 || before.nlink !== 1 ||
        (before.uid !== 0 && before.uid !== process.getuid?.()) || (before.mode & 0o022)) return null;
    const fd = fs.openSync(manifestPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const same = (stat: fs.Stats) => stat.dev === before.dev && stat.ino === before.ino && stat.size === before.size &&
        stat.mtimeMs === before.mtimeMs && stat.ctimeMs === before.ctimeMs;
      if (!same(fs.fstatSync(fd))) return null;
      const buffer = Buffer.alloc(65537);
      const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
      if (count > 65536 || !same(fs.fstatSync(fd)) || !same(fs.lstatSync(manifestPath))) return null;
      const value: unknown = JSON.parse(buffer.subarray(0, count).toString('utf8'));
      if (!value || typeof value !== 'object') return null;
      const record = value as Record<string, unknown>;
      const bin = record.bin;
      if (record.name !== '@anthropic-ai/claude-code' || record.version !== '2.1.301' || !bin || typeof bin !== 'object' ||
          (bin as Record<string, unknown>).claude !== 'bin/claude.exe') return null;
      return path;
    } finally { fs.closeSync(fd); }
  } catch { return null; }
}
