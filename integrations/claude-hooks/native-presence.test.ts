import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { constants as fsConstants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startClaudeNativePresenceServer, type ClaudeNativeProcessIdentity } from './native-presence.js';

const token = 'b'.repeat(64), uid = process.getuid!();
const body = (hookPid = 101) => ({ schemaVersion: 1, hookPid, fact: { kind: 'session-started', source: 'startup' } });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function post(url: string, value: unknown = body(), headers: Record<string, string> = {}): Promise<number> {
  return new Promise(resolve => {
    const text = JSON.stringify(value), request = http.request(url, { method: 'POST', agent: false, headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), ...headers,
    } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode ?? 0)); });
    request.on('error', () => resolve(0)); request.end(text);
  });
}
const processIdentity = (pid: number, ppid: number, executable: string, extra = {}): ClaudeNativeProcessIdentity =>
  ({ pid, ppid, executable, uid, startSeconds: 1000, startMicroseconds: 123, ...extra });
async function isolated(probe = async (pid: number): Promise<ClaudeNativeProcessIdentity | null> =>
  pid === 101 ? processIdentity(101, 102, '/observer') : pid === 102 ? processIdentity(102, 1, '/claude') : null,
  onChange: (value: { observedRuns: number; launchers: number }) => undefined = () => {}) {
  const server = await startClaudeNativePresenceServer({ token, executable: '/claude', observerExecutable: '/observer',
    probePath: '/own-fixture/probe', probe, onChange });
  cleanups.push(() => server.stop()); return server;
}

