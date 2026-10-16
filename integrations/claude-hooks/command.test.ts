import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runClaudeHook } from './command.js';
import { createClaudePluginDocuments } from './plugin-source.js';
import { startClaudeHookReceiver, type ClaudeHookDelivery } from './transport.js';

const token = 'b'.repeat(64), runId = randomUUID();
const payload = JSON.stringify({ hook_event_name: 'PostToolUse', session_id: 'conversation',
  prompt_id: 'prompt', tool_name: 'Read', tool_use_id: 'tool',
  transcript_path: '/PRIVATE/never-open', tool_input: { file_path: '/PRIVATE/never-open' }, tool_response: 'PRIVATE' });
let directory: string, entry: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'agent-pet-hook-command-'));
  const runtime = join(directory, 'plugin space $() `literal`', 'runtime');
  await mkdir(runtime, { recursive: true }); entry = join(runtime, 'hook.cjs');
  await build({ configFile: false, logLevel: 'silent', build: {
    ssr: resolve('integrations/claude-hooks/command-entry.ts'), outDir: runtime, emptyOutDir: false,
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'hook.cjs' } },
  } });
  await build({ configFile: false, logLevel: 'silent', build: {
    ssr: resolve('integrations/claude-hooks/command.ts'), outDir: directory, emptyOutDir: false,
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'command.cjs' } },
  } });
}, 10000);
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

async function child(options: { env?: Record<string, string>; text?: string; open?: boolean; command?: string; source?: string }) {
  const proc = options.command ? spawn('/bin/sh', ['-c', options.command], { cwd: directory, env: options.env ?? {} })
    : spawn(process.execPath, options.source ? ['-e', options.source] : [entry], { cwd: directory, env: options.env ?? {} });
  let stdout = '', stderr = '';
  proc.stdout.on('data', chunk => { stdout += chunk; }); proc.stderr.on('data', chunk => { stderr += chunk; });
  // The command may exit before malformed/oversized input finishes writing.
  proc.stdin.on('error', () => {});
  const finished = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>((done, reject) => {
    const deadline = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('Hook subprocess exceeded test budget')); }, 3000);
    proc.once('error', error => { clearTimeout(deadline); reject(error); });
    proc.once('close', (code, signal) => { clearTimeout(deadline); done({ code, signal, stdout, stderr }); });
  });
  if (options.open) proc.stdin.write(options.text ?? ''); else proc.stdin.end(options.text ?? payload);
  try { return await finished; } finally { proc.stdin.destroy(); }
}
const silent = { code: 0, signal: null, stdout: '', stderr: '' };

