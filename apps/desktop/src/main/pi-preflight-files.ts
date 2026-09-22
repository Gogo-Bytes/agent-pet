import { constants } from 'node:fs';
import { lstat, open, readlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, parse, sep } from 'node:path';
import type { Finding, Inspection, InstallationCandidate, TargetCandidate } from '../shared/pi-preflight.js';

export const limits = { bytes: 64 * 1024, pathBytes: 4096, depth: 32, pathEntries: 32, links: 8, operations: 4096, milliseconds: 3000 } as const;
class CheckFailure extends Error { constructor(readonly finding: Finding) { super(finding); } }
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
export class ReadBudget {
  private operations = 0;
  private readonly deadline: number;
  constructor(private readonly signal?: AbortSignal, milliseconds: number = limits.milliseconds) { this.deadline = Date.now() + milliseconds; }
  check(): void {
    if (this.signal?.aborted || Date.now() >= this.deadline || ++this.operations > limits.operations) throw new CheckFailure('budget');
  }
  async stat(path: string) {
    this.check();
    try { return await lstat(path); } catch (error) { if (missing(error)) return null; throw new CheckFailure('unreadable'); }
  }
  validatePath(path: string): void {
    this.check();
    if (!isAbsolute(path) || path.includes('\0') || Buffer.byteLength(path) > limits.pathBytes || path.split(sep).length > limits.depth) throw new CheckFailure('unsafe');
  }
  // No recursive discovery. Each ancestor is metadata-only and symlinks are rejected.
  async ancestors(path: string, config: boolean): Promise<void> {
    this.validatePath(path);
    let current = parse(path).root;
    const parts = normalize(path).slice(current.length).split(sep).filter(Boolean);
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]!);
      const stat = await this.stat(current);
      if (!stat) continue;
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new CheckFailure('unsafe');
      const uid = process.getuid?.();
      // Root-owned sticky temp ancestors are permitted for isolated fixtures, never a target.
      const stickyAncestor = index < parts.length - 1 && stat.uid === 0 && (stat.mode & 0o1000) !== 0;
      if ((stat.mode & 0o022) && !stickyAncestor) throw new CheckFailure('unsafe');
      if (config && uid !== undefined && stat.uid !== uid && stat.uid !== 0) throw new CheckFailure('unsafe');
    }
  }
  async regular(path: string) {
    await this.ancestors(dirname(path), false);
    const stat = await this.stat(path);
    if (!stat) return null;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > limits.bytes || (stat.mode & 0o022)) throw new CheckFailure('unsafe');
    const uid = process.getuid?.();
    if (uid !== undefined && stat.uid !== uid && stat.uid !== 0) throw new CheckFailure('unsafe');
    return stat;
  }
  async json(path: string): Promise<unknown | undefined> {
    const before = await this.regular(path);
    if (!before) return undefined;
    this.check();
    // NONBLOCK avoids a FIFO swap blocking open; NOFOLLOW protects the leaf only.
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > limits.bytes || stat.dev !== before.dev || stat.ino !== before.ino || stat.mode !== before.mode || stat.uid !== before.uid) throw new CheckFailure('unsafe');
      this.check();
      const buffer = Buffer.alloc(limits.bytes + 1);
      let offset = 0;
      while (offset < buffer.length) {
        this.check();
        const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      const after = await file.stat();
      if (offset > limits.bytes || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new CheckFailure('unsafe');
      return JSON.parse(buffer.subarray(0, offset).toString('utf8')) as unknown;
    } finally { await file.close(); }
  }
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function finding(error: unknown): Finding { return error instanceof CheckFailure ? error.finding : 'unreadable'; }

