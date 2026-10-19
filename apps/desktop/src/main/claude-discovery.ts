import { readlink } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import type { ClaudeDiscoveryState, ClaudeInstallation } from '../shared/claude-discovery.js';
import { discoverScanPaths, limits, ReadBudget } from './pi-preflight-files.js';

/** Metadata-only discovery. Layout identifies an installation method, never native compatibility.
 * No binary execution, shell startup, recursive HOME scan or Claude settings reads.
 */
export async function inspectClaudeInstallation(entryPath: string, home: string, budget = new ReadBudget()): Promise<Omit<ClaudeInstallation, 'id'> | null> {
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
  const result: Omit<ClaudeInstallation, 'id'> = { entryPath, executable, kind: 'unknown', version: null, compatibility: 'unverified' };
  // These are source hints only. A version-directory name is not version evidence.
  if (executable.startsWith(join(home, '.local/share/claude/versions') + '/')) result.kind = 'native';
  if (/^\/(?:opt\/homebrew|usr\/local)\/Caskroom\/claude-code(?:@latest)?\//.test(executable)) result.kind = 'homebrew';
  if (!executable.endsWith('/bin/claude.exe') && !executable.endsWith('/cli.js')) return result;
  const packageRoot = executable.endsWith('/bin/claude.exe') ? dirname(dirname(executable)) : dirname(executable);
  const value = await budget.json(join(packageRoot, 'package.json'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const metadata = value as Record<string, unknown>;
  if (metadata.name !== '@anthropic-ai/claude-code') return result;
  result.kind = 'npm';
  if (typeof metadata.version === 'string' && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(metadata.version) && metadata.version.length <= 64) result.version = metadata.version;
  const bin = metadata.bin;
  if (result.version === '2.1.301' && executable.endsWith('/bin/claude.exe') && bin && typeof bin === 'object' &&
      (bin as Record<string, unknown>).claude === 'bin/claude.exe') result.compatibility = 'verified';
  return result;
}

export class ClaudeDiscovery {
  private candidates = new Map<string, ClaudeInstallation>();
  private generation = 0;
  private reading = false;
  private controller?: AbortController;
  constructor(private readonly options: { home: string; guiPath: string }) {}
  invalidate(): void { this.generation++; this.candidates.clear(); this.controller?.abort(); }
  candidate(id: string): ClaudeInstallation | null {
    const value = this.candidates.get(id);
    return !this.reading && value?.compatibility === 'verified' ? { ...value } : null;
  }
  get targetPath(): string { return join(this.options.home, '.claude'); }
  async detect(): Promise<ClaudeDiscoveryState> {
    if (this.reading) return { installations: [], targetPath: this.targetPath, scan: 'limited', notice: 'busy' };
    this.invalidate(); const generation = this.generation;
    const controller = new AbortController(); this.controller = controller; this.reading = true;
    const initial: ClaudeDiscoveryState = { installations: [], targetPath: this.targetPath, scan: 'complete', notice: 'none' };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = (async () => {
      const budget = new ReadBudget(controller.signal);
      const paths = await discoverScanPaths(this.options.home, this.options.guiPath, budget, 'claude');
      const result = { ...initial, installations: [] as ClaudeInstallation[] };
      if (paths.limited || this.options.guiPath.length > 32768 || this.options.guiPath.split(':').length > limits.pathEntries) result.scan = 'limited';
      const seen = new Set<string>();
      for (const entryPath of paths.paths) {
        try {
          const candidate = await inspectClaudeInstallation(entryPath, this.options.home, budget);
          budget.check();
          if (candidate && !seen.has(candidate.executable)) {
            seen.add(candidate.executable); result.installations.push({ ...candidate, id: `claude-${generation}-${result.installations.length}` });
          }
        } catch { result.scan = 'limited'; budget.check(); }
      }
      return result;
    })().finally(() => { this.reading = false; });
    try {
      const result = await Promise.race([work, new Promise<ClaudeDiscoveryState>(done => {
        timer = setTimeout(() => { controller.abort(); done({ ...initial, scan: 'limited', notice: 'failed' }); }, limits.milliseconds);
      })]);
      if (generation !== this.generation) return { ...initial, notice: 'cancelled' };
      if (!controller.signal.aborted) this.candidates = new Map(result.installations.map(value => [value.id, value]));
      return result;
    } catch { return { ...initial, scan: 'limited', notice: generation === this.generation ? 'failed' : 'cancelled' }; }
    finally { if (timer) clearTimeout(timer); }
  }
}
