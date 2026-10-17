import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { startClaudeHookReceiver } from './transport.js';

export type ClaudeInvocationPresence = {
  runId: string;
  kind: 'child-started' | 'hook-observed' | 'child-ended';
};
export type ClaudeInvocationEnd = {
  runId: string;
  /** An exit is lifetime evidence only, never successful task completion. */
  outcome: 'child-ended' | 'spawn-failed';
  observation: 'closed' | 'unavailable';
  /** Native process metadata only; never a task success/failure classification. */
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

/** For the explicitly user-invoked terminal launcher only; never Main/UI.
 * Holds one direct child privately. No prompts, signals, transcript/config reads,
 * task state, persisted runtime, registration protocol or automatic retries.
 * Inherited terminal stdio preserves interactive CLI behavior; signal forwarding,
 * process groups and detached/re-exec descendants are outside this boundary.
 */
export async function observeClaudeInvocation(options: {
  command: string;
  args: readonly string[];
  pluginDirectory: string;
  cwd?: string;
  environment?: NodeJS.ProcessEnv;
  /** Synchronous enum-only reporting. Failure retires observation, never the child. */
  onPresence(event: ClaudeInvocationPresence): undefined;
}): Promise<{
  runId: string;
  completed: Promise<ClaudeInvocationEnd>;
  /** Disconnect observation only. Does not stop, signal or wait for the child. */
  stopObserving(): Promise<void>;
}> {
  if (!isAbsolute(options.command) || !isAbsolute(options.pluginDirectory) ||
      [options.command, options.pluginDirectory, ...options.args].some(value => typeof value !== 'string' || value.includes('\0'))) {
    throw new Error('Invalid Claude invocation configuration');
  }
  const runId = randomUUID(), token = randomBytes(32).toString('hex');
  let child: ChildProcess | undefined, spawned = false, retired = false, observed = false;
  let observationFailed = false, shutdown: Promise<void> | undefined;
  let resolveEnd!: (result: ClaudeInvocationEnd) => void;
  const completed = new Promise<ClaudeInvocationEnd>(resolve => { resolveEnd = resolve; });
  let receiver: Awaited<ReturnType<typeof startClaudeHookReceiver>>;
  const live = () => !retired && spawned && child !== undefined && child.exitCode === null && child.signalCode === null;
  const stopObserving = () => {
    retired = true;
    // Publish shutdown before an asynchronously started close can reenter callbacks.
    shutdown ??= Promise.resolve().then(() => receiver.stop()).catch(() => { observationFailed = true; });
    return shutdown;
  };
  const report = (kind: ClaudeInvocationPresence['kind']) => {
    try {
      const result: unknown = options.onPresence({ runId, kind });
      if (result === undefined) return;
      // JS callers can violate the synchronous callback contract. Never leave a
      // rejected thenable unhandled or expose its potentially secret error text.
      void Promise.resolve(result).catch(() => {});
    } catch { /* Fixed failure state below, no error content escapes. */ }
    observationFailed = true;
    void stopObserving();
  };
  try {
    receiver = await startClaudeHookReceiver({ token,
      acceptRun: candidate => candidate === runId && live(),
      onFact: ({ fact }) => {
        if (!live() || observed || fact.kind !== 'session-started' || fact.childId !== undefined) return;
        observed = true;
        report('hook-observed');
      },
    });
  } catch { throw new Error('Claude observation receiver unavailable'); }

  let ended = false;
  const finish = (outcome: ClaudeInvocationEnd['outcome'], exitCode: number | null = null, signal: NodeJS.Signals | null = null) => {
    if (ended) return;
    ended = true;
    retired = true;
    report('child-ended');
    void stopObserving().then(() => resolveEnd({ runId, outcome,
      observation: observationFailed ? 'unavailable' : 'closed', exitCode, signal }));
  };
  try {
    // User environment survives except every Agent Pet credential/control key.
    const environment: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(options.environment ?? process.env)) {
      if (!key.startsWith('AGENT_PET_')) environment[key] = value;
    }
    environment.AGENT_PET_CLAUDE_URL = receiver.url;
    environment.AGENT_PET_CLAUDE_TOKEN = token;
    environment.AGENT_PET_CLAUDE_RUN_ID = runId;
    const args = [...options.args];
    // Append in the option section so '--' never converts our flags to prompt text.
    const separator = args.indexOf('--');
    args.splice(separator < 0 ? args.length : separator, 0, '--plugin-dir', options.pluginDirectory);
    child = spawn(options.command, args, { ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env: environment, shell: false, stdio: 'inherit' });
    child.once('spawn', () => { spawned = true; report('child-started'); });
    child.once('exit', (code, signal) => finish('child-ended', code, signal));
    child.on('error', () => {
      void stopObserving();
      // A later process error is not proof of exit; only failed spawn has no child lifetime.
      if (!spawned) finish('spawn-failed');
    });
  } catch { finish('spawn-failed'); }
  return { runId, completed, stopObserving };
}
