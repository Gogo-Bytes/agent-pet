import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startCodexHookReceiver } from '../transport.js';
import { summarizeHooks, type HookStatusSummary } from './hook-status.js';

/** Fixed categories only. Arbitrary error messages never leave this function. */
export function classifyRpcError(error: unknown): { kind: string; code: number | null } {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return { kind: 'unknown', code: null };
  const value = error as Record<string, unknown>;
  const code = typeof value.code === 'number' && Number.isSafeInteger(value.code) && Math.abs(value.code) <= 2147483647 ? value.code : null;
  const text = typeof value.message === 'string' ? value.message.slice(0, 8192) : '';
  const kind = code === -32602 ? 'invalid-params' : code === -32601 ? 'unsupported-method' :
    /hook/i.test(text) && /trust/i.test(text) ? 'hook-trust-required' :
    /(?:not authenticated|authentication required|missing.*api.?key|please.*(?:log|sign).?in)/i.test(text) ? 'authentication-required' :
    /sandbox/i.test(text) ? 'sandbox-rejected' : 'unknown';
  return { kind, code };
}

/** Test-only probe. The launched server creates one empty isolated thread; never starts a turn.
 * A new app-server is used only to test its own hooks, not to observe another running CLI.
 */
export async function probeCodexStart(options: {
  root: string;
  launch(env: Record<string, string>): ChildProcessWithoutNullStreams;
  timeoutMs?: number;
  sandboxMode?: 'read-only' | 'readOnly';
  mode?: 'start' | 'hooks-only';
  expectedHookCommand?: string;
}) {
  const token = randomBytes(32).toString('hex'), runId = randomUUID();
  let child: ChildProcessWithoutNullStreams | undefined, live = false, stopping = false;
  const events: { kind: string; hasTurnId: boolean; hasChildId: boolean; source?: string }[] = [];
  const receiver = await startCodexHookReceiver({ token, acceptRun: id => live && id === runId,
    onFact: ({ fact }) => {
      if (events.length < 32) events.push({ kind: fact.kind, hasTurnId: Boolean(fact.turnId), hasChildId: Boolean(fact.childId),
        ...(fact.kind === 'session-started' ? { source: fact.source } : {}) });
    } });
  const result = { initialized: false, threadStarted: false, rpcError: false,
    serverRequest: false, hookStatus: null as HookStatusSummary | null, readOnlyMode: options.sandboxMode ?? 'readOnly', rpcErrorKind: 'none', rpcErrorCode: null as number | null, outcome: 'closed', stdoutBytes: 0, stderrBytes: 0, events };
  try {
    child = options.launch({ AGENT_PET_CODEX_URL: receiver.url, AGENT_PET_CODEX_TOKEN: token, AGENT_PET_CODEX_RUN_ID: runId });
    live = true;
    const proc = child;
    await new Promise<void>(resolve => {
      let buffer = '', settled = false;
      let force: ReturnType<typeof setTimeout> | undefined;
      let termination: Promise<void> = Promise.resolve(), terminated: (() => void) | undefined;
      const finish = () => {
        if (settled) return; settled = true; clearTimeout(deadline);
        if (!stopping) stop('closed');
        // The group leader may close before a detached-stdio descendant exits.
        // Keep the escalation until the whole original group is gone.
        if (proc.pid) {
          try { process.kill(-proc.pid, 0); }
          catch { clearTimeout(force); terminated?.(); }
        }
        void termination.then(resolve);
      };
      const stop = (outcome: string) => {
        if (stopping) return; stopping = true; result.outcome = outcome;
        termination = new Promise<void>(done => { terminated = done; });
        // Only this explicitly created child process group can be stopped.
        if (proc.pid) { try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* exited */ } }
        force = setTimeout(() => {
          if (proc.pid) { try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* exited */ } }
          proc.stdin.destroy(); proc.stdout.destroy(); proc.stderr.destroy();
          terminated?.(); finish();
        }, 1000);
      };
      const send = (value: unknown) => { if (!stopping) proc.stdin.write(JSON.stringify(value) + '\n'); };
      proc.stdin.on('error', () => stop('input-closed'));
      const deadline = setTimeout(() => stop('timeout'), options.timeoutMs ?? 10000);
      proc.stderr.on('data', chunk => {
        result.stderrBytes += chunk.length;
        if (result.stdoutBytes + result.stderrBytes > 128 * 1024) stop('output-limit');
      });
      proc.stdout.on('data', chunk => {
        result.stdoutBytes += chunk.length;
        if (result.stdoutBytes + result.stderrBytes > 128 * 1024) { buffer = ''; stop('output-limit'); return; }
        buffer += chunk.toString('utf8');
        while (!stopping && buffer.includes('\n')) {
          const end = buffer.indexOf('\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let value: Record<string, unknown>;
          try { value = JSON.parse(line); } catch { stop('invalid-protocol'); return; }
          if (!value || typeof value !== 'object' || Array.isArray(value)) { stop('invalid-protocol'); return; }
          if (value.error && (value.id === 1 || value.id === 2 || value.id === 3)) {
            result.rpcError = true;
            const diagnostic = classifyRpcError(value.error);
            result.rpcErrorKind = diagnostic.kind; result.rpcErrorCode = diagnostic.code;
            stop('rpc-error'); return;
          }
          if (value.id === 1 && value.result && !result.initialized) {
            result.initialized = true;
            send({ method: 'initialized', params: {} });
            if (options.mode === 'hooks-only') {
              send({ id: 3, method: 'hooks/list', params: { cwds: [join(options.root, 'work')] } });
            } else {
              send({ id: 2, method: 'thread/start', params: { cwd: join(options.root, 'work'), approvalPolicy: 'never', sandbox: options.sandboxMode ?? 'readOnly' } });
            }
          } else if (value.id === 3 && value.result && options.mode === 'hooks-only') {
            const summary = options.expectedHookCommand && summarizeHooks(value.result, join(options.root, 'config/hooks.json'), options.expectedHookCommand);
            if (!summary) { stop('invalid-protocol'); return; }
            result.hookStatus = summary; stop('hooks-listed');
          } else if (value.id === 2 && value.result) {
            const thread = (value.result as { thread?: { id?: unknown } }).thread;
            if (!thread || typeof thread.id !== 'string' || !thread.id || thread.id.length > 256) { stop('invalid-protocol'); return; }
            result.threadStarted = true;
            // SessionStart is synchronous in our document; no arbitrary wait or turn request.
            stop('thread-started');
          } else if (value.method && value.id !== undefined) {
            result.serverRequest = true; stop('server-request');
          }
        }
      });
      proc.once('error', () => { stopping = true; result.outcome = 'spawn-failed'; live = false; finish(); });
      proc.once('exit', () => { live = false; });
      proc.once('close', () => { live = false; buffer = ''; finish(); });
      send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'agent_pet_isolated_check', version: '0.1.0' },
        ...(options.mode === 'hooks-only' ? { capabilities: { experimentalApi: true } } : {}) } });
    });
  } finally {
    live = false; await receiver.stop();
  }
  // Never persist native IDs, arbitrary server text, stdout/stderr or credentials.
  await writeFile(join(options.root, options.mode === 'hooks-only' ? 'hook-status.json' : 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
  return result;
}
export const LOOPBACK_ONLY_PROFILE = '(version 1)(allow default)(deny network*)(allow network-outbound (remote ip "localhost:*"))(allow network-inbound (local ip "localhost:*"))';
export function launchIsolatedCodex(executable: string, root: string, environment: Record<string, string>, hookEnvironment: Record<string, string>) {
  return spawn('/usr/bin/sandbox-exec', ['-p', LOOPBACK_ONLY_PROFILE, executable, 'app-server'], {
    cwd: join(root, 'work'), env: { ...environment, ...hookEnvironment }, stdio: ['pipe', 'pipe', 'pipe'], detached: true,
  });
}
