import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const requestedOutput = process.env.AGENT_PET_BUILD_DIR;
const output = requestedOutput
  ? resolve(requestedOutput)
  : mkdtempSync(join(tmpdir(), 'agent-pet-m5-'));

if (existsSync(output) && readdirSync(output).length > 0) {
  throw new Error(`Refusing to package into a non-empty directory: ${output}`);
}
mkdirSync(output, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, AGENT_PET_BUILD_DIR: output } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('pnpm', ['--filter', '@agent-pet/desktop', 'build']);
run(resolve(root, 'node_modules/.bin/electron-builder'), [
  '--config',
  'apps/desktop/electron-builder.config.mjs',
  '--mac',
  '--arm64',
  '--dir',
  '--publish',
  'never',
]);

const appPath = join(output, 'mac-arm64', 'Agent Pet.app');
if (!statSync(appPath, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error(`Packaging completed without an app bundle: ${appPath}`);
}
console.log(`AGENT_PET_APP_PATH=${appPath}`);
