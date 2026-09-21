import * as fs from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultPreferences, parsePreferencePatch, type Preferences } from '../shared/preferences.js';

// Main-only, small non-secret preference file. Never persists Session state.
export class PreferenceStore {
  private value: Preferences = { ...defaultPreferences };
  error: string | null = null;
  constructor(private readonly path: string) {
    let fd: number | undefined;
    try {
      // Inspect through the descriptor without hanging on a malformed FIFO entry.
      const nonblock = process.platform === 'win32' ? 0 : fs.constants.O_NONBLOCK;
      fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | nonblock);
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > 4096) throw new Error('Invalid preference file');
      const buffer = Buffer.alloc(4097);
      const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
      if (count > 4096) throw new Error('Oversized preferences');
      const parsed = JSON.parse(buffer.subarray(0, count).toString('utf8')) as Record<string, unknown>;
      if (!parsed || parsed.schemaVersion !== 1 || Object.keys(parsed).length !== 3 ||
          !('petVisible' in parsed) || !('petSize' in parsed)) throw new Error('Invalid preference schema');
      const { schemaVersion: _, ...patch } = parsed;
      this.value = { schemaVersion: 1, ...parsePreferencePatch(patch) } as Preferences;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.error = '偏好无法读取，已使用默认值。下次保存将替换原偏好文件。';
      }
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch { this.error = '偏好文件关闭失败，请重新打开应用。'; } }
    }
  }
  snapshot(): Preferences { return { ...this.value }; }
  update(value: unknown): boolean {
    const next = { ...this.value, ...parsePreferencePatch(value) };
    if (!this.error && next.petSize === this.value.petSize && next.petVisible === this.value.petVisible) return true;
    const temp = `${this.path}.${randomUUID()}.tmp`;
    let fd: number | undefined;
    try {
      fs.mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      fd = fs.openSync(temp, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify(next) + '\n');
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      fs.renameSync(temp, this.path);
      this.value = next;
      this.error = null;
      return true;
    } catch {
      this.error = '偏好保存失败，未应用更改。请检查应用数据目录的可用空间和权限后重试。';
      return false;
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* Preserve the reported write failure. */ } }
      try { fs.unlinkSync(temp); } catch { /* Successful rename leaves no temporary file. */ }
    }
  }
}
