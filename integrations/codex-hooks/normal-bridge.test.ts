import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import type { SessionObservation } from '../../packages/domain/src/index.js';
import { startCodexNormalBridge } from './normal-bridge.js';
import { createCodexNormalHookDocument } from './hook-source.js';
let root: string, entry: string, executable: string;
beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'agent-pet-codex-normal-fixture-')));
  entry = join(root, 'observer.cjs'); executable = await realpath(process.execPath);
  const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, ssr: resolve('integrations/codex-hooks/native-hook-entry.ts'), rollupOptions: { output: { format: 'cjs' } } } });
  const bundle = Array.isArray(output) ? output[0] : output;
  if (!bundle || !('output' in bundle)) throw new Error('Missing fixture output');
  const chunk = bundle.output.find(item => item.type === 'chunk' && item.isEntry);
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing fixture entry');
  await writeFile(entry, chunk.code, { mode: 0o600 });
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const directory = await realpath(await mkdtemp(join(root, 'private-'))), path = join(directory, 'activation.json');
  const observations: SessionObservation[] = [];
  let currentHook = 0;
  const bridge = await startCodexNormalBridge({ configurationId: randomUUID(), executable: '/fixture/codex', observerExecutable: executable, probePath: '/fixture/probe',
    name: () => 'Fixture', publish: fact => { observations.push(fact); },
    probe: async pid => pid === 10 || pid === currentHook ? { pid, ppid: pid === 10 ? 1 : 10, uid: process.getuid!(), startSeconds: 100, startMicroseconds: 5,
      executable: pid === 10 ? '/fixture/codex' : executable } : null });
  await writeFile(path, bridge.activation, { mode: 0o600 });
  const run = (text: string, target = path, open = false) => new Promise<{ code: number | null; stdout: string; stderr: string }>((done, reject) => {
    const child = spawn(executable, [entry, target], { env: {}, stdio: ['pipe', 'pipe', 'pipe'] }); currentHook = child.pid!;
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Hook exceeded fixture deadline')); }, 2000);
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject); child.once('close', code => { clearTimeout(timer); done({ code, stdout, stderr }); });
    if (open) child.stdin.write(text); else child.stdin.end(text);
  });
  return { bridge, observations, path, run };
}
const event = (session = 'native-private', tool = 'call') => JSON.stringify({ hook_event_name: 'PostToolUse', session_id: session,
  turn_id: 'turn-private', tool_use_id: tool, tool_name: 'Bash', prompt: 'PRIVATE_PROMPT', tool_response: 'PRIVATE_RESULT' });
const silent = { code: 0, stdout: '', stderr: '' };
it('normal hook with empty environment discovers private activation and publishes a verified unknown baseline/activity', async () => {
  const f = await fixture();
  try {
    expect(await f.run(event())).toEqual(silent);
    expect(f.observations.some(value => value.connected && value.status === 'unknown')).toBe(true);
    expect(f.observations.at(-1)?.facts?.recentActivity?.kind).toBe('executing');
    expect(JSON.stringify(f.observations)).not.toMatch(/PRIVATE|native-private|turn-private|call/);
    expect(await f.run(event('another-native'))).toEqual(silent);
    expect(new Set(f.observations.filter(value => value.connected).map(value => value.sessionId)).size).toBe(2);
  } finally { await f.bridge.stop(); }
});
it('is quiet on stopped receiver and rejects unsafe activation, links, foreign providers and unknown fields', async () => {
  const f = await fixture();
  try {
    const original = await readFile(f.path, 'utf8');
    await chmod(f.path, 0o644); expect(await f.run(event())).toEqual(silent); expect(f.observations).toEqual([]);
    await chmod(f.path, 0o600);
    const other = join(root, 'activation.json'); await symlink(f.path, other);
    expect(await f.run(event(), other)).toEqual(silent); expect(f.observations).toEqual([]);
    await rm(other);
    for (const update of [{ provider: 'claude' }, { extra: 'PRIVATE' }, { url: 'https://example.com/codex-native-presence' }]) {
      await writeFile(f.path, JSON.stringify({ ...JSON.parse(original), ...update })); expect(await f.run(event())).toEqual(silent);
    }
    expect(f.observations).toEqual([]); await writeFile(f.path, original);
    await f.bridge.stop(); expect(await f.run(event())).toEqual(silent);
  } finally { await f.bridge.stop(); }
});
it('reads replacement activation on each invocation after app receiver restarts; old address does not grant access', async () => {
  const f = await fixture(), g = await fixture();
  try {
    expect(await f.run(event())).toEqual(silent); await f.bridge.stop();
    await writeFile(f.path, g.bridge.activation);
    // g probe only recognizes its own test hook; use g entry but the persistent f path.
    expect(await g.run(event(), f.path)).toEqual(silent);
    expect(g.observations.some(value => value.connected)).toBe(true);
  } finally { await f.bridge.stop(); await g.bridge.stop(); }
});
it('never reads shell variables or executes an Agent and keeps normal-hook commands literal', async () => {
  const source = await readFile(entry, 'utf8'); expect(source).not.toMatch(/child_process|spawn\(|execFile|process\.env/);
  const doc = JSON.parse(createCodexNormalHookDocument('/bin/node', "/private/it's/observer.cjs", '/private/activation.json'));
  expect(doc.hooks.SessionStart[0].hooks[0].command).toBe("'/bin/node' '/private/it'\"'\"'s/observer.cjs' '/private/activation.json'");
  expect(() => createCodexNormalHookDocument('/node', '/observer', 'relative')).toThrow();
});
