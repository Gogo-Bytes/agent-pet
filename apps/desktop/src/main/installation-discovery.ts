import { readlink } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { discoverScanPaths, limits, ReadBudget } from './pi-preflight-files.js';

/** Bounded metadata-only link traversal shared by installation scanners. Never executes a program. */
export async function resolveScannedExecutable(entryPath: string, budget: ReadBudget): Promise<string | null> {
  let executable = normalize(entryPath), links = 0;
  for (;;) {
    budget.validatePath(executable);
    if (/[\u0000-\u001f\u007f]/.test(executable)) throw new Error('Unsafe path');
    let current = '/', replaced = false;
    const parts = executable.split('/').filter(Boolean);
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]!);
      const stat = await budget.stat(current);
      if (!stat) return null;
      if (stat.uid !== 0 && stat.uid !== process.getuid?.()) throw new Error('Unsafe owner');
      if (stat.isSymbolicLink()) {
        if (++links > limits.links) throw new Error('Link budget');
        budget.check(); const link = await readlink(current);
        const after = await budget.stat(current);
        if (!after || after.ino !== stat.ino || after.dev !== stat.dev || after.ctimeMs !== stat.ctimeMs) throw new Error('Changed link');
        executable = resolve(dirname(current), link, ...parts.slice(index + 1)); replaced = true; break;
      }
      const stickyAncestor = index < parts.length - 1 && stat.uid === 0 && !!(stat.mode & 0o1000);
      if ((stat.mode & 0o022) && !stickyAncestor) throw new Error('Unsafe mode');
      if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile() || !(stat.mode & 0o111)) throw new Error('Not an executable');
    }
    if (!replaced) break;
  }
  return executable;
}

type Installation = { id: string; executable: string; compatibility: 'verified' | 'unverified' };
type DiscoveryState<T> = { installations: T[]; targetPath: string; scan: 'complete' | 'limited'; notice: 'none' | 'busy' | 'failed' | 'cancelled' };
/** No target/config reads. An invalidated or timed-out scan cannot publish late capabilities. */
export class InstallationDiscovery<T extends Installation> {
  private candidates = new Map<string, T>();
  private generation = 0;
  private reading = false;
  private controller?: AbortController;
  constructor(private readonly options: {
    home: string; guiPath: string; command: 'claude' | 'codex'; targetPath: string; extraEntries?: string[];
    inspect(entry: string, budget: ReadBudget): Promise<Omit<T, 'id'> | null>;
  }) {}
  get targetPath(): string { return this.options.targetPath; }
  invalidate(): void { this.generation++; this.candidates.clear(); this.controller?.abort(); }
  candidate(id: string): T | null {
    const value = this.candidates.get(id);
    return !this.reading && value?.compatibility === 'verified' ? { ...value } : null;
  }
  async detect(): Promise<DiscoveryState<T>> {
    if (this.reading) return { installations: [], targetPath: this.targetPath, scan: 'limited', notice: 'busy' };
    this.invalidate(); const generation = this.generation;
    const controller = new AbortController(); this.controller = controller; this.reading = true;
    const initial: DiscoveryState<T> = { installations: [], targetPath: this.targetPath, scan: 'complete', notice: 'none' };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = (async () => {
      const budget = new ReadBudget(controller.signal);
      budget.validatePath(this.targetPath);
      const paths = await discoverScanPaths(this.options.home, this.options.guiPath, budget, this.options.command);
      const result: DiscoveryState<T> = { ...initial, installations: [] };
      if (paths.limited || this.options.guiPath.length > 32768 || this.options.guiPath.split(':').length > limits.pathEntries) result.scan = 'limited';
      const seen = new Set<string>();
      for (const entryPath of [...new Set([...paths.paths, ...(this.options.extraEntries ?? [])])]) {
        try {
          const candidate = await this.options.inspect(entryPath, budget);
          budget.check();
          if (candidate && !seen.has(candidate.executable)) {
            seen.add(candidate.executable);
            result.installations.push({ ...candidate, id: `${this.options.command}-${generation}-${result.installations.length}` } as T);
          }
        } catch { result.scan = 'limited'; budget.check(); }
      }
      return result;
    })().finally(() => { this.reading = false; });
    try {
      const result = await Promise.race([work, new Promise<DiscoveryState<T>>(done => {
        timer = setTimeout(() => { controller.abort(); done({ ...initial, scan: 'limited', notice: 'failed' }); }, limits.milliseconds);
      })]);
      if (generation !== this.generation) return { ...initial, notice: 'cancelled' };
      if (!controller.signal.aborted) this.candidates = new Map(result.installations.map(value => [value.id, value]));
      return result;
    } catch { return { ...initial, scan: 'limited', notice: generation === this.generation ? 'failed' : 'cancelled' }; }
    finally { if (timer) clearTimeout(timer); }
  }
}
