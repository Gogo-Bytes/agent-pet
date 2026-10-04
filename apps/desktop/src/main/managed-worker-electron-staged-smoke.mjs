import { app } from 'electron';
import ts from 'typescript';
import { builtinModules } from 'node:module';
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { access, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const startedAt = Date.now();
const stages = new Set();
const stage = name => { stages.add(name); console.log(`B4.4a STAGE ${name} t=${Date.now() - startedAt}`); };
const repo = realpathSync(fileURLToPath(new URL('../../../../', import.meta.url)));
const sourceRoot = join(repo, 'packages/adapter-pi/src');
const managedSource = join(repo, 'packages/adapter-pi/src/managed');
const workerSource = join(managedSource, 'worker');
const nativeSource = join(repo, 'packages/adapter-pi/native/managed-darwin/out/managed-darwin.node');
const loaderUrl = new URL('../../../../packages/adapter-pi/src/managed/worker/loader.mjs', import.meta.url);
register(loaderUrl, import.meta.url);

const profileRoot = realpathSync(mkdtempSync('/tmp/agent-pet-b44-profile-'));
app.setPath('userData', join(profileRoot, 'user-data'));
app.setPath('sessionData', join(profileRoot, 'session-data'));
stage('entry-load');

const importSpecifiers = source => [...source.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
async function resolveLocal(source) {
  for (const candidate of [source, source.replace(/\.js$/, '.ts'), `${source}.ts`, `${source}.js`]) {
    try { const stat = await lstat(candidate); if (stat.isFile() && !stat.isSymbolicLink()) return candidate; } catch {}
  }
  return undefined;
}
async function collectClosure() {
  const found = new Set(); const pending = [join(workerSource, 'entry.ts')];
  while (pending.length) {
    const source = pending.pop(); if (found.has(source)) continue;
    const stat = await lstat(source); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`unsafe Worker closure: ${source}`);
    found.add(source);
    if (!source.startsWith(`${sourceRoot}/`)) throw new Error('closure-escape');
    const text = ts.transpileModule(await readFile(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    for (const specifier of importSpecifiers(text)) {
      if (builtinModules.includes(specifier) || specifier.startsWith('node:')) continue;
      if (!specifier.startsWith('.')) throw new Error(`unsupported closure import: ${specifier}`);
      const resolved = await resolveLocal(resolve(dirname(source), specifier));
      if (!resolved) throw new Error(`unresolved Worker closure import: ${specifier}`);
      pending.push(resolved);
    }
  }
  return [...found];
}
async function copyFileWithHash(source, target) {
  await mkdir(dirname(target), { recursive: true });
  const bytes = await readFile(source);
  await writeFile(target, bytes, { mode: 0o600 });
  return { path: target, sha256: createHash('sha256').update(bytes).digest('hex') };
}
async function stageResources() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') return undefined;
  await access(nativeSource);
  // Explicit model, NOT Electron's installed resources directory or a package.
  const stageRoot = realpathSync(mkdtempSync(join(repo, 'packages/adapter-pi/native/managed-darwin/.b44-staged-')));
  const resourcesRoot = stageRoot;
  const closure = await collectClosure();
  const entries = [];
  for (const source of closure) {
    const target = join(stageRoot, 'src', relative(sourceRoot, source));
    const copied = await copyFileWithHash(source, target);
    entries.push({ path: relative(resourcesRoot, target), sha256: copied.sha256 });
  }
  for (const source of [join(workerSource, 'entry.mjs'), join(workerSource, 'loader.mjs')]) {
    const target = join(stageRoot, 'src', relative(sourceRoot, source));
    const copied = await copyFileWithHash(source, target);
    entries.push({ path: relative(resourcesRoot, target), sha256: copied.sha256 });
  }
  // The TypeScript loader is part of the fixed loader closure; copy the local
  // package rather than resolving a repository/workspace dependency at runtime.
  const typescriptSource = join(repo, 'node_modules/typescript');
  const typescriptTarget = join(stageRoot, 'node_modules/typescript');
  // TypeScript's runtime entry is the self-contained lib/typescript.js CJS file.
  for (const path of ['package.json', 'lib/typescript.js']) await copyFileWithHash(join(typescriptSource, path), join(typescriptTarget, path));
  const walk = async directory => { const output = []; for (const name of await readdir(directory)) { const path = join(directory, name); const stat = await lstat(path); if (stat.isDirectory()) output.push(...await walk(path)); else if (stat.isFile() && !stat.isSymbolicLink()) output.push(path); } return output; };
  for (const path of await walk(typescriptTarget)) { const bytes = await readFile(path); entries.push({ path: relative(resourcesRoot, path), sha256: createHash('sha256').update(bytes).digest('hex') }); }
  const addon = await copyFileWithHash(nativeSource, join(stageRoot, 'native/managed-darwin.node'));
  const entry = entries.find(e => e.path === 'src/managed/worker/entry.mjs');
  const loader = entries.find(e => e.path === 'src/managed/worker/loader.mjs');
  const manifest = { schema: 1, electron: process.versions.electron, platform: process.platform, arch: process.arch,
    native: { version: 1, writeVersion: 1, napi: 8, addon: { path: addon.path.replace(`${resourcesRoot}/`, ''), sha256: addon.sha256 } },
    worker: { entry, loader, files: entries.filter(e => e !== entry && e !== loader) } };
  await writeFile(join(stageRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return { expectedPaths: entries.map(e => e.path).sort(), resourcesRoot, stageRoot, manifestPath: join(stageRoot, 'manifest.json'), workerEntry: pathToFileURL(join(stageRoot, 'src/managed/worker/entry.mjs')), nativeAddonPath: join(stageRoot, 'native/managed-darwin.node') };
}

async function run() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    console.log(`B4.4a SKIP: Darwin arm64 required (platform=${process.platform}, arch=${process.arch})`); return 'skip';
  }
  const staged = await stageResources();
  if (!staged) return 'skip';
  const { validateStagedResourceManifest, validateStagedResourceFiles } = await import('../../../../packages/adapter-pi/src/managed/worker/staged-resource.ts');
  const manifest = JSON.parse(await readFile(staged.manifestPath, 'utf8'));
  validateStagedResourceManifest(manifest, { electron: process.versions.electron, platform: process.platform, arch: process.arch }, staged.expectedPaths);
  await validateStagedResourceFiles(staged.resourcesRoot, manifest);
  const expectedActualResources = realpathSync(join(repo, 'node_modules/electron/dist/Electron.app/Contents/Resources'));
  if (realpathSync(process.resourcesPath) !== expectedActualResources || realpathSync(staged.stageRoot) !== staged.resourcesRoot) throw new Error('resources-root-model-mismatch');
  stage('manifest-validated');
  const { openWorkerDarwinManagedCore } = await import('../../../../packages/adapter-pi/src/managed/service.ts');
  const { fixturePolicy } = await import('../../../../packages/adapter-pi/src/managed/test-policy.ts');
  const runtimeRoot = realpathSync(mkdtempSync('/tmp/agent-pet-b44-runtime-'));
  const roots = { storageRoot: join(staged.stageRoot, 'fixture/storage'), runtimeRoot };
  await mkdir(roots.storageRoot, { recursive: true, mode: 0o700 }); await mkdir(roots.runtimeRoot, { recursive: true, mode: 0o700 });
  const policy = await fixturePolicy(roots); let heartbeat = 0; const timer = setInterval(() => heartbeat++, 10); let core; let completed = false;
  let confirmExit;
  let nativeAddonIdentity;
  const cleanExit = new Promise(resolve => { confirmExit = resolve; });
  try {
    core = await openWorkerDarwinManagedCore({ roots, policy, initialize: true, publish() {}, testPauseMs: 100,
      testSmokeStages: true, workerEntry: pathToFileURL(join(staged.resourcesRoot, manifest.worker.entry.path)),
      stagedNativeAddon: { root: staged.resourcesRoot, relativePath: manifest.native.addon.path, absolutePath: join(staged.resourcesRoot, manifest.native.addon.path) },
      testWorkerCleanExit: confirmExit, testWorkerIdentity: identity => { nativeAddonIdentity = identity; } });
    const target = await core.store.prepareTarget(); await core.store.enableTarget(target.targetId, target.epoch, core.store.snapshot().revision);
    await core.start(); await core.store.revokeTarget(target.targetId, target.epoch, core.store.snapshot().revision); await core.stop(); await cleanExit;
    if (heartbeat < 3) throw new Error(`main-event-loop-unresponsive:${heartbeat}`);
    const manifestAddonPath = join(staged.resourcesRoot, manifest.native.addon.path);
    if (!nativeAddonIdentity ||
        nativeAddonIdentity.requestedPath !== manifestAddonPath || nativeAddonIdentity.loadedPath !== manifestAddonPath ||
        nativeAddonIdentity.pathMatches !== true) throw new Error('staged-native-addon-identity-mismatch');
    completed = true;
    console.log(`B4.4a PASS EVIDENCE: ${JSON.stringify({ evidence: 'B4.4a staged-resource Electron Worker smoke', electron: process.versions.electron, platform: process.platform, arch: process.arch, resourceRootModel: staged.resourcesRoot, actualResourcesPath: process.resourcesPath, resourceClaim: 'explicit model only; actual resourcesPath asserted to installed Electron', cleanWorkerExit: true, stagedRoot: staged.stageRoot, manifest: 'validated before Worker import; copy-time SHA-256/version/arch/relative paths (not an approved digest)', nativeAddon: 'manifest-selected staged file; loader path identity checked', nativeAddonManifestPath: manifest.native.addon.path, lifecycle: 'staged Worker/native init/write/read/release/remove/start/stop completed', heartbeat })}`);
  } finally {
    clearInterval(timer);
    if (completed) { await rm(staged.stageRoot, { recursive: true, force: true }); await rm(runtimeRoot, { recursive: true, force: true }); await rm(profileRoot, { recursive: true, force: true }); }
    else console.error(`B4.4a STAGE-FAIL: staged root retained at ${staged.stageRoot}`);
  }
  return 'pass';
}
app.whenReady().then(async () => { try { const result = await run(); if (result === 'skip') app.exit(2); else { console.log('B4.4a PASS: staged-resource evidence only; no packaged or signing claim'); app.exit(0); } } catch (error) { console.error(`B4.4a FAIL: ${error instanceof Error ? error.message : 'staged smoke failed'}`); app.exit(1); } }, () => { console.error('B4.4a FAIL: Electron readiness failed'); app.exit(1); });
