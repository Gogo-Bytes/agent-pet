import { spawn } from 'node:child_process';
import { lstat, readlink, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENTRY = '/Users/gan/.local/bin/codex';
export const INSTALL = '/Users/gan/.codex/packages/standalone';
export const ROOT = '/tmp/agent-pet-codex-check-20261019-e724a1';
export const LIMIT = 64 * 1024;
const flags = ['--config', '--no-alt-screen', '--version', '--help'];
export function summarize(text, mode) {
  if (mode === 'version') {
    const match = /^codex(?:-cli)?\s+(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)\s*$/m.exec(text);
    return { version: match?.[1] ?? null };
  }
  return { flags: Object.fromEntries(flags.map(flag => [flag, text.includes(flag)])),
    mentionsHooks: /\bhooks?\b/i.test(text) };
}
export function environment(root) {
  return { HOME: path.join(root, 'home'), CODEX_HOME: path.join(root, 'config'),
    XDG_CONFIG_HOME: path.join(root, 'config'), XDG_CACHE_HOME: path.join(root, 'cache'),
    TMPDIR: path.join(root, 'tmp'), PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    LANG: 'C', LC_ALL: 'C', NO_COLOR: '1' };
}
/** Test harness only; never inherited credentials, shell, prompt or captured raw output. */
export function runBounded(executable, args, root, mode, timeoutMs = 3000) {
  return new Promise(resolve => {
    let bytes = 0, output = '', outcome = null, done = false;
    const child = spawn(executable, args, { cwd: path.join(root, 'work'), env: environment(root),
      stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const stop = reason => {
      if (outcome) return;
      outcome = reason;
      if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } }
    };
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    const collect = data => {
      bytes += data.length;
      if (bytes > LIMIT) { stop('output-limit'); output = ''; return; }
      if (!outcome) output += data.toString('utf8');
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const finish = code => {
      if (done) return;
      done = true; clearTimeout(timer);
      const status = outcome ?? (code === 0 ? 'ok' : 'failed');
      resolve({ status, bytes, ...(status === 'ok' ? summarize(output, mode) : {}) });
      output = '';
    };
    child.on('error', () => { outcome = 'spawn-failed'; finish(null); });
    child.on('close', finish);
  });
}
/** Resolve only known installation links; bound metadata calls and links, no directory enumeration. */
export async function resolveEntry(entry = ENTRY, install = INSTALL) {
  let target = entry, links = 0, calls = 0;
  const allowed = value => value === entry || value === install || value.startsWith(install + '/');
  while (true) {
    const parts = target.split('/').filter(Boolean);
    let current = '/', redirected = false, result;
    for (let i = 0; i < parts.length; i++) {
      current = path.join(current, parts[i]);
      if (++calls > 128) throw new Error('metadata-limit');
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        if (++links > 8) throw new Error('link-limit');
        const link = await readlink(current);
        target = path.resolve(path.dirname(current), link, ...parts.slice(i + 1));
        if (!allowed(target)) throw new Error('outside-installation');
        redirected = true; break;
      }
      if (i < parts.length - 1 && !stat.isDirectory()) throw new Error('not-directory');
      result = stat;
    }
    if (redirected) continue;
    if (!result?.isFile() || !(result.mode & 0o111) || (result.mode & 0o022)) throw new Error('unsafe-program');
    return { executable: target, identity: [result.dev, result.ino, result.size, result.mtimeMs, result.ctimeMs, result.mode].join(':') };
  }
}
export async function check() {
  const before = await resolveEntry();
  await mkdir(ROOT, { mode: 0o700 }); // exclusive, never reuse a previous run
  for (const name of ['home', 'config', 'cache', 'tmp', 'work']) await mkdir(path.join(ROOT, name), { mode: 0o700 });
  const result = {};
  for (const mode of ['version', 'help']) {
    const now = await resolveEntry();
    if (now.executable !== before.executable || now.identity !== before.identity) throw new Error('program-changed');
    result[mode] = await runBounded(now.executable, [`--${mode}`], ROOT, mode);
    if (result[mode].status !== 'ok' || (mode === 'version' && !result[mode].version)) break;
  }
  await writeFile(path.join(ROOT, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--run-authorized-check' || process.argv.length !== 3) {
    console.error('Explicit authorized-check argument required.'); process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await check())); }
    catch { console.error('CHECK_STOPPED; no daily configuration changed'); process.exitCode = 1; }
  }
}
