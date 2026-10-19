import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { build } from 'vite';
import { expect, it } from 'vitest';
import { startCodexNormalBridge } from './normal-bridge.js';
import type { SessionObservation } from '../../packages/domain/src/index.js';

it.skipIf(process.platform !== 'darwin')('uses actual macOS metadata for only a self-owned host/hook pair, with no injected connection environment', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'agent-pet-codex-os-fixture-')));
  let bridge: Awaited<ReturnType<typeof startCodexNormalBridge>> | undefined;
  try {
    const host = join(root, 'owned-host'), probe = join(root, 'process-probe'), entry = join(root, 'observer.cjs');
    const source = join(root, 'host.c');
    await writeFile(source, '#include <unistd.h>\n#include <sys/wait.h>\nint main(int argc,char **argv){if(argc!=4)return 1;pid_t p=fork();if(p<0)return 1;if(p==0){execl(argv[1],argv[1],argv[2],argv[3],(char*)0);_exit(1);}int s;if(waitpid(p,&s,0)<0)return 1;return WIFEXITED(s)?WEXITSTATUS(s):1;}');
    const run = promisify(execFile);
    await run('/usr/bin/clang', ['-O2', '-Wall', '-Wextra', '-Werror', source, '-o', host], { timeout: 10000 });
    await run('/usr/bin/clang', ['-O2', '-Wall', '-Wextra', '-Werror', resolve('integrations/claude-hooks/native-process-probe.c'), '-o', probe], { timeout: 10000 });
    const output = await build({ configFile: false, logLevel: 'silent', build: { write: false, ssr: resolve('integrations/codex-hooks/native-hook-entry.ts'), rollupOptions: { output: { format: 'cjs' } } } });
    const bundle = Array.isArray(output) ? output[0] : output;
    if (!bundle || !('output' in bundle)) throw new Error('Missing smoke output');
    const chunk = bundle.output.find(item => item.type === 'chunk' && item.isEntry);
    if (!chunk || chunk.type !== 'chunk') throw new Error('Missing smoke entry');
    await writeFile(entry, chunk.code, { mode: 0o600 });
    const observations: SessionObservation[] = [], node = await realpath(process.execPath);
    bridge = await startCodexNormalBridge({ configurationId: randomUUID(), executable: host, observerExecutable: node, probePath: probe,
      name: () => 'Owned fixture', publish: observation => { observations.push(observation); } });
    const activation = join(root, 'activation.json'); await writeFile(activation, bridge.activation, { mode: 0o600 });
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((done, reject) => {
      const child = spawn(host, [node, entry, activation], { env: {}, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Owned smoke deadline')); }, 4000);
      child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
      child.once('error', reject); child.once('close', code => { clearTimeout(timer); done({ code, stdout, stderr }); });
      child.stdin.end(JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'private-native', source: 'startup' }));
    });
    expect(result).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(observations.some(value => value.connected && value.status === 'unknown')).toBe(true);
    expect(JSON.stringify(observations)).not.toMatch(/private-native|owned-host|activation|token/);
    await expect.poll(() => observations.at(-1)?.connected, { timeout: 2500 }).toBe(false);
    expect((await readFile(activation)).length).toBeGreaterThan(0); // No Agent/user file cleanup.
  } finally { await bridge?.stop(); await rm(root, { recursive: true, force: true }); }
}, 15000);
