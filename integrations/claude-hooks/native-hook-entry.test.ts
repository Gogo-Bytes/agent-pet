import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { chmod, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

let buildDirectory: string, entry: string;
const cleanups: (() => Promise<void>)[] = [];
beforeAll(async () => {
  buildDirectory = await mkdtemp(join(await realpath(tmpdir()), 'agent-pet-native-hook-build-')); entry = join(buildDirectory, 'native-hook.cjs');
  await build({ configFile: false, logLevel: 'silent', build: { ssr: resolve('integrations/claude-hooks/native-hook-entry.ts'),
    outDir: buildDirectory, emptyOutDir: false, rollupOptions: { output: { format: 'cjs', entryFileNames: 'native-hook.cjs', inlineDynamicImports: true } } } });
});
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
afterAll(async () => { await rm(buildDirectory, { recursive: true, force: true }); });
const payload = (fields = {}) => JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'PRIVATE SESSION', source: 'startup',
  transcript_path: '/PRIVATE/never-open', prompt: 'PRIVATE PROMPT', ...fields });
async function fixture() {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'agent-pet-native-hook-'));
  const requests: { body: unknown; authorization?: string }[] = [];
  let hang = false;
  const server = http.createServer((request, response) => {
    let body = ''; request.setEncoding('utf8'); request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      requests.push({ body: JSON.parse(body), ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}) });
      if (hang) return;
      response.writeHead(204); response.end();
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const activation = join(directory, 'activation.json');
  await writeFile(activation, JSON.stringify({ schemaVersion: 1, configurationId: randomUUID(), executable: '/own/claude',
    observerExecutable: process.execPath, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/claude-native-presence`,
    token: 'd'.repeat(64) }), { mode: 0o600 });
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
  return { directory, activation, requests, hang: () => { hang = true; }, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}
async function child(activation: string, text = payload(), open = false) {
  const proc = spawn(process.execPath, [entry, activation], { env: {} });
  let stdout = '', stderr = '';
  proc.stdout.on('data', chunk => { stdout += chunk; }); proc.stderr.on('data', chunk => { stderr += chunk; });
  proc.stdin.on('error', () => {});
  const completed = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('Own native hook subprocess exceeded budget')); }, 4000);
    proc.once('error', error => { clearTimeout(timer); reject(error); });
    proc.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
  });
  if (open) proc.stdin.write(text); else proc.stdin.end(text);
  try { return { pid: proc.pid, result: await completed }; } finally { proc.stdin.destroy(); }
}
const silent = { code: 0, signal: null, stdout: '', stderr: '' };

describe('ordinary CLI passive native hook (own input/receiver only)', () => {
  it('sends only normalized root metadata and its live hook PID into the Main-private channel', async () => {
    const own = await fixture(), result = await child(own.activation);
    expect(result.result).toEqual(silent);
    expect(own.requests).toEqual([{ authorization: `Bearer ${'d'.repeat(64)}`, body: {
      schemaVersion: 2, hookPid: result.pid, eventId: expect.stringMatching(/^[a-f0-9-]{36}$/),
      fact: { providerSessionId: 'PRIVATE SESSION', kind: 'session-started', source: 'startup' },
    } }]);
    expect(JSON.stringify(own.requests[0]!.body)).not.toMatch(/PRIVATE PROMPT|transcript|never-open/);
    const bundle = await readFile(entry, 'utf8'); expect(bundle).not.toMatch(/child_process|spawn\(|execFile|process\.env/);
  });
  it('sends normalized root task facts with fresh event IDs and drops all raw content', async () => {
    const own = await fixture();
    const inputs = [
      { hook_event_name: 'UserPromptSubmit', prompt_id: 'prompt-id' },
      { hook_event_name: 'PreToolUse', tool_use_id: 'tool-id', tool_name: 'Read', tool_input: { path: 'PRIVATE PATH' } },
      { hook_event_name: 'Stop', stop_hook_active: false, background_tasks: [], session_crons: [] },
      { hook_event_name: 'SessionEnd' },
    ];
    for (const fields of inputs) expect((await child(own.activation, payload(fields))).result).toEqual(silent);
    const bodies = own.requests.map(request => request.body as { schemaVersion: number; eventId: string; fact: { kind: string } });
    expect(bodies.map(body => body.schemaVersion)).toEqual([2, 2, 2, 2]);
    expect(bodies.map(body => body.fact.kind)).toEqual(['turn-submitted', 'tool-requested', 'response-stopped', 'session-ended']);
    expect(new Set(bodies.map(body => body.eventId)).size).toBe(4);
    expect(JSON.stringify(bodies)).not.toMatch(/PRIVATE PROMPT|PRIVATE PATH|transcript_path|tool_input|hook_event_name/);
    expect((await child(own.activation, payload({ hook_event_name: 'UserPromptSubmit', agent_id: 'child' }))).result).toEqual(silent);
    expect(own.requests).toHaveLength(4);
  });

  it('ignores nonroot/unknown events, malformed and oversized input before any activation or network access', async () => {
    const own = await fixture();
    for (const text of [payload({ agent_id: 'child' }), payload({ hook_event_name: 'Stop' }), payload({ source: 'invented' }),
      payload({ hook_event_name: 'unknown' }), '{PRIVATE', 'x'.repeat(65537)]) {
      expect((await child(own.activation, text)).result).toEqual(silent);
    }
    expect(own.requests).toEqual([]);
    expect((await child('/does-not-exist/activation.json', payload({ agent_id: 'child' }))).result).toEqual(silent);
  });

  it('silently preserves files and rejects nonprivate, symlinked or unexpected activation data', async () => {
    const own = await fixture(), original = await readFile(own.activation, 'utf8');
    await chmod(own.activation, 0o644); expect((await child(own.activation)).result).toEqual(silent); await chmod(own.activation, 0o600);
    const renamed = join(own.directory, 'old.json'); await rename(own.activation, renamed); await symlink(renamed, own.activation);
    expect((await child(own.activation)).result).toEqual(silent); await rm(own.activation); await rename(renamed, own.activation);
    for (const extra of [{ extra: 'unknown' }, { url: 'http://example.com/claude-native-presence' }, { schemaVersion: 2 }]) {
      await writeFile(own.activation, JSON.stringify({ ...JSON.parse(original), ...extra }));
      expect((await child(own.activation)).result).toEqual(silent);
    }
    expect(own.requests).toEqual([]);
  });

  it('bounds open stdin and unavailable/unresponsive app without blocking the Agent or emitting output', async () => {
    const own = await fixture();
    expect((await child(own.activation, '{PRIVATE', true)).result).toEqual(silent); expect(own.requests).toEqual([]);
    own.hang(); expect((await child(own.activation)).result).toEqual(silent); expect(own.requests).toHaveLength(1);
    await own.close(); expect((await child(own.activation)).result).toEqual(silent);
  });
});
