import { desktopExecutable } from '../../../../integrations/codex-hooks/desktop-signature.js';
import * as fs from 'node:fs';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';

type CodexRelease = { kind: 'standalone' | 'app-server-daemon'; version: string };

/** Release directory metadata only. Live event delivery checks the exact executable independently. */
export function codexRelease(path: string): CodexRelease | null {
  const match = /\/packages\/(standalone|app-server-daemon)\/releases\/v?(\d+\.\d+\.\d+)(?:-(?:aarch64|x86_64)-apple-darwin)?\/(?:bin\/)?codex$/.exec(path);
  if (!match) return null;
  const [, kind, version] = match;
  if (kind === 'standalone' && (version === '0.163.0' || version === '0.171.0')) return { kind, version };
  if (kind === 'app-server-daemon' && (version === '0.163.0' || version === '0.172.0')) return { kind, version };
  return null;
}

/** Revalidate a Main-owned program path. No PATH scan, execution, settings or credential reads. */
export function inspectCodexExecutable(selected: string): string | null {
  return inspectCodexPath(selected, false);
}

export function inspectCodexHostExecutable(selected: string): string | null {
  return inspectCodexPath(selected, true);
}

function inspectCodexPath(selected: string, allowDaemon: boolean): string | null {
  try {
    if (!isAbsolute(selected) || Buffer.byteLength(selected) > 4096 || /[\u0000-\u001f\u007f]/.test(selected)) return null;
    // This fixed bundle path is signature-checked during discovery, restore and live delivery.
    if (process.platform === 'darwin' && selected === desktopExecutable) {
      const stat = fs.lstatSync(selected);
      return stat.isFile() && (stat.mode & 0o111) && fs.realpathSync(selected) === selected ? selected : null;
    }
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
    if (!executable.isFile() || !(executable.mode & 0o111) || !path.endsWith('/codex')) return null;
    // Standalone distribution actually verified in isolation. Other layouts await compatibility checks.
    const release = dirname(path);
    const layout = codexRelease(path)?.kind;
    if (!layout || (layout === 'app-server-daemon' && !allowDaemon)) return null;
    const metadata = fs.lstatSync(release);
    if (!metadata.isDirectory() || (metadata.mode & 0o022)) return null;
    return path;
  } catch { return null; }
}

/** The 0.171 TUI can run its own hooks even when the managed 0.172 daemon is online.
 * Derive only the matching canonical sibling of the registered daemon, including architecture.
 * Preview and confirmation must have selected exactly this standalone executable. */
export function pairedStandaloneExecutable(host: string): string | undefined {
  const daemonRelease = /\/packages\/app-server-daemon\/releases\/(v?)0\.172\.0((?:-(?:aarch64|x86_64)-apple-darwin)?\/(?:bin\/)?codex)$/;
  if (!daemonRelease.test(host)) return undefined;
  const sibling = host.replace(daemonRelease, (_, prefix, suffix) => `/packages/standalone/releases/${prefix}0.171.0${suffix}`);
  return inspectCodexExecutable(sibling) === sibling ? sibling : undefined;
}

/** Managed host selection for supported CLI and daemon pairs, fixed metadata only. No server connection or transcript reads. */
export function resolveCodexHostExecutable(cli: string, configurationDirectory: string,
  inspectHost: (path: string) => string | null = inspectCodexHostExecutable): string | null {
  const exists = (path: string): boolean => { try { fs.lstatSync(path); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } };
  try {
    if (cli === desktopExecutable) return inspectHost(cli);
    const cliVersion = codexRelease(cli)?.version;
    const dedicated = join(configurationDirectory, 'packages/app-server-daemon/current');
    if (exists(dedicated)) {
      const daemonPath = join(dedicated, exists(join(dedicated, 'codex')) && !exists(join(dedicated, 'bin/codex')) ? 'codex' : 'bin/codex');
      const host = inspectHost(daemonPath);
      const release = host && codexRelease(host);
      if (!release) return null;
      if (cliVersion === '0.171.0') return host && pairedStandaloneExecutable(host) === cli ? host : null;
      return release.version === '0.163.0' ? host : null;
    }
    // The newer CLI is supported with its dedicated 0.172.0 hook host.
    if (cliVersion === '0.171.0') return null;
    const state = join(configurationDirectory, 'app-server-daemon');
    if (['app-server.pid', 'app-server.stderr.log', 'app-server-updater.pid', 'app-server-updater.stderr.log'].some(name => exists(join(state, name)))) {
      const root = join(configurationDirectory, 'packages/standalone/current');
      const host = inspectHost(join(root, 'bin/codex')) ?? inspectHost(join(root, 'codex'));
      const release = host && codexRelease(host);
      return release && release.kind === 'standalone' && release.version === '0.163.0' ? host : null;
    }
    // Fresh no-daemon installation remains bindable; a future different daemon binary is never guessed.
    return cli;
  } catch { return null; }
}
