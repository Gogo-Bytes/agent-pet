import { describe, expect, test } from 'vitest';
import { classifyElectronSmokeResult, createElectronLauncherEnv, requiredLifecycle, safeDiagnostics } from './electron-managed-worker-smoke-result.mjs';

const evidence = {
  evidence: 'B4.3 electron main worker smoke',
  electron: '36.9.5',
  node: '22.15.0',
  napi: '8',
  arch: 'arm64',
  addon: '/fixed/repository/addon.node',
  addonValidation: 'loaded by Darwin Worker backend; native version=1,napi=8 and method set validated by DarwinFilesPort',
  lifecycle: requiredLifecycle,
  mainHeartbeatsDuringBoundedWorkerInit: 25,
  workerInitElapsedMs: 251,
  pauseMeaning: 'bounded cooperative Worker delay; heartbeat window spans Worker initialization and pause, not native syscall blocking/cancellation/fault injection',
};
const passOutput = `B4.3 PASS EVIDENCE: ${JSON.stringify(evidence)}\nB4.3 PASS: Electron Main and Worker smoke completed\n`;

describe('electron launcher result seam', () => {
  test('removes inherited Electron distribution and Node-mode overrides', () => {
    const env = createElectronLauncherEnv({
      KEEP_FOR_CHILD: 'yes',
      ELECTRON_OVERRIDE_DIST_PATH: '/arbitrary/electron',
      ELECTRON_RUN_AS_NODE: '1',
    });
    expect(env).toEqual({ KEEP_FOR_CHILD: 'yes' });
  });

  test('requires structured PASS evidence and exit 0', () => {
    expect(classifyElectronSmokeResult({ status: 0, stdout: passOutput, stderr: '' }).kind).toBe('pass');
  });

  test('keeps fixed-resource SKIP distinct from PASS and non-success', () => {
    expect(classifyElectronSmokeResult({ status: 2, stdout: 'B4.3 SKIP: fixed Worker/native resource unavailable\n', stderr: '' })).toMatchObject({ kind: 'skip', exitCode: 2 });
  });

  test('rejects an exit-0 child without a marker', () => {
    expect(classifyElectronSmokeResult({ status: 0, stdout: '', stderr: '' })).toMatchObject({ kind: 'fail', exitCode: 1 });
  });

  test('rejects nonzero even when a PASS marker was printed', () => {
    expect(classifyElectronSmokeResult({ status: 1, stdout: passOutput, stderr: '' })).toMatchObject({ kind: 'fail', exitCode: 1 });
  });

  test('classifies launcher timeout as bounded nonzero failure', () => {
    expect(classifyElectronSmokeResult({ status: null, error: { code: 'ETIMEDOUT' }, stdout: '', stderr: '' })).toMatchObject({ kind: 'timeout', exitCode: 124 });
  });

  test('bounded diagnostics omit child error/token lines', () => {
    expect(safeDiagnostics({ stdout: 'B4.3 FAIL: secret-token=do-not-print\nB4.3 STAGE app-whenReady-start t=12\n' })).toEqual(['B4.3 STAGE app-whenReady-start t=12']);
  });
});
