import { dirname, join } from 'node:path';
import type { ClaudeInstallation } from '../shared/claude-discovery.js';
import { ReadBudget } from './pi-preflight-files.js';
import { InstallationDiscovery, resolveScannedExecutable } from './installation-discovery.js';

/** Layout identifies an installation method, never native compatibility. No settings reads. */
export async function inspectClaudeInstallation(entryPath: string, home: string, budget = new ReadBudget()): Promise<Omit<ClaudeInstallation, 'id'> | null> {
  const executable = await resolveScannedExecutable(entryPath, budget);
  if (!executable) return null;
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

export class ClaudeDiscovery extends InstallationDiscovery<ClaudeInstallation> {
  constructor(options: { home: string; guiPath: string }) {
    super({ ...options, command: 'claude', targetPath: join(options.home, '.claude'),
      inspect: (entry, budget) => inspectClaudeInstallation(entry, options.home, budget) });
  }
}