describe('standalone passive hook command (synthetic stdin, no installed Agent)', () => {
  it('ships as a self-contained Node command and only sends normalized facts to a pre-bound run', async () => {
    const deliveries: ClaudeHookDelivery[] = [];
    const receiver = await startClaudeHookReceiver({ token, acceptRun: id => id === runId, onFact: value => { deliveries.push(value); } });
    try {
      expect(await child({ env: { AGENT_PET_CLAUDE_URL: receiver.url, AGENT_PET_CLAUDE_TOKEN: token,
        AGENT_PET_CLAUDE_RUN_ID: runId } })).toEqual(silent);
      expect(deliveries.map(value => value.fact)).toEqual([{ providerSessionId: 'conversation', promptId: 'prompt',
        kind: 'tool-succeeded', toolCallId: 'tool', activity: 'reading' }]);
      expect(JSON.stringify(deliveries)).not.toContain('PRIVATE');
      const bundle = await readFile(entry, 'utf8');
      expect(bundle).not.toMatch(/node:fs|readFile|transcript_path|typescript|vitest/);
    } finally { await receiver.stop(); }
  });

  it('fails open without stdout, diagnostics, approval or automatic retries', async () => {
    const receiver = await startClaudeHookReceiver({ token, acceptRun: () => false,
      onFact: () => { throw new Error('Unbound events must not arrive'); } });
    const env = { AGENT_PET_CLAUDE_URL: receiver.url, AGENT_PET_CLAUDE_TOKEN: token, AGENT_PET_CLAUDE_RUN_ID: runId };
    try {
      for (const text of [payload, '{PRIVATE', 'x'.repeat(65537), JSON.stringify({ hook_event_name: 'SubagentStop' })]) {
        expect(await child({ env, text })).toEqual(silent);
      }
      await receiver.stop();
      expect(await child({ env })).toEqual(silent);
      expect(await child({ env: {} })).toEqual(silent);
    } finally { await receiver.stop(); }
  });

  it('bounds an unclosed stdin pipe and still exits successfully without Agent output', async () => {
    expect(await child({ open: true, text: '{PRIVATE', env: { AGENT_PET_CLAUDE_URL: 'http://127.0.0.1:1/claude-hooks',
      AGENT_PET_CLAUDE_TOKEN: token, AGENT_PET_CLAUDE_RUN_ID: runId } })).toEqual(silent);
  });

  it('silently handles an I/O error already pending when oversized stdin settles', async () => {
    const source = `
const { Readable } = require('node:stream');
const { runClaudeHook } = require(${JSON.stringify(join(directory, 'command.cjs'))});
let emitted = false;
const input = new Readable({read() {
  if (emitted) return; emitted = true;
  this.push(Buffer.alloc(65537));
  this.destroy(new Error('synthetic pending stdin I/O error'));
}});
void runClaudeHook(input, {AGENT_PET_CLAUDE_URL:'http://127.0.0.1:1/claude-hooks',
  AGENT_PET_CLAUDE_TOKEN:'${token}', AGENT_PET_CLAUDE_RUN_ID:'${runId}'})
  .then(() => process.exit(0), () => process.exit(0));
`;
    expect(await child({ source })).toEqual(silent);
  });

  it('cleans stdin listeners after success, error, overflow and timeout', async () => {
    const env = { AGENT_PET_CLAUDE_URL: 'http://127.0.0.1:1/claude-hooks', AGENT_PET_CLAUDE_TOKEN: token,
      AGENT_PET_CLAUDE_RUN_ID: runId };
    for (const mode of ['end', 'error', 'overflow', 'timeout'] as const) {
      const input = new PassThrough(), result = runClaudeHook(input, env);
      if (mode === 'end') input.end('{}');
      if (mode === 'error') input.destroy(new Error('PRIVATE'));
      if (mode === 'overflow') input.write('x'.repeat(65537));
      await result;
      await new Promise<void>(done => setImmediate(done));
      for (const event of ['data', 'end', 'error', 'close']) expect(input.listenerCount(event)).toBe(0);
      expect(input.isPaused()).toBe(true);
      expect(input.destroyed).toBe(true);
      input.destroy();
    }
    expect(await runClaudeHook(Readable.from(['{}']), {})).toBe('invalid');
  });

  it('produces additive plugin documents and safely quotes a Node path without embedding a token', async () => {
    const node = join(directory, "node ' literal $(false) `false`");
    await symlink(process.execPath, node);
    const documents = createClaudePluginDocuments(node), hooks = JSON.parse(documents.hooks).hooks;
    expect(Object.keys(hooks)).toHaveLength(12);
    expect(JSON.parse(documents.manifest).name).toBe('agent-pet-observer');
    expect(documents.hooks).not.toMatch(/decision|permissionDecision|async|settings|token|runId/);
    const receiver = await startClaudeHookReceiver({ token, acceptRun: id => id === runId, onFact: () => undefined });
    try {
      const plugin = join(directory, 'plugin space $() `literal`');
      await mkdir(join(plugin, '.claude-plugin'));
      await mkdir(join(plugin, 'hooks'));
      await writeFile(join(plugin, '.claude-plugin', 'plugin.json'), documents.manifest);
      await writeFile(join(plugin, 'hooks', 'hooks.json'), documents.hooks);
      expect(await child({ command: hooks.PostToolUse[0].hooks[0].command, env: {
        CLAUDE_PLUGIN_ROOT: plugin, AGENT_PET_CLAUDE_URL: receiver.url,
        AGENT_PET_CLAUDE_TOKEN: token, AGENT_PET_CLAUDE_RUN_ID: runId,
      } })).toEqual(silent);
    } finally { await receiver.stop(); }
    for (const path of ['node', '/node\nprivate', '/node\u0000private']) expect(() => createClaudePluginDocuments(path)).toThrow();
  });
});
