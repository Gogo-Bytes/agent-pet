import { lstat, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { environment, resolveEntry } from './cli-check.mjs';
export const ROOT = '/tmp/agent-pet-codex-start-20261019-5f92c8-r2';
const BASE_CONFIG = 'cli_auth_credentials_store = "ephemeral"\ncheck_for_update_on_startup = false\n';
/** Codex saves this harmless UI detection result before its interactive startup completes. */
export function isExpectedIsolatedConfig(text) {
  return text === BASE_CONFIG || text === BASE_CONFIG + '\n[tui]\nscreen_reader_detection_done = true\n';
}
/** Resume an interrupted preparation only when its existing own helper is byte-identical. */
export async function writeOrVerifyHelper(file, content, resume = false) {
  try { await writeFile(file, content, {flag:'wx',mode:0o600}); }
  catch(error) {
    if(error.code !== 'EEXIST' || !resume) throw error;
    const stat = await lstat(file);
    if(!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() ||
      (stat.mode & 0o7777) !== 0o600 || stat.size > 256 * 1024 ||
      await readFile(file,'utf8') !== content) throw new Error('Existing helper changed');
  }
}
export async function prepareIsolated(prefix) {
  if (!['status', 'review', 'review-r1', 'review-auth'].includes(prefix)) throw new Error('Invalid isolated operation');
  const before = await resolveEntry();
  for (const name of ['', 'runtime', 'config', 'work', 'home', 'cache', 'tmp']) {
    const stat = await lstat(join(ROOT, name));
    if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o7777) !== 0o700) throw new Error('Unsafe isolated directory');
  }
  const compile = async (source, name) => {
    const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, ssr: resolve(source),
      outDir: join(ROOT, 'runtime'), emptyOutDir: false, rollupOptions: { output: { format: 'cjs', entryFileNames: name } } } });
    const item = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry);
    if (!item) throw new Error('Missing standalone entry'); return item.code;
  };
  const readOwn = async (file, limit) => {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || stat.size > limit || (stat.mode & 0o7777) !== 0o600) throw new Error('Unsafe isolated file');
    return readFile(file, 'utf8');
  };
  const observer = await compile('integrations/codex-hooks/command-entry.ts', 'observer.cjs');
  const installed = await readOwn(join(ROOT, 'runtime/observer.cjs'), 256 * 1024);
  const hash = text => createHash('sha256').update(text).digest('hex');
  if (hash(observer) !== hash(installed)) throw new Error('Observer changed');
  const documents = await compile('integrations/codex-hooks/hook-source.ts', `${prefix}-documents.cjs`);
  await writeOrVerifyHelper(join(ROOT, `runtime/${prefix}-documents.cjs`), documents, prefix === 'review-r1' || prefix === 'review-auth');
  const require = createRequire(import.meta.url);
  const { createCodexHookDocument } = require(join(ROOT, `runtime/${prefix}-documents.cjs`));
  const expected = createCodexHookDocument(process.execPath, join(ROOT, 'runtime/observer.cjs'));
  if (await readOwn(join(ROOT, 'config/hooks.json'), 64 * 1024) !== expected ||
    !isExpectedIsolatedConfig(await readOwn(join(ROOT, 'config/config.toml'), 1024))) throw new Error('Isolated configuration changed');
  const checker = await compile('integrations/codex-hooks/test-support/native-start.ts', `${prefix}-check.cjs`);
  await writeOrVerifyHelper(join(ROOT, `runtime/${prefix}-check.cjs`), checker, prefix === 'review-r1' || prefix === 'review-auth');
  const now = await resolveEntry();
  if (now.executable !== before.executable || now.identity !== before.identity) throw new Error('Program changed');
  const { probeCodexStart, launchIsolatedCodex, LOOPBACK_ONLY_PROFILE, hasReviewedOwnHooks } = require(join(ROOT, `runtime/${prefix}-check.cjs`));
  return { root: ROOT, executable: now.executable, identity: now.identity, environment: environment(ROOT),
    probe: probeCodexStart, hasReviewedOwnHooks, launch: launchIsolatedCodex, profile: LOOPBACK_ONLY_PROFILE,
    command: JSON.parse(expected).hooks.SessionStart[0].hooks[0].command,
    async verify() {
      const current = await resolveEntry();
      if (current.executable !== before.executable || current.identity !== before.identity ||
        await readOwn(join(ROOT, 'runtime/observer.cjs'), 256 * 1024) !== installed ||
        await readOwn(join(ROOT, 'config/hooks.json'), 64 * 1024) !== expected ||
        !isExpectedIsolatedConfig(await readOwn(join(ROOT, 'config/config.toml'), 1024))) throw new Error('Isolated target changed');
    } };
}
