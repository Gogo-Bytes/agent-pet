import * as fs from 'node:fs';
import { join } from 'node:path';

/** Compile-time-owned runtime artifacts; never reads an Agent installation or configuration. */
export async function loadCodexRuntimeAssets(): Promise<{ nativeHook: string }> {
  const read = (name: string): Buffer => {
    const path = join(__dirname, '../codex-runtime', name), before = fs.lstatSync(path);
    if (!before.isFile() || before.size < 1 || before.size > 512 * 1024) throw new Error('Codex runtime unavailable');
    const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const buffer = Buffer.alloc(512 * 1024 + 1); let count = 0;
      while (count < buffer.length) {
        const size = fs.readSync(fd, buffer, count, buffer.length - count, count);
        if (!size) break; count += size;
      }
      const after = fs.fstatSync(fd);
      if (count > 512 * 1024 || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
          before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Codex runtime unavailable');
      return buffer.subarray(0, count);
    } finally { fs.closeSync(fd); }
  };
  return { nativeHook: read('native-hook.cjs').toString('utf8') };
}
