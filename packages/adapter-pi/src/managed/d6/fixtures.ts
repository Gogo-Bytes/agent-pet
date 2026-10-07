import { lstat, mkdtemp, mkdir, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { join, dirname } from 'node:path';
import { sameIdentity } from '../path-policy.js';

/** Only explicitly named newly-created objects may be registered. Never adopts a discovered tree. */
export class OwnedFixture {
  private readonly objects = new Map<string, Stats>();
  private constructor(readonly root: string) {}
  static async create(prefix: string): Promise<OwnedFixture> {
    const f = new OwnedFixture(await mkdtemp(prefix));
    await f.track(f.root);
    return f;
  }
  async track(path: string): Promise<void> {
    if (path !== this.root && !path.startsWith(this.root + '/')) throw new Error('D6_OWNERSHIP');
    const s = await lstat(path);
    if (s.uid !== process.getuid?.() || s.isSymbolicLink() || (!s.isDirectory() && !s.isFile() && !s.isSocket())) throw new Error('D6_OWNERSHIP');
    this.objects.set(path, s);
  }
  async directory(path: string): Promise<void> { await mkdir(path, { mode: 0o700 }); await this.track(path); }
  async file(path: string, value: string): Promise<void> { await writeFile(path, value, { mode: 0o600, flag: 'wx' }); await this.track(path); }
  async verify(path: string): Promise<void> {
    const before = this.objects.get(path);
    const now = await lstat(path);
    if (!before || !sameIdentity(before, now) || now.nlink !== before.nlink && !now.isDirectory()) throw new Error('D6_OWNERSHIP');
  }
  async cleanup(): Promise<void> {
    // Validate the complete bounded allowlist BEFORE removing anything. Missing known objects
    // are allowed only because settled Core/Server teardown owns their removal.
    const live = new Map<string, Stats>();
    for (const [path, before] of this.objects) {
      let now: Stats;
      try { now = await lstat(path); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      if (!sameIdentity(before, now) || now.isSymbolicLink() || now.uid !== process.getuid?.()) throw new Error('D6_OWNERSHIP');
      live.set(path, now);
    }
    for (const [path, stat] of live) if (stat.isDirectory()) {
      const children = await readdir(path);
      if (children.length > 32 || children.some(name => !live.has(join(path, name)))) throw new Error('D6_UNKNOWN_OBJECT');
    }
    // A durable owner is an uncertainty barrier, never a cleanup target.
    if ([...live.keys()].some(path => path !== this.root && path.slice(dirname(path).length + 1) === 'owner')) throw new Error('D6_BARRIER');
    for (const [path, stat] of [...live].sort(([a], [b]) => b.length - a.length)) {
      await this.verify(path);
      if (stat.isDirectory()) await rmdir(path); else await unlink(path);
    }
  }
}
export async function waitFor(check: () => boolean, ms = 1500): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() >= end) throw new Error('D6_DEADLINE');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
export async function bounded<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('D6_DEADLINE')), ms); })]); }
  finally { clearTimeout(timer); }
}
