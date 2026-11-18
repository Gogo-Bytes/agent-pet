import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import type { CodexInstallation } from '../shared/codex-discovery.js';
import { codexExecutableLayout } from './codex-executable.js';
import { InstallationDiscovery, resolveScannedExecutable } from './installation-discovery.js';
import { ReadBudget } from './pi-preflight-files.js';

const desktopExecutable = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const verifySignature = promisify(execFile);

export async function inspectCodexInstallation(entryPath: string, budget = new ReadBudget()): Promise<Omit<CodexInstallation, 'id'> | null> {
  if (process.platform === 'darwin' && entryPath === desktopExecutable) {
    const stat = await budget.stat(entryPath);
    if (!stat?.isFile() || !(stat.mode & 0o111) || await realpath(entryPath) !== entryPath) return null;
    // A signed file is discovery evidence, not the identity of a running event sender.
    await verifySignature('/usr/bin/codesign', ['--verify', '-R=anchor apple generic and identifier "codex" and certificate leaf[subject.OU] = "2DC432GLL2"', entryPath], { timeout: 1500, maxBuffer: 4096 });
    budget.check();
    return { entryPath, executable: entryPath, kind: 'native', version: null, compatibility: 'unverified' };
  }
  const executable = await resolveScannedExecutable(entryPath, budget);
  if (!executable) return null;
  const candidate: Omit<CodexInstallation, 'id'> = { entryPath, executable, kind: 'unknown', version: null, compatibility: 'unverified' };
  // Same layout guard as connection preparation; do not confuse the daemon with the CLI.
  if (codexExecutableLayout(executable) === 'standalone') return { ...candidate, kind: 'standalone', compatibility: 'verified' };
  if (/\/packages\/standalone\/releases\//.test(executable)) candidate.kind = 'standalone';
  if (/^\/(?:opt\/homebrew|usr\/local)\/(?:Cellar|Caskroom)\/codex\//.test(executable)) candidate.kind = 'homebrew';
  if (!executable.endsWith('/bin/codex.js')) return candidate;
  const metadata = await budget.json(join(dirname(dirname(executable)), 'package.json'));
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const pkg = metadata as Record<string, unknown>;
    if (pkg.name === '@openai/codex') {
      candidate.kind = 'npm';
      if (typeof pkg.version === 'string' && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(pkg.version) && pkg.version.length <= 64) candidate.version = pkg.version;
    }
  }
  return candidate;
}
export class CodexDiscovery extends InstallationDiscovery<CodexInstallation> {
  constructor(options: { home: string; guiPath: string; codexHome?: string }) {
    const targetPath = options.codexHome ?? join(options.home, '.codex');
    super({ ...options, command: 'codex', targetPath,
      extraEntries: [join(targetPath, 'packages/standalone/current/bin/codex'), join(targetPath, 'packages/standalone/current/codex'), ...(process.platform === 'darwin' ? [desktopExecutable] : [])],
      inspect: inspectCodexInstallation });
  }
}
