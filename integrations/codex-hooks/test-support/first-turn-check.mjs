import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { prepareIsolated } from './isolated-context.mjs';
import { startMockProvider, mockProviderArguments } from './mock-provider.mjs';

/** Only invoked explicitly. Reuses reviewed hooks; no trust/config/auth writes. */
export async function checkFirstTurn() {
  const ctx = await prepareIsolated('review-first-turn');
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false,
    ssr: resolve('integrations/codex-hooks/transport.ts'), rollupOptions: { output: { format: 'cjs' } } } });
  const entry = (Array.isArray(output) ? output[0] : output).output.find(item => item.type === 'chunk' && item.isEntry);
  if (!entry) throw new Error('Missing fixture receiver');
  const receiverPath = join(ctx.root, 'runtime/first-turn-receiver.cjs');
  await writeFile(receiverPath, entry.code, { flag: 'wx', mode: 0o600 });
  const { startCodexHookReceiver } = createRequire(import.meta.url)(receiverPath);
  const token = randomBytes(32).toString('hex'), runId = randomUUID();
  let live = false, child, receiver, mock;
  const result = { initialized: false, threadStarted: false, emptyStartObserved: false, turnStarted: false,
    turnCompleted: false, outcome: 'closed', events: [], stdoutBytes: 0, stderrBytes: 0 };
  try {
    receiver = await startCodexHookReceiver({ token, acceptRun: id => live && id === runId,
      onFact: ({ fact }) => { if (result.events.length < 32) result.events.push(fact.kind); } });
    mock = await startMockProvider(); await ctx.verify();
    child = spawn('/usr/bin/sandbox-exec', ['-p', ctx.profile, ctx.executable,
      ...mockProviderArguments(mock.url), 'app-server'], { detached: true, cwd: join(ctx.root, 'work'),
      env: { ...ctx.environment, AGENT_PET_CODEX_URL: receiver.url, AGENT_PET_CODEX_TOKEN: token,
        AGENT_PET_CODEX_RUN_ID: runId }, stdio: ['pipe', 'pipe', 'pipe'] });
    live = true;
    await new Promise(done => {
      let buffer = '', stopping = false, force, settled = false;
      const timers = new Set();
      const later = (fn, ms) => { const timer = setTimeout(fn, ms); timers.add(timer); };
      const stop = outcome => {
        if (stopping) return; stopping = true; result.outcome = outcome;
        for (const timer of timers) clearTimeout(timer);
        if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
        force = setTimeout(() => {
          if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
          child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); finish();
        }, 1000);
      };
      const finish = () => { if (settled) return; settled = true; live = false;
        for (const timer of timers) clearTimeout(timer); clearTimeout(force); done(); };
      const send = value => { if (!stopping) child.stdin.write(JSON.stringify(value) + '\n'); };
      child.stdin.on('error', () => stop('input-closed'));
      child.stderr.on('data', chunk => { result.stderrBytes += chunk.length;
        if (result.stderrBytes + result.stdoutBytes > 128 * 1024) stop('output-limit'); });
      child.stdout.on('data', chunk => {
        result.stdoutBytes += chunk.length;
        if (result.stderrBytes + result.stdoutBytes > 128 * 1024) { buffer = ''; stop('output-limit'); return; }
        buffer += chunk.toString('utf8');
        while (!stopping && buffer.includes('\n')) {
          const end = buffer.indexOf('\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let msg; try { msg = JSON.parse(line); } catch { stop('invalid-protocol'); return; }
          if (!msg || typeof msg !== 'object' || Array.isArray(msg)) { stop('invalid-protocol'); return; }
          if (msg.error) { stop('rpc-error'); return; }
          if (msg.method && msg.id !== undefined) { stop('server-request'); return; }
          if (msg.id === 1 && msg.result && !result.initialized) {
            result.initialized = true; send({ method: 'initialized', params: {} });
            send({ id: 2, method: 'thread/start', params: { cwd: join(ctx.root, 'work'), approvalPolicy: 'never', sandbox: 'read-only' } });
          } else if (msg.id === 2 && !result.threadStarted) {
            const id = msg.result?.thread?.id;
            if (typeof id !== 'string' || id.length > 256) { stop('invalid-protocol'); return; }
            result.threadStarted = true;
            later(() => { result.emptyStartObserved = result.events.includes('session-started');
              send({ id: 3, method: 'turn/start', params: { threadId: id,
                input: [{ type: 'text', text: 'Reply OK only. Do not use tools.' }] } }); }, 150);
          } else if (msg.id === 3 && msg.result) result.turnStarted = true;
          else if (msg.method === 'turn/completed') {
            result.turnCompleted = msg.params?.turn?.status === 'completed';
            later(() => stop(result.turnCompleted ? 'completed' : 'turn-failed'), 150);
          }
        }
      });
      child.once('error', () => { result.outcome = 'spawn-failed'; finish(); });
      child.once('exit', () => { live = false; });
      // Retain escalation after leader exit so same-group descendants cannot outlive the probe.
      child.once('close', () => { if (!stopping) stop('closed'); });
      later(() => stop('timeout'), 15000);
      send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'agent_pet_local_fixture', version: '0.1.0' } } });
    });
    await ctx.verify();
    const summary = { ...result, modelFixture: mock.snapshot(), externalModelRequests: 0,
      networkPolicy: 'loopback-only', credentialsUsed: false,
      passed: result.outcome === 'completed' && !result.emptyStartObserved &&
        result.events.indexOf('session-started') >= 0 &&
        result.events.indexOf('turn-submitted') > result.events.indexOf('session-started') &&
        mock.snapshot().responses === 1 && mock.snapshot().unexpected === 0 };
    await writeFile(join(ctx.root, 'first-turn-result.json'), JSON.stringify(summary, null, 2), { flag: 'wx', mode: 0o600 });
    return summary;
  } finally { live = false; await receiver?.stop(); await mock?.stop(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--run-authorized-local-first-turn' || process.argv.length !== 3) {
    console.error('Explicit local-first-turn argument required.'); process.exitCode = 1;
  } else {
    try { const result = await checkFirstTurn(); console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1; }
    catch { console.error('LOCAL_FIRST_TURN_STOPPED; daily configuration untouched'); process.exitCode = 1; }
  }
}
