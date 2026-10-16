import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startClaudePresenceServer } from './presence-channel.js';
import { createClaudePluginDocuments } from './plugin-source.js';

let buildDirectory: string, entry: string;
const cleanup: (() => Promise<void>)[] = [];
beforeAll(async () => {
  buildDirectory = await mkdtemp(join(await realpath(tmpdir()), 'agent-pet-terminal-build-')); entry = join(buildDirectory, 'launcher.cjs');
  await build({ configFile: false, logLevel: 'silent', build: { ssr: resolve('integrations/claude-hooks/launcher-entry.ts'),
    outDir: buildDirectory, emptyOutDir: false, rollupOptions: { output: { format: 'cjs', entryFileNames: 'launcher.cjs', inlineDynamicImports: true } } } });
});
afterEach(async () => { for (const stop of cleanup.splice(0).reverse()) await stop(); });
afterAll(async () => { await rm(buildDirectory, { recursive: true, force: true }); });

async function fixture() {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'agent-pet-terminal-'));
  const pluginDirectory = join(directory, 'plugin'), executable = join(directory, 'claude-fixture');
  await mkdir(pluginDirectory, { mode: 0o700 });
  await writeFile(executable, `#!${process.execPath}
const http = require('node:http');
let interrupted = 0;
process.on('SIGINT', () => { console.log('INTERRUPTED:' + ++interrupted); setTimeout(() => process.exit(23), 20); });
const body = JSON.stringify({schemaVersion:1,runId:process.env.AGENT_PET_CLAUDE_RUN_ID,eventId:require('node:crypto').randomUUID(),fact:{kind:'session-started',providerSessionId:'own-fixture',source:'startup'}});
const request = http.request(process.env.AGENT_PET_CLAUDE_URL, {method:'POST',headers:{Authorization:'Bearer '+process.env.AGENT_PET_CLAUDE_TOKEN,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}}, response => { response.resume(); response.on('end', () => console.log('READY:' + JSON.stringify({args:process.argv.slice(2),runAsNode:process.env.ELECTRON_RUN_AS_NODE ?? null}))); });
request.on('error', () => process.exit(80)); request.end(body);
process.stdin.setEncoding('utf8'); process.stdin.on('data', text => { if (text.includes('exit')) process.exit(7); else console.log('ALIVE'); });
`, { mode: 0o700 });
  const counts: { launchers: number; observedRuns: number }[] = [];
  const server = await startClaudePresenceServer({ token: 'a'.repeat(64), onChange: value => { counts.push(value); } });
  const activation = join(directory, 'activation.json');
  await writeFile(activation, JSON.stringify({ schemaVersion: 1, configurationId: randomUUID(), executable, pluginDirectory,
    url: server.url, token: 'a'.repeat(64) }), { mode: 0o600 });
  cleanup.push(async () => { await server.stop(); await rm(directory, { recursive: true, force: true }); });
  return { directory, pluginDirectory, activation, counts, server };
}
function run(args: string[], command = process.execPath, environment: NodeJS.ProcessEnv = {}) {
  const proc = spawn(command, args, { env: { ...process.env, ...environment, ELECTRON_RUN_AS_NODE: '1' } });
  let output = '', error = '';
  proc.stdout.on('data', chunk => { output += chunk; }); proc.stderr.on('data', chunk => { error += chunk; });
  proc.stdin.on('error', () => {});
  const completed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done, reject) => {
    proc.once('error', reject); proc.once('close', (code, signal) => done({ code, signal }));
  });
  cleanup.push(async () => { if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL'); await completed; });
  return { proc, completed, output: () => output, error: () => error };
}

describe('explicit standalone terminal entry (own fixtures only)', () => {
  it('authenticates before spawn, preserves argv/stdin, removes Electron mode and propagates native exit status', async () => {
    const own = await fixture(), process = run([entry, own.activation, '--name', 'literal $() `text`', '--', 'prompt text']);
    await expect.poll(process.output, { timeout: 3000 }).toContain('READY:');
    const ready = JSON.parse(process.output().split('READY:')[1]!.trim());
    expect(ready).toEqual({ args: ['--name', 'literal $() `text`', '--plugin-dir', own.pluginDirectory, '--', 'prompt text'], runAsNode: null });
    await expect.poll(() => own.counts.at(-1)?.observedRuns).toBe(1);
    process.proc.stdin.write('exit\n');
    expect(await process.completed).toEqual({ code: 7, signal: null });
    await expect.poll(() => own.counts.at(-1)).toEqual({ launchers: 0, observedRuns: 0 });
    expect(process.error()).toBe(''); expect(process.output()).not.toContain('a'.repeat(64));
  });

  it('Main channel loss stops observation while the child continues to its natural exit', async () => {
    const own = await fixture(), process = run([entry, own.activation]);
    await expect.poll(process.output, { timeout: 3000 }).toContain('READY:'); await own.server.stop();
    process.proc.stdin.write('ping\n'); await expect.poll(process.output, { timeout: 3000 }).toContain('ALIVE');
    process.proc.stdin.write('exit\n'); expect(await process.completed).toEqual({ code: 7, signal: null });
    expect(process.error()).toBe('');
  });

  it('rejects public/symlinked activation files, unknown schema and unavailable control before spawning', async () => {
    const own = await fixture();
    await chmod(own.activation, 0o644);
    const invalid = run([entry, own.activation]); expect(await invalid.completed).toEqual({ code: 1, signal: null });
    const guidance = 'Agent Pet 连接不可用。请打开 Agent Pet，在连接页继续连接，再复制最新命令。\n';
    expect(invalid.output()).toBe(''); expect(invalid.error()).toBe(guidance); expect(own.counts).toEqual([]);
    await chmod(own.activation, 0o600);
    const original = await readFile(own.activation, 'utf8');
    const renamed = join(own.directory, 'renamed.json');
    await rename(own.activation, renamed); await symlink(renamed, own.activation);
    const linked = run([entry, own.activation]); expect(await linked.completed).toEqual({ code: 1, signal: null });
    expect(linked.output()).toBe(''); expect(linked.error()).toBe(guidance);
    await rm(own.activation); await rename(renamed, own.activation);
    await writeFile(own.activation, JSON.stringify({ ...JSON.parse(original), extra: 'not allowed' }));
    const unknown = run([entry, own.activation]); expect(await unknown.completed).toEqual({ code: 1, signal: null });
    expect(unknown.output()).toBe(''); expect(unknown.error()).toBe(guidance); expect(own.counts).toEqual([]);
    await writeFile(own.activation, original); await own.server.stop();
    const unavailable = run([entry, own.activation]); expect(await unavailable.completed).toEqual({ code: 1, signal: null });
    expect(unavailable.output()).toBe(''); expect(unavailable.error()).toBe(guidance);
  });

  it('keeps terminal Ctrl-C with the child without duplicate forwarding or exiting the wrapper early', async () => {
    const own = await fixture();
    const source = `
import os, pty, select, signal, sys, time
pid, fd = pty.fork()
if pid == 0:
 os.execv(sys.argv[1], sys.argv[1:])
output = b''; sent = False; deadline = time.monotonic()+7
try:
 while time.monotonic() < deadline:
  readable, _, _ = select.select([fd], [], [], .05)
  if readable:
   try: chunk = os.read(fd, 16384)
   except OSError: break
   if not chunk: break
   output += chunk
   if b'READY:' in output and not sent:
    os.write(fd, b'\\x03'); sent = True
 else:
  os.killpg(pid, signal.SIGKILL)
 _, status = os.waitpid(pid, 0)
 sys.stdout.buffer.write(output)
 sys.exit(os.waitstatus_to_exitcode(status))
finally:
 os.close(fd)
`;
    const process = run(['-c', source, globalThis.process.execPath, entry, own.activation], 'python3');
    expect(await process.completed).toEqual({ code: 23, signal: null });
    expect(process.output()).toContain('INTERRUPTED:1'); expect(process.output()).not.toContain('INTERRUPTED:2');
    expect(process.error()).toBe('');
  }, 10000);

  it('adds Electron Node mode only to explicitly requested hook commands', () => {
    const hooks = (runAsNode: boolean) => JSON.parse(createClaudePluginDocuments('/app/Electron', { runAsNode }).hooks).hooks.SessionStart[0].hooks[0].command;
    expect(hooks(false)).toBe("'/app/Electron' \"${CLAUDE_PLUGIN_ROOT}/runtime/hook.cjs\"");
    expect(hooks(true)).toBe("ELECTRON_RUN_AS_NODE=1 '/app/Electron' \"${CLAUDE_PLUGIN_ROOT}/runtime/hook.cjs\"");
  });
});
