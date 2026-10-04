import { access, mkdtemp, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const addon = join(root, 'packages/adapter-pi/native/managed-darwin/out/managed-darwin.node');
const harness = join(root, 'apps/desktop/src/main/managed-worker-electron-staged-smoke.mjs');
const electronLauncher = join(root, 'node_modules/.bin/electron');
if (process.platform !== 'darwin' || process.arch !== 'arm64') { console.log(`B4.4a SKIP: Darwin arm64 required (platform=${process.platform}, arch=${process.arch})`); process.exit(2); }
try { await access(addon); await access(harness); await access(electronLauncher); const info = JSON.parse(await readFile(require.resolve('electron/package.json'), 'utf8')); if (info.version !== '36.9.5') throw new Error('unexpected Electron version'); } catch { console.error('B4.4a FAIL: fixed Electron/native prerequisite unavailable'); process.exit(1); }
const disposableHome = await mkdtemp('/tmp/agent-pet-b44-home-');
const env = { ...process.env, HOME: disposableHome, XDG_CONFIG_HOME: join(disposableHome, 'config'), XDG_CACHE_HOME: join(disposableHome, 'cache'), XDG_DATA_HOME: join(disposableHome, 'data') };
delete env.ELECTRON_OVERRIDE_DIST_PATH; delete env.ELECTRON_RUN_AS_NODE;
const timeoutMs = 20_000;
const child = spawn(electronLauncher, [harness], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = ''; let stderr = ''; child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); }); child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
const timer = setTimeout(() => { child.kill('SIGTERM'); console.error('B4.4a TIMEOUT: Electron staged smoke exceeded 20s'); process.exitCode = 124; }, timeoutMs);
child.on('close', code => { clearTimeout(timer); const pass = code === 0 && stdout.includes('B4.4a PASS EVIDENCE:') && stdout.includes('B4.4a PASS: staged-resource evidence only'); const skip = stdout.includes('B4.4a SKIP:'); if (process.exitCode === 124) return; if (skip) { console.error('B4.4a SKIP: prerequisite unavailable'); process.exitCode = 2; } else if (!pass) { console.error(`B4.4a FAIL: missing structured staged-resource evidence (exit=${code})`); process.exitCode = 1; } else { console.log('B4.4a PASS: explicit staged-resource evidence verified'); process.exitCode = 0; } });