describe('Main-owned native presence boundary (isolated process metadata)', () => {
  it('requires authenticated strict root facts, bounds headers and never forwards identities to UI', async () => {
    const callback = vi.fn(), probe = vi.fn(async (pid: number) => pid === 101 ? processIdentity(101, 102, '/observer') : processIdentity(102, 1, '/claude'));
    const server = await isolated(probe, callback);
    expect(await post(server.url, body(), { Authorization: `Bearer ${'c'.repeat(64)}` })).toBe(401);
    expect(await post(server.url, body(), { Origin: 'http://localhost' })).toBe(400);
    expect(await post(server.url, { ...body(), sessionId: 'not allowed' })).toBe(400);
    expect(await post(server.url, { ...body(), fact: { kind: 'session-started', source: 'invented' } })).toBe(400);
    expect(await post(server.url, { ...body(), hookPid: -1 })).toBe(400);
    expect(await post(server.url, { ...body(), fact: { kind: 'session-started', source: ['startup'] } })).toBe(400);
    expect(probe).not.toHaveBeenCalled();
    expect(await post(server.url)).toBe(204);
    expect(callback.mock.calls).toEqual([[{ observedRuns: 1, launchers: 1 }]]);
    expect(JSON.stringify(callback.mock.calls)).not.toMatch(/pid|executable|token|session/i);
    expect(await post(server.url, body(101))).toBe(204); expect(callback).toHaveBeenCalledTimes(1);
    // Hook HTTP clients have already exited; the OS identity remains pinned.
    await new Promise<void>(resolve => setTimeout(resolve, 30)); expect(callback).toHaveBeenCalledTimes(1);
    await server.stop(); expect(callback.mock.calls.at(-1)).toEqual([{ observedRuns: 0, launchers: 0 }]);
  });

  it.each(['wrong-hook', 'wrong-agent', 'other-user', 'changing-birth', 'changing-parent', 'cycle', 'too-deep'] as const)(
    'rejects %s without claiming online', async mode => {
      let calls = 0;
      const server = await isolated(async requested => {
        calls++;
        if (mode === 'too-deep') return processIdentity(requested, requested + 1, requested === 101 ? '/observer' : '/shell');
        if (mode === 'cycle') return processIdentity(requested, requested === 101 ? 102 : 101, requested === 101 ? '/observer' : '/shell');
        if (requested === 101) return processIdentity(101, mode === 'changing-parent' && calls > 2 ? 103 : 102,
          mode === 'wrong-hook' ? '/untrusted' : '/observer', mode === 'other-user' ? { uid: uid + 1 } : {});
        if (requested === 102) return processIdentity(102, 1, mode === 'wrong-agent' ? '/another-agent' : '/claude',
          mode === 'changing-birth' && calls > 2 ? { startMicroseconds: 124 } : {});
        return null;
      });
      expect(await post(server.url)).toBe(403); expect(calls).toBeLessThanOrEqual(16);
    });

  it('tracks concurrent identities independently and rejects PID reuse on the next exact-PID check', async () => {
    const active = new Map<number, ClaudeNativeProcessIdentity>([[101, processIdentity(101, 102, '/observer')],
      [102, processIdentity(102, 1, '/claude')], [201, processIdentity(201, 202, '/observer')], [202, processIdentity(202, 1, '/claude')]]);
    const callback = vi.fn(), server = await isolated(async requested => active.get(requested) ?? null, callback);
    expect(await post(server.url)).toBe(204); expect(await post(server.url, body(201))).toBe(204);
    expect(callback.mock.calls.at(-1)).toEqual([{ observedRuns: 2, launchers: 2 }]);
    active.set(102, processIdentity(102, 1, '/claude', { startMicroseconds: 125 }));
    await expect.poll(() => callback.mock.calls.at(-1), { timeout: 2500 }).toEqual([{ observedRuns: 1, launchers: 1 }]);
    active.delete(202);
    await expect.poll(() => callback.mock.calls.at(-1), { timeout: 2500 }).toEqual([{ observedRuns: 0, launchers: 0 }]);
  });

  it('limits pinned identities and closes all partial peers when stopped', async () => {
    const callback = vi.fn(), server = await isolated(async requested => requested % 2
      ? processIdentity(requested, requested + 1, '/observer') : processIdentity(requested, 1, '/claude'), callback);
    for (let index = 0; index < 32; index++) expect(await post(server.url, body(101 + index * 2))).toBe(204);
    expect(callback.mock.calls.at(-1)).toEqual([{ observedRuns: 32, launchers: 32 }]);
    expect(await post(server.url, body(501))).toBe(403);
    expect(await post(server.url, body(101))).toBe(204);
    const url = new URL(server.url), peers = await Promise.all(Array.from({ length: 16 }, async () => {
      const socket = net.connect(Number(url.port), url.hostname); socket.on('error', () => {}); await once(socket, 'connect');
      const closed = once(socket, 'close'); socket.write('POST /claude-native-presence HTTP/1.1\r\n'); return { socket, closed };
    }));
    const excess = net.connect(Number(url.port), url.hostname); excess.on('error', () => {}); const closed = once(excess, 'close');
    await closed; await server.stop(); await Promise.all(peers.map(peer => peer.closed));
    expect(callback.mock.calls.at(-1)).toEqual([{ observedRuns: 0, launchers: 0 }]);
  });

  it.each(['throw', 'reject', 'reenter'] as const)('fails closed on callback %s without leaked sockets or unhandled rejections', async mode => {
    let server: Awaited<ReturnType<typeof isolated>>;
    const callback = vi.fn((value: { observedRuns: number; launchers: number }): undefined => {
      if (value.observedRuns === 0) return;
      if (mode === 'throw') throw new Error('PRIVATE');
      if (mode === 'reject') {
        // @ts-expect-error Broken JavaScript callback contract is contained.
        return Promise.reject(new Error('PRIVATE'));
      }
      void server.stop();
    });
    server = await isolated(undefined, callback);
    expect(await post(server.url)).toBe(0); await server.stop();
    expect(callback.mock.calls.map(call => call[0].observedRuns)).toEqual([1, 0]);
  });

  it('bounds incomplete peers and prevents late ancestry completion from reviving a stopped server', async () => {
    let resolveProbe!: (value: ClaudeNativeProcessIdentity | null) => void;
    const callback = vi.fn(), server = await isolated(() => new Promise(resolve => { resolveProbe = resolve; }), callback);
    const waiting = post(server.url);
    await expect.poll(() => !!resolveProbe).toBe(true);
    const stopped = server.stop(); resolveProbe(processIdentity(101, 102, '/observer'));
    await stopped; expect(await waiting).toBe(0); expect(callback).not.toHaveBeenCalled();
    const second = await isolated(), url = new URL(second.url), peer = net.connect(Number(url.port), url.hostname);
    peer.on('error', () => {}); await once(peer, 'connect'); peer.write('POST /claude-native-presence HTTP/1.1\r\n');
    await once(peer, 'close');
  }, 4000);
});

