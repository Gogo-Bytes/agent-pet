import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { build } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { runCodexHook } from './command.js';
import { createCodexHookDocument, codexHookEvents } from './hook-source.js';
import { startCodexObservationBridge } from './bridge.js';
import { startCodexHookReceiver, type CodexHookDelivery } from './transport.js';
import { applyObservation, createSessionState, type SessionObservation } from '../../packages/domain/src/index.js';
import { projectPetPresentation } from '../../packages/pet-runtime/src/presentation.js';
const token = 'b'.repeat(64), runId = randomUUID();
let directory: string, entry: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'agent-pet-codex-command-'));
  const runtime = join(directory, "runtime ' $() `literal`"); await mkdir(runtime);
  entry = join(runtime, 'observer.cjs');
  await build({ configFile: false, logLevel: 'silent', build: { ssr: resolve('integrations/codex-hooks/command-entry.ts'),
    outDir: runtime, emptyOutDir: false, rollupOptions: { output: { format: 'cjs', entryFileNames: 'observer.cjs' } } } });
}, 10000);
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
function launch(input: string, env: Record<string, string>, command?: string, open = false) {
  const proc = command ? spawn('/bin/sh', ['-c', command], { cwd: directory, env }) : spawn(process.execPath, [entry], { cwd: directory, env });
  let stdout = '', stderr = '';
  proc.stdout.on('data', chunk => { stdout += chunk; }); proc.stderr.on('data', chunk => { stderr += chunk; });
  proc.stdin.on('error', () => {});
  const done = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('Fixture hook timeout')); }, 3000);
    proc.once('error', error => { clearTimeout(timer); reject(error); });
    proc.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  }).finally(() => proc.stdin.destroy());
  if (open) proc.stdin.write(input); else proc.stdin.end(input);
  return done;
}
const silent = { code: 0, stdout: '', stderr: '' };
const native = (event: string, extra = {}) => JSON.stringify({ session_id: 'private-session', turn_id: 'private-turn', hook_event_name: event, ...extra });
const env = (url: string) => ({ AGENT_PET_CODEX_URL: url, AGENT_PET_CODEX_TOKEN: token, AGENT_PET_CODEX_RUN_ID: runId });
it('bundles a silent observer with no filesystem or Agent dependency', async () => {
  const facts: CodexHookDelivery[] = [];
  const receiver = await startCodexHookReceiver({ token, acceptRun: id => id === runId, onFact: value => { facts.push(value); } });
  try {
    expect(await launch(native('PostToolUse', { tool_name: 'apply_patch', tool_use_id: 'private-call',
      transcript_path: '/SECRET/does-not-exist', tool_input: 'SECRET', tool_response: 'SECRET' }), env(receiver.url))).toEqual(silent);
    expect(facts[0]?.fact).toMatchObject({ kind: 'tool-returned', activity: 'writing' });
    expect(JSON.stringify(facts)).not.toMatch(/SECRET|token|tool_input/);
    expect(await readFile(entry, 'utf8')).not.toMatch(/node:fs|readFile|transcript_path|vitest/);
  } finally { await receiver.stop(); }
});
it('connects subprocess input through authenticated transport to shared pet state and interruption', async () => {
  let state = createSessionState(); const events: SessionObservation[] = []; let live = true;
  const bridge = await startCodexObservationBridge({ token, acceptRun: id => live && id === runId, name: () => 'Codex', publish: event => {
    events.push(event); state = applyObservation(state, event);
  } });
  try {
    for (const input of [native('SessionStart', { source: 'startup' }), native('UserPromptSubmit'),
      native('PostToolUse', { tool_name: 'Bash', tool_use_id: 'private-call' })])
      expect(await launch(input, env(bridge.url))).toEqual(silent);
    expect(projectPetPresentation(state).action).toBe('executing');
    expect(await launch(native('Interrupt'), env(bridge.url))).toEqual(silent);
    expect(projectPetPresentation(state).action).toBe('cancelled'); expect(state.bubbles).toEqual([]);
    expect(JSON.stringify(events)).not.toMatch(/private-session|private-turn|private-call/);
    live = false; bridge.retire(runId); expect(Object.values(state.sessions)[0]?.connected).toBe(false);
    const count = events.length; expect(await launch(native('SessionStart', { source: 'startup' }), env(bridge.url))).toEqual(silent);
    expect(events).toHaveLength(count); const first = bridge.stop(); expect(bridge.stop()).toBe(first); await first;
  } finally { await bridge.stop(); }
});
it('observer failures never emit diagnostics or prevent the host from continuing', async () => {
  const r = await startCodexHookReceiver({ token, acceptRun: () => false, onFact: () => undefined });
  try {
    for (const text of [native('Interrupt'), '{SECRET', 'x'.repeat(65537), native('SubagentStop')])
      expect(await launch(text, env(r.url))).toEqual(silent);
    expect(await launch('{}', {})).toEqual(silent);
    expect(await launch('{', env(r.url), undefined, true)).toEqual(silent);
    await r.stop(); expect(await launch(native('Interrupt'), env(r.url))).toEqual(silent);
  } finally { await r.stop(); }
});
it('releases stdin ownership after end/error/overflow without leaving listeners', async () => {
  for (const mode of ['end', 'error', 'overflow'] as const) {
    const input = new PassThrough(), result = runCodexHook(input, env('http://127.0.0.1:1/codex-hooks'));
    if (mode === 'end') input.end('{}');
    if (mode === 'error') input.destroy(new Error('SECRET'));
    if (mode === 'overflow') input.end(Buffer.alloc(65537));
    await result; await new Promise<void>(done => setImmediate(done));
    for (const event of ['data', 'end', 'error', 'close']) expect(input.listenerCount(event)).toBe(0);
    expect(input.destroyed).toBe(true);
  }
});
it('quotes literal paths in additive documents and emits no decisions or trust bypass', async () => {
  const node = join(directory, "node ' $() `literal`"); await symlink(process.execPath, node);
  const document = createCodexHookDocument(node, entry), hooks = JSON.parse(document).hooks;
  expect(Object.keys(hooks)).toEqual([...codexHookEvents]);
  expect(document).not.toMatch(/decision|permissionDecision|async|token|runId|bypass|trusted/);
  const receiver = await startCodexHookReceiver({ token, acceptRun: id => id === runId, onFact: () => undefined });
  try {
    expect(await launch(native('SessionEnd', { reason: 'other' }), env(receiver.url), hooks.SessionEnd[0].hooks[0].command)).toEqual(silent);
  } finally { await receiver.stop(); }
  for (const value of ['relative', '/node\nsecret', '/node\u0000secret']) expect(() => createCodexHookDocument(value, entry)).toThrow();
});
