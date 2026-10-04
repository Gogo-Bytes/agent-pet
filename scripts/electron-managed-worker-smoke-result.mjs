const PASS_EVIDENCE_PREFIX = 'B4.3 PASS EVIDENCE: ';
const ELECTRON_LAUNCHER_OVERRIDE_VARIABLES = ['ELECTRON_OVERRIDE_DIST_PATH', 'ELECTRON_RUN_AS_NODE'];

/** Build the fixed launcher environment without inherited Electron selectors. */
export function createElectronLauncherEnv(source) {
  const env = { ...source };
  for (const name of ELECTRON_LAUNCHER_OVERRIDE_VARIABLES) delete env[name];
  return env;
}
const STAGE_PREFIX = 'B4.3 STAGE ';

const requiredLifecycle = 'native init/write/read/release/remove/start/stop completed';

function lines(value) {
  return String(value ?? '').split(/\r?\n/).filter(Boolean);
}

function passEvidence(stdout) {
  const evidenceLines = lines(stdout).filter(line => line.startsWith(PASS_EVIDENCE_PREFIX));
  if (evidenceLines.length !== 1) return undefined;
  try {
    const evidence = JSON.parse(evidenceLines[0].slice(PASS_EVIDENCE_PREFIX.length));
    if (!evidence || evidence.evidence !== 'B4.3 electron main worker smoke' || evidence.electron !== '36.9.5' ||
      typeof evidence.node !== 'string' || evidence.node.length === 0 || evidence.napi !== '8' ||
      evidence.arch !== 'arm64' || evidence.lifecycle !== requiredLifecycle ||
      typeof evidence.addonValidation !== 'string' || !evidence.addonValidation.startsWith('loaded by Darwin Worker backend;') ||
      !Number.isSafeInteger(evidence.mainHeartbeatsDuringBoundedWorkerInit) || evidence.mainHeartbeatsDuringBoundedWorkerInit < 3 ||
      !Number.isSafeInteger(evidence.workerInitElapsedMs) || evidence.workerInitElapsedMs < 0 ||
      !String(evidence.pauseMeaning).startsWith('bounded cooperative Worker delay;')) return undefined;
    return evidence;
  } catch {
    return undefined;
  }
}

/** Classifies the real child-process result; exit 0 alone is never PASS. */
export function classifyElectronSmokeResult(result) {
  if (result?.error?.code === 'ETIMEDOUT' || result?.timedOut === true) {
    return { kind: 'timeout', exitCode: 124, diagnostics: ['Electron smoke exceeded its bounded launcher timeout'] };
  }
  if (result?.error) return { kind: 'fail', exitCode: 1, diagnostics: ['Electron launcher error'] };

  const stdout = String(result?.stdout ?? '');
  const stderr = String(result?.stderr ?? '');
  const skip = [...lines(stdout), ...lines(stderr)].find(line => line.startsWith('B4.3 SKIP:'));
  // SKIP is a structured diagnostic outcome, but always non-acceptance.
  if (skip) return { kind: 'skip', exitCode: 2, diagnostics: ['B4.3 SKIP: fixed smoke prerequisites unavailable'] };
  if (result?.status !== 0) return { kind: 'fail', exitCode: result?.status > 0 ? result.status : 1, diagnostics: ['Electron child exited nonzero'] };
  const evidence = passEvidence(stdout);
  if (!evidence || !lines(stdout).some(line => line === 'B4.3 PASS: Electron Main and Worker smoke completed')) {
    return { kind: 'fail', exitCode: 1, diagnostics: ['B4.3 FAIL: missing structured PASS evidence'] };
  }
  return { kind: 'pass', exitCode: 0, diagnostics: ['B4.3 PASS: explicit Electron/runtime/arch/lifecycle evidence verified'] };
}

/** Keep child diagnostics bounded and limited to non-sensitive stage/result signals. */
export function safeDiagnostics(result, maxLines = 80) {
  const output = [...lines(result?.stdout), ...lines(result?.stderr)];
  return output.filter(line => line.startsWith(STAGE_PREFIX)).slice(-maxLines);
}

export { requiredLifecycle };