let directory: string, helper: string, observerExecutable: string, claudeExecutable: string;
beforeAll(async () => {
  if (process.platform !== 'darwin') return;
  directory = await mkdtemp(join(await realpath(tmpdir()), 'agent-pet-native-process-'));
  helper = join(directory, 'process-probe'); observerExecutable = await realpath(process.execPath);
  claudeExecutable = join(directory, 'own-claude-node');
  await promisify(execFile)('/usr/bin/clang', ['-O2', '-Wall', '-Wextra', '-Werror', resolve('integrations/claude-hooks/native-process-probe.c'), '-o', helper]);
  await copyFile(observerExecutable, claudeExecutable, fsConstants.COPYFILE_FICLONE);
}, 20000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

describe.runIf(process.platform === 'darwin')('actual macOS helper and own Node process ancestry', () => {
  it('returns only exact PID metadata and rejects invalid or unavailable PIDs', async () => {
    const result = await promisify(execFile)(helper, [String(process.pid)]), parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual(expect.objectContaining({ pid: process.pid, ppid: process.ppid, uid, executable: observerExecutable }));
    expect(parsed.startMicroseconds).toBeGreaterThanOrEqual(0); expect(parsed.startMicroseconds).toBeLessThan(1e6);
    expect(Object.keys(parsed).sort()).toEqual(['executable', 'pid', 'ppid', 'startMicroseconds', 'startSeconds', 'uid']);
    for (const value of ['0', '-1', 'all', String(0x7fffffff)]) await expect(promisify(execFile)(helper, [value])).rejects.toThrow();
  });

  it('binds a real hook descendant, survives hook exit, and detects abrupt parent termination', async () => {
    const callback = vi.fn(), server = await startClaudeNativePresenceServer({ token, executable: claudeExecutable, observerExecutable,
      probePath: helper, onChange: callback }); cleanups.push(() => server.stop());
    const childSource = `const http=require('node:http'); const body=JSON.stringify({schemaVersion:1,hookPid:process.pid,fact:{kind:'session-started',source:'startup'}});const r=http.request(process.env.FIXTURE_URL,{method:'POST',headers:{Authorization:'Bearer '+process.env.FIXTURE_TOKEN,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},s=>{s.resume();s.on('end',()=>process.exit(s.statusCode===204?0:1));});r.on('error',()=>process.exit(2));r.end(body);`;
    const parentSource = `const c=require('node:child_process').spawn(process.env.FIXTURE_OBSERVER,['-e',process.env.FIXTURE_SOURCE],{stdio:'inherit'});c.on('exit',code=>console.log('HOOK_EXIT:'+code));process.stdin.resume();`;
    const own = spawn(claudeExecutable, ['-e', parentSource], { env: { FIXTURE_OBSERVER: observerExecutable,
      FIXTURE_SOURCE: childSource, FIXTURE_URL: server.url, FIXTURE_TOKEN: token } });
    let output = ''; own.stdout.on('data', chunk => { output += chunk; }); own.stderr.resume();
    const ended = once(own, 'exit'); cleanups.push(async () => { if (own.exitCode === null && own.signalCode === null) own.kill('SIGKILL'); await ended; });
    await expect.poll(() => output, { timeout: 5000 }).toContain('HOOK_EXIT:0');
    expect(callback.mock.calls.at(-1)).toEqual([{ observedRuns: 1, launchers: 1 }]);
    own.kill('SIGKILL'); await ended;
    await expect.poll(() => callback.mock.calls.at(-1), { timeout: 2500 }).toEqual([{ observedRuns: 0, launchers: 0 }]);
  }, 10000);
});