export async function inspectTarget(target: TargetCandidate, budget = new ReadBudget()): Promise<Inspection> {
  const findings = new Set<Finding>();
  if (process.platform === 'win32') return { target, findings: ['platform-unknown'] };
  try {
    await budget.ancestors(target.path, true);
    const stat = await budget.stat(target.path);
    if (!stat) return { target, findings: ['missing-target'] };
    if ((process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o700) !== 0o700) throw new CheckFailure('unsafe');
    const extensions = join(target.path, 'extensions');
    await budget.ancestors(extensions, true);
    const extensionStat = await budget.stat(extensions);
    if (extensionStat && ((process.getuid && extensionStat.uid !== process.getuid()) || (extensionStat.mode & 0o700) !== 0o700)) throw new CheckFailure('unsafe');
    for (const name of ['index.ts', 'index.js', 'agent-pet.ts']) {
      const path = join(extensions, name);
      if (await budget.stat(path)) {
        findings.add(name === 'agent-pet.ts' ? 'existing-extension' : 'root-entry');
        await budget.regular(path); // Only metadata, never extension source.
      }
    }
    const manifest = await budget.json(join(extensions, 'package.json'));
    if (manifest !== undefined) {
      if (record(manifest) && record(manifest.pi) && Array.isArray(manifest.pi.extensions) && manifest.pi.extensions.length > 0) findings.add('root-manifest');
      else findings.add('manifest-unknown');
    }
    // Presence alone is unknown, including empty files. Do not approximate pi's ignore semantics.
    for (const dir of [target.path, extensions]) for (const name of ['.gitignore', '.ignore', '.fdignore']) {
      const path = join(dir, name);
      if (await budget.stat(path)) { findings.add('ignore-unknown'); await budget.regular(path); }
    }
    const settings = await budget.json(join(target.path, 'settings.json'));
    if (settings !== undefined && (!record(settings) ||
      (settings.extensions !== undefined && (!Array.isArray(settings.extensions) || settings.extensions.length > 0)) ||
      (settings.packages !== undefined && (!Array.isArray(settings.packages) || settings.packages.length > 0)))) findings.add('settings-unknown');
    budget.check();
  } catch (error) { findings.add(finding(error)); }
  return { target, findings: [...findings] };
}

/** A package metadata identity, not a signature or evidence of an active pi process. */
export async function identifyInstallation(path: string, id: string, directory = false, budget = new ReadBudget()): Promise<InstallationCandidate | null> {
  const candidate: InstallationCandidate = { id, path, compatibility: 'unverified', version: null };
  if (process.platform === 'win32') return candidate;
  try {
    budget.validatePath(path);
    const initial = await budget.stat(path);
    if (!initial) return null;
    let resolved = path;
    if (!directory) {
      for (let links = 0; ; links++) {
        await budget.ancestors(dirname(resolved), false);
        const stat = await budget.stat(resolved);
        if (!stat) return candidate;
        if (!stat.isSymbolicLink()) { if (!stat.isFile()) return candidate; break; }
        if (links >= limits.links) return candidate;
        budget.check();
        const link = await readlink(resolved);
        resolved = isAbsolute(link) ? normalize(link) : join(dirname(resolved), link);
        budget.validatePath(resolved);
      }
      if (!resolved.endsWith(`${sep}dist${sep}bundle${sep}cli.js`)) return candidate;
      resolved = dirname(dirname(dirname(resolved)));
    }
    await budget.ancestors(resolved, false);
    const metadata = await budget.json(join(resolved, 'package.json'));
    if (!record(metadata) || metadata.name !== '@earendil-works/pi-coding-agent' || !record(metadata.bin) || metadata.bin.pi !== 'dist/bundle/cli.js' || !record(metadata.piConfig) || metadata.piConfig.configDir !== '.pi') return candidate;
    // Check entry type, not contents; bundled CLI can exceed the config-file byte cap.
    const cli = join(resolved, 'dist/bundle/cli.js');
    await budget.ancestors(dirname(cli), false);
    const entry = await budget.stat(cli);
    if (!entry?.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || (entry.mode & 0o022) ||
      (process.getuid && entry.uid !== process.getuid() && entry.uid !== 0)) return candidate;
    if (typeof metadata.version === 'string' && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(metadata.version) && metadata.version.length <= 64) candidate.version = metadata.version;
    if (candidate.version === '0.85.1') candidate.compatibility = 'verified-0.85.1';
    return candidate;
  } catch (error) { if (finding(error) === 'budget') throw error; return candidate; }
}

export function scanPaths(home: string, guiPath: string): string[] {
  // Ignore empty/relative PATH entries (never inspect the process cwd); no shell expansion.
  const entries = guiPath.slice(0, 32768).split(':').slice(0, limits.pathEntries);
  return [...new Set([...entries, '/opt/homebrew/bin', '/usr/local/bin', join(home, '.local/bin')]
    .filter(path => isAbsolute(path) && Buffer.byteLength(path) <= limits.pathBytes && !path.includes('\0')))].map(path => join(path, 'pi'));
}

export async function detectInstallations(paths: string[], budget = new ReadBudget()): Promise<{ installations: InstallationCandidate[]; scan: 'complete' | 'limited' }> {
  const installations: InstallationCandidate[] = [];
  if (process.platform === 'win32') return { installations, scan: 'limited' };
  try {
    for (const [index, path] of paths.slice(0, limits.pathEntries + 3).entries()) {
      const candidate = await identifyInstallation(path, `scan-${index}`, false, budget);
      if (candidate) installations.push(candidate);
    }
    return { installations, scan: paths.length > limits.pathEntries + 3 ? 'limited' : 'complete' };
  } catch { return { installations, scan: 'limited' }; }
}
