import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyElectronSmokeResult, createElectronLauncherEnv, safeDiagnostics } from './electron-managed-worker-smoke-result.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const addon = join(root, 'packages/adapter-pi/native/managed-darwin/out/managed-darwin.node');
const harness = join(root, 'apps/desktop/src/main/managed-worker-electron-smoke.mjs');
const electronLauncher = join(root, 'node_modules/.bin/electron');
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.log(`B4.3 SKIP: Darwin arm64 required (platform=${process.platform}, arch=${process.arch})`);
  // A diagnostic prerequisite skip is explicit non-acceptance, never PASS.
  process.exit(2);
}
try {
  await access(addon);
} catch {
  console.log('B4.3 SKIP: built Darwin addon unavailable at the fixed repository path');
  process.exit(2);
}
try {
  await access(harness);
  await access(electronLauncher);
  // Resolve through the local workspace package, not a global/runtime install.
  const electronPackage = require.resolve('electron/package.json');
  const packageInfo = JSON.parse(await readFile(electronPackage, 'utf8'));
  if (packageInfo.version !== '36.9.5') throw new Error(`unexpected local Electron version: ${packageInfo.version}`);
} catch {
  console.error('B4.3 FAIL: local Electron resource unavailable');
  process.exit(1);
}
const env = createElectronLauncherEnv(process.env);
const timeoutMs = 20_000;
const result = spawnSync(electronLauncher, [harness], {
  cwd: root,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  encoding: 'utf8',
  timeout: timeoutMs,
  killSignal: 'SIGTERM',
  maxBuffer: 64 * 1024,
});
const verdict = classifyElectronSmokeResult(result);
for (const line of safeDiagnostics(result)) console.log(line);
for (const line of verdict.diagnostics) console.error(line);
process.exit(verdict.exitCode);
