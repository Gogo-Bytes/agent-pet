import * as fs from 'node:fs';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';

/** Layout compatibility only, not a binary signature or runtime version attestation. */
export function codexExecutableLayout(path: string): 'standalone' | 'app-server-daemon' | null {
  return /\/packages\/(standalone|app-server-daemon)\/releases\/(?:v)?0\.163\.0(?:-(?:aarch64|x86_64)-apple-darwin)?\/(?:bin\/)?codex$/.exec(path)?.[1] as 'standalone' | 'app-server-daemon' | undefined ?? null;
}

/** Explicit native selection only. No PATH scan, execution, settings or credential reads. */
export function inspectCodexExecutable(selected: string): string | null {
  return inspectCodexPath(selected, false);
}

function inspectCodexPath(selected: string, allowDaemon: boolean): string | null {
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
    if (!executable.isFile() || !(executable.mode & 0o111) || !path.endsWith('/codex')) return null;
    // Standalone distribution actually verified in isolation. Other layouts await compatibility checks.
    const release = dirname(path);
    const layout = codexExecutableLayout(path);
    if (!layout || (layout === 'app-server-daemon' && !allowDaemon)) return null;
    const metadata = fs.lstatSync(release);
    if (!metadata.isDirectory() || (metadata.mode & 0o022)) return null;
    return path;
  } catch { return null; }
}

/** Same-version managed host selection, fixed metadata only. No server connection or transcript reads. */
export function resolveCodexHostExecutable(cli: string, configurationDirectory: string,
  inspect: (path: string) => string | null = inspectCodexExecutable): string | null {
  const exists = (path: string): boolean => { try { fs.lstatSync(path); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } };
  try {
    const dedicated = join(configurationDirectory, 'packages/app-server-daemon/current');
    if (exists(dedicated)) {
      const daemonPath = join(dedicated, exists(join(dedicated, 'codex')) && !exists(join(dedicated, 'bin/codex')) ? 'codex' : 'bin/codex');
      return codexExecutableLayout(daemonPath) === 'app-server-daemon' ? inspectCodexPath(daemonPath, true) : inspect(daemonPath);
    }
    const state = join(configurationDirectory, 'app-server-daemon');
    if (['app-server.pid', 'app-server.stderr.log', 'app-server-updater.pid', 'app-server-updater.stderr.log'].some(name => exists(join(state, name)))) {
      const root = join(configurationDirectory, 'packages/standalone/current');
      return inspect(join(root, 'bin/codex')) ?? inspect(join(root, 'codex'));
    }
    // Fresh no-daemon installation remains bindable; a future different daemon binary is never guessed.
    return cli;
  } catch { return null; }
}
