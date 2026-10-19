import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { environment, resolveEntry } from './cli-check.mjs';
const ROOT = '/tmp/agent-pet-codex-start-20261019-5f92c8';
if (process.argv[2] !== '--run-authorized-check' || process.argv.length !== 3) {
  console.error('Explicit authorized-check argument required.'); process.exitCode = 1;
} else {
  try {
    const before = await resolveEntry();
    await mkdir(ROOT, { mode: 0o700 });
    for (const name of ['home', 'config', 'cache', 'tmp', 'work', 'runtime']) await mkdir(join(ROOT, name), { mode: 0o700 });
    const compile = async (source, name) => {
      await build({ configFile: false, logLevel: 'silent', build: { ssr: resolve(source), outDir: join(ROOT, 'runtime'), emptyOutDir: false,
        rollupOptions: { output: { format: 'cjs', entryFileNames: name } } } });
      await chmod(join(ROOT, 'runtime', name), 0o600);
    };
    await compile('integrations/codex-hooks/command-entry.ts', 'observer.cjs');
    await compile('integrations/codex-hooks/hook-source.ts', 'documents.cjs');
    await compile('integrations/codex-hooks/test-support/native-start.ts', 'check.cjs');
    const require = createRequire(import.meta.url);
    const { createCodexHookDocument } = require(join(ROOT, 'runtime/documents.cjs'));
    await writeFile(join(ROOT, 'config/hooks.json'), createCodexHookDocument(process.execPath, join(ROOT, 'runtime/observer.cjs')), { flag: 'wx', mode: 0o600 });
    await writeFile(join(ROOT, 'config/config.toml'), 'cli_auth_credentials_store = "ephemeral"\ncheck_for_update_on_startup = false\n', { flag: 'wx', mode: 0o600 });
    const now = await resolveEntry();
    if (now.executable !== before.executable || now.identity !== before.identity) throw new Error('program-changed');
    const { probeCodexStart, launchIsolatedCodex } = require(join(ROOT, 'runtime/check.cjs'));
    const result = await probeCodexStart({ root: ROOT,
      launch: hookEnv => launchIsolatedCodex(now.executable, ROOT, environment(ROOT), hookEnv) });
    console.log(JSON.stringify(result));
  } catch { console.error('CHECK_STOPPED; daily configuration untouched'); process.exitCode = 1; }
}
