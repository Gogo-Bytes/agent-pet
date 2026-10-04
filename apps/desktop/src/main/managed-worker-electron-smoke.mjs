import { app } from 'electron';
import { register } from 'node:module';
import { access, mkdir, rm } from 'node:fs/promises';
import { mkdtempSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// This file is a development/test-only Electron Main entry. It is not imported
// by index.ts, preload, renderer, or any production package export.
const startedAt = Date.now();
const stage = name => console.log(`B4.3 STAGE ${name} t=${Date.now() - startedAt}`);
stage('entry-load');
const loaderUrl = new URL('../../../../packages/adapter-pi/src/managed/worker/loader.mjs', import.meta.url);
const entryUrl = new URL('../../../../packages/adapter-pi/src/managed/worker/entry.mjs', import.meta.url);
const addonUrl = new URL('../../../../packages/adapter-pi/native/managed-darwin/out/managed-darwin.node', import.meta.url);
const fixtureParent = fileURLToPath(new URL('../../../../packages/adapter-pi/native/managed-darwin/', import.meta.url));
const fixtureBase = realpathSync(mkdtempSync(join(fixtureParent, '.d3-electron-smoke-')));
const runtimeFixture = realpathSync(mkdtempSync('/tmp/agent-pet-b43-runtime-'));
const cleanupFixture = () => Promise.all([
  rm(fixtureBase, { recursive: true, force: true }),
  rm(runtimeFixture, { recursive: true, force: true }),
]);
// Electron must never initialize its default profile before this is set.
app.setPath('userData', join(fixtureBase, 'user-data'));
app.setPath('sessionData', join(fixtureBase, 'session-data'));
stage('disposable-paths-set');

stage('module-register-start');
register(loaderUrl, import.meta.url);
stage('module-register-complete');

stage('app-whenReady-start');

async function run() {
  stage('app-whenReady-complete');
  stage('service-import-start');
  const { openWorkerDarwinManagedCore } = await import('../../../../packages/adapter-pi/src/managed/service.ts');
  const { fixturePolicy } = await import('../../../../packages/adapter-pi/src/managed/test-policy.ts');
  stage('service-import-complete');
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    console.log(`B4.3 SKIP: Electron Darwin arm64 required (platform=${process.platform}, arch=${process.arch})`);
    await cleanupFixture();
    app.exit(0);
    return 'skip';
  }
  try {
    await Promise.all([access(fileURLToPath(loaderUrl)), access(fileURLToPath(entryUrl)), access(fileURLToPath(addonUrl))]);
  } catch {
    await cleanupFixture();
    console.log('B4.3 SKIP: fixed Worker/native resource unavailable');
    app.exit(0);
    return 'skip';
  }
  stage('fixed-resources-validated');
  const roots = { storageRoot: join(fixtureBase, 'storage'), runtimeRoot: join(runtimeFixture, 'r') };
  await mkdir(roots.storageRoot, { mode: 0o700 });
  await mkdir(roots.runtimeRoot, { mode: 0o700 });
  stage('fixture-roots-created');
  const policy = await fixturePolicy(roots);
  stage('fixture-policy-ready');
  let heartbeat = 0;
  const heartbeatTimer = setInterval(() => { heartbeat++; }, 10);
  const initStarted = Date.now();
  const heartbeatAtInitStart = heartbeat;
  let core;
  let completed = false;
  try {
    stage('worker-init-start');
    core = await openWorkerDarwinManagedCore({
      roots, policy, initialize: true, publish() {}, testPauseMs: 250, testSmokeStages: true,
    });
    stage('worker-init-complete');
    const initElapsedMs = Date.now() - initStarted;
    const initHeartbeats = heartbeat - heartbeatAtInitStart;
    if (initHeartbeats < 3) throw new Error(`main-event-loop-unresponsive:${initHeartbeats}`);
    const pending = await core.store.prepareTarget();
    await core.store.enableTarget(pending.targetId, pending.epoch, core.store.snapshot().revision);
    stage('start-start');
    await core.start();
    stage('start-complete');
    await core.store.revokeTarget(pending.targetId, pending.epoch, core.store.snapshot().revision);
    stage('stop-start');
    await core.stop();
    stage('stop-complete');
    console.log(`B4.3 PASS EVIDENCE: ${JSON.stringify({
      evidence: 'B4.3 electron main worker smoke',
      electron: process.versions.electron,
      node: process.versions.node,
      napi: '8',
      runtimeNapi: process.versions.napi,
      arch: process.arch,
      addonValidation: 'loaded by Darwin Worker backend; native version=1,napi=8 and method set validated by DarwinFilesPort',
      lifecycle: 'native init/write/read/release/remove/start/stop completed',
      mainHeartbeatsDuringBoundedWorkerInit: initHeartbeats,
      workerInitElapsedMs: initElapsedMs,
      pauseMeaning: 'bounded cooperative Worker delay; heartbeat window spans Worker initialization and pause, not native syscall blocking/cancellation/fault injection',
    })}`);
    completed = true;
  } finally {
    clearInterval(heartbeatTimer);
    if (completed) await cleanupFixture();
  }
  app.exit(0);
}

app.whenReady().then(async () => {
  try {
    if (!process.versions.electron || process.type !== 'browser' || process.env.ELECTRON_RUN_AS_NODE) {
      throw new Error(`not-electron-main: electron=${process.versions.electron ?? 'missing'} type=${process.type ?? 'missing'} runAsNode=${process.env.ELECTRON_RUN_AS_NODE ?? 'unset'}`);
    }
    const result = await run();
    if (result !== 'skip') console.log('B4.3 PASS: Electron Main and Worker smoke completed');
  } catch {
    console.error('B4.3 FAIL: Electron smoke failed');
    console.error('B4.3 fixture preserved: <temporary fixture retained for diagnosis>');
    app.exit(1);
  }
}, () => {
  console.error('B4.3 FAIL: Electron app readiness failed');
  console.error('B4.3 fixture preserved: <temporary fixture retained for diagnosis>');
  app.exit(1);
});
