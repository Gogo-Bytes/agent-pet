import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
import type { ClaudeHookFact } from './normalize.js';
import { createClaudeObservations } from './observations.js';
import type { SessionObservation } from '../../packages/domain/src/index.js';

const token = 'b'.repeat(64), uid = process.getuid!();
const body = (hookPid = 101) => ({ schemaVersion: 1, hookPid, fact: { kind: 'session-started', source: 'startup' } });
const delivery = (kind: ClaudeHookFact['kind'] = 'session-started', extra: Record<string, unknown> = {}, hookPid = 101) =>
  ({ schemaVersion: 2, hookPid, eventId: randomUUID(), fact: { providerSessionId: 'native-session', kind,
    ...(kind === 'session-started' ? { source: 'startup' } : {}), ...extra } });
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
async function factServer(options: Partial<Parameters<typeof startClaudeNativePresenceServer>[0]> = {}) {
  const facts = vi.fn<NonNullable<Parameters<typeof startClaudeNativePresenceServer>[0]['onFact']>>(() => undefined);
  const retired = vi.fn<(runId: string) => undefined>(() => undefined);
  const changed = vi.fn<(snapshot: { observedRuns: number; launchers: number }) => undefined>(() => undefined);
  const server = await startClaudeNativePresenceServer({ token, executable: '/claude', observerExecutable: '/observer',
    probePath: '/own-fixture/probe', probe: async requested => requested === 101 ? processIdentity(101, 102, '/observer') :
      requested === 102 ? processIdentity(102, 1, '/claude') : null, onChange: changed, onFact: facts, onRetire: retired, ...options });
  cleanups.push(server.stop); return { ...server, facts, retired, changed };
}

describe('OS-bound normalized native facts', () => {
  it('pins a private native session to an opaque process run and verifies every root fact', async () => {
    const server = await factServer();
    expect(await post(server.url, delivery('turn-submitted'))).toBe(403); expect(server.facts).not.toHaveBeenCalled();
    expect(await post(server.url, delivery())).toBe(204);
    const runId = server.facts.mock.calls[0]![0].runId;
    expect(runId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(await post(server.url, delivery('turn-submitted', { promptId: 'prompt' }))).toBe(204);
    expect(await post(server.url, delivery('tool-requested', { promptId: 'prompt', toolCallId: 'tool', activity: 'reading' }))).toBe(204);
    expect(server.facts.mock.calls.map(call => call[0].runId)).toEqual([runId, runId, runId]);
    expect(Object.keys(server.facts.mock.calls[0]![0]).sort()).toEqual(['fact', 'runId']);
    expect(JSON.stringify(server.facts.mock.calls)).not.toMatch(/hookPid|executable|eventId|schemaVersion|token/);
    expect(server.facts.mock.calls[0]![0].fact.providerSessionId).toBe('native-session');
    await server.stop(); expect(server.retired.mock.calls).toEqual([[runId]]);
  });
  it('keeps legacy presence compatible without treating it as a native session pin', async () => {
    const server = await factServer(); expect(await post(server.url)).toBe(204);
    expect(server.facts).not.toHaveBeenCalled(); expect(await post(server.url, delivery('turn-submitted'))).toBe(403);
    expect(await post(server.url, delivery())).toBe(204); expect(server.facts).toHaveBeenCalledTimes(1);
    expect(server.changed).toHaveBeenCalledTimes(1);
  });
  it('accepts in arrival order even when the first ancestry lookup is slow', async () => {
    let release!: () => void, held = false;
    const server = await factServer({ probe: async requested => {
      if (!held) { held = true; await new Promise<void>(resolve => { release = resolve; }); }
      return requested === 101 ? processIdentity(101, 102, '/observer') : processIdentity(102, 1, '/claude');
    } });
    const first = post(server.url, delivery()); await expect.poll(() => !!release).toBe(true);
    const next = post(server.url, delivery('turn-submitted'));
    await new Promise(resolve => setTimeout(resolve, 15)); expect(server.facts).not.toHaveBeenCalled();
    release(); expect(await first).toBe(204); expect(await next).toBe(204);
    expect(server.facts.mock.calls.map(call => call[0].fact.kind)).toEqual(['session-started', 'turn-submitted']);
  });
  it('rejects wrong sessions and updates a root session pin only through verified SessionStart', async () => {
    const server = await factServer(); expect(await post(server.url, delivery())).toBe(204);
    const runId = server.facts.mock.calls[0]![0].runId;
    expect(await post(server.url, delivery('turn-submitted', { providerSessionId: 'wrong-session' }))).toBe(403);
    expect(await post(server.url, delivery('session-started', { providerSessionId: 'next-session', source: 'clear' }))).toBe(204);
    expect(await post(server.url, delivery('session-ended'))).toBe(403);
    expect(await post(server.url, delivery('turn-submitted', { providerSessionId: 'next-session' }))).toBe(204);
    expect(server.facts.mock.calls.map(call => call[0].runId)).toEqual([runId, runId, runId]); expect(server.retired).not.toHaveBeenCalled();
  });
  it('never lets a late SessionStart resurrect a retired session or invalidate the current session', async () => {
    const server = await factServer();
    expect(await post(server.url, delivery('session-started', { providerSessionId: 'session-a' }))).toBe(204);
    expect(await post(server.url, delivery('session-started', { providerSessionId: 'session-b' }))).toBe(204);
    expect(await post(server.url, delivery('session-started', { providerSessionId: 'session-a' }))).toBe(403);
    expect(await post(server.url, delivery('turn-submitted', { providerSessionId: 'session-b' }))).toBe(204);
    expect(await post(server.url, delivery('session-started', { providerSessionId: 'session-b' }))).toBe(204);
    expect(server.facts.mock.calls.map(call => call[0].fact.providerSessionId)).toEqual(['session-a', 'session-b', 'session-b', 'session-b']);
    expect(server.retired).not.toHaveBeenCalled();
  });
  it('bounds native session tombstones without evicting old sessions or breaking the current one', async () => {
    const server = await factServer();
    for (let index = 0; index < 32; index++) {
      expect(await post(server.url, delivery('session-started', { providerSessionId: `session-${index}` }))).toBe(204);
    }
    expect(await post(server.url, delivery('session-started', { providerSessionId: 'session-32' }))).toBe(403);
    expect(await post(server.url, delivery('session-started', { providerSessionId: 'session-0' }))).toBe(403);
    expect(await post(server.url, delivery('turn-submitted', { providerSessionId: 'session-31' }))).toBe(204);
    expect(server.facts).toHaveBeenCalledTimes(33); expect(server.retired).not.toHaveBeenCalled();
  });
  it('does not mistake native SessionEnd or hook exit for OS retirement', async () => {
    const server = await factServer(); expect(await post(server.url, delivery())).toBe(204);
    expect(await post(server.url, delivery('session-ended'))).toBe(204);
    expect(server.facts.mock.calls.at(-1)![0].fact.kind).toBe('session-ended'); expect(server.retired).not.toHaveBeenCalled();
    expect(server.changed.mock.calls).toEqual([[{ observedRuns: 1, launchers: 1 }]]);
  });
  it('rejects arbitrary descendants or a reused PID instead of transferring an observed run', async () => {
    let changedBirth = false;
    const server = await factServer({ probe: async requested => requested === 101 ? processIdentity(101, 102, '/observer') :
      requested === 102 ? processIdentity(102, 1, '/claude', { startMicroseconds: changedBirth ? 124 : 123 }) : null });
    expect(await post(server.url, delivery())).toBe(204); const runId = server.facts.mock.calls[0]![0].runId;
    expect(await post(server.url, delivery('turn-submitted', {}, 999))).toBe(403);
    changedBirth = true; expect(await post(server.url, delivery('turn-submitted'))).toBe(409);
    expect(server.retired.mock.calls).toEqual([[runId]]); expect(server.facts).toHaveBeenCalledTimes(1);
    expect(await post(server.url, delivery('turn-submitted'))).toBe(403);
    expect(await post(server.url, delivery())).toBe(204); expect(server.facts.mock.calls[1]![0].runId).not.toBe(runId);
  });
  it.each([
    { eventId: 'not-a-uuid' }, { runId: randomUUID() }, { prompt: 'PRIVATE RAW' },
    { fact: { providerSessionId: 'native-session', kind: 'session-started', source: 'startup', body: 'PRIVATE RAW' } },
    { fact: { providerSessionId: 'native-session', kind: 'session-started', source: 'startup', childId: 'child' } },
    { fact: { providerSessionId: 'native-session', kind: 'tool-requested', toolCallId: 'tool', activity: 'invented' } },
  ])('rejects bad payload before probing: %j', async extra => {
    const probe = vi.fn(async () => null), server = await factServer({ probe });
    expect(await post(server.url, { ...delivery(), ...extra })).toBe(400);
    expect(probe).not.toHaveBeenCalled(); expect(server.facts).not.toHaveBeenCalled();
  });
  it('deduplicates recent IDs after OS verification and bounds the recent-ID window', async () => {
    const probe = vi.fn(async requested => requested === 101 ? processIdentity(101, 102, '/observer') : processIdentity(102, 1, '/claude'));
    const server = await factServer({ probe }), first = delivery();
    expect(await post(server.url, first)).toBe(204); const before = probe.mock.calls.length;
    expect(await post(server.url, first)).toBe(204); expect(probe.mock.calls.length).toBeGreaterThan(before); expect(server.facts).toHaveBeenCalledTimes(1);
    // At most 1024 event IDs are retained. New IDs continue without an unbounded
    // historical cache; replay protection is explicitly the recent window.
    for (let index = 0; index < 1024; index++) expect(await post(server.url, delivery('turn-submitted'))).toBe(204);
    expect(server.facts).toHaveBeenCalledTimes(1025);
    expect(await post(server.url, first)).toBe(204); expect(server.facts).toHaveBeenCalledTimes(1026);
  }, 10000);
  it('bounds hung probe jobs and closes promptly without late fact callbacks', async () => {
    let resolveProbe!: (value: ClaudeNativeProcessIdentity | null) => void;
    const server = await factServer({ probe: () => new Promise(resolve => { resolveProbe = resolve; }) });
    const pending = post(server.url, delivery()); await expect.poll(() => !!resolveProbe).toBe(true);
    await server.stop(); expect(await pending).toBe(0); resolveProbe(processIdentity(101, 102, '/observer'));
    await new Promise(resolve => setTimeout(resolve, 5)); expect(server.facts).not.toHaveBeenCalled(); expect(server.retired).not.toHaveBeenCalled();
  });
  it.each(['throw', 'reject', 'stop'] as const)('fails closed on synchronous fact callback %s', async mode => {
    let stop!: () => Promise<void>;
    const server = await factServer({ onFact: () => {
      if (mode === 'throw') throw new Error('PRIVATE RAW');
      if (mode === 'reject') return Promise.reject(new Error('PRIVATE RAW')) as never;
      void stop(); return undefined;
    } }); stop = server.stop;
    expect(await post(server.url, delivery())).toBe(0); await server.stop(); expect(server.retired).toHaveBeenCalledTimes(1);
    expect(server.changed.mock.calls.at(-1)?.[0].observedRuns ?? 0).toBe(0);
  });
  it.each(['throw', 'reject', 'stop'] as const)('contains retirement callback %s and invokes no callback after shutdown completes', async mode => {
    let stop!: () => Promise<void>, calls = 0;
    const server = await factServer({ onRetire: () => {
      calls++; if (mode === 'throw') throw new Error('PRIVATE RAW');
      if (mode === 'reject') return Promise.reject(new Error('PRIVATE RAW')) as never;
      void stop(); return undefined;
    } }); stop = server.stop;
    expect(await post(server.url, delivery())).toBe(204); await server.stop(); expect(calls).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 5)); expect(calls).toBe(1); expect(server.facts).toHaveBeenCalledTimes(1);
  });
});

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
  it('does not open an observer when the owned helper is unavailable at startup', async () => {
    const onChange = vi.fn(), onFact = vi.fn();
    const opening = startClaudeNativePresenceServer({ token, executable: claudeExecutable, observerExecutable,
      probePath: join(directory, 'missing-probe'), onChange, onFact });
    opening.then(server => { cleanups.push(() => server.stop()); }, () => {});
    await expect(opening).rejects.toThrow('Claude native observation unavailable');
    expect(onChange).not.toHaveBeenCalled(); expect(onFact).not.toHaveBeenCalled();
  });
  it('delivers real descendant metadata facts through OS binding and opaque Application observations', async () => {
    const observations: SessionObservation[] = [];
    const mapper = createClaudeObservations({ name: () => 'Isolated Claude fixture', publish: observation => { observations.push(observation); } });
    const server = await startClaudeNativePresenceServer({ token, executable: claudeExecutable, observerExecutable,
      probePath: helper, onChange: () => {}, onFact: delivery => { mapper.accept(delivery); }, onRetire: runId => { mapper.retire(runId); } });
    cleanups.push(async () => { await server.stop(); mapper.stop(); });
    const facts: ClaudeHookFact[] = [
      { kind: 'session-started', providerSessionId: 'native-private-session', source: 'startup' },
      { kind: 'turn-submitted', providerSessionId: 'native-private-session', promptId: 'native-private-prompt' },
      { kind: 'tool-succeeded', providerSessionId: 'native-private-session', promptId: 'native-private-prompt', toolCallId: 'native-private-tool', activity: 'reading' },
    ];
    // Native delivery intentionally accepts one request per socket. Each real hook
    // has its own process; disable the fixture client's pooled keep-alive socket.
    const childSource = `const http=require('node:http'),{randomUUID}=require('node:crypto'); (async()=>{for(const fact of JSON.parse(process.env.FIXTURE_FACTS)){await new Promise((resolve,reject)=>{const body=JSON.stringify({schemaVersion:2,hookPid:process.pid,eventId:randomUUID(),fact});const request=http.request(process.env.FIXTURE_URL,{agent:false,method:'POST',headers:{Authorization:'Bearer '+process.env.FIXTURE_TOKEN,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},response=>{console.log('HOOK_HTTP:'+response.statusCode);response.resume();response.on('end',()=>response.statusCode===204?resolve():reject());});request.on('error',()=>{console.log('HOOK_HTTP:network-error');reject();});request.end(body);});}})().then(()=>process.exit(0),()=>process.exit(1));`;
    const parentSource = `const child=require('node:child_process').spawn(process.env.FIXTURE_OBSERVER,['-e',process.env.FIXTURE_SOURCE],{stdio:'inherit'});child.on('exit',code=>console.log('HOOK_EXIT:'+code));process.stdin.resume();`;
    const own = spawn(claudeExecutable, ['-e', parentSource], { env: { FIXTURE_OBSERVER: observerExecutable,
      FIXTURE_SOURCE: childSource, FIXTURE_FACTS: JSON.stringify(facts), FIXTURE_URL: server.url, FIXTURE_TOKEN: token } });
    let output = ''; own.stdout.on('data', chunk => { output += chunk; }); own.stderr.resume();
    const ended = once(own, 'exit'); cleanups.push(async () => { if (own.exitCode === null && own.signalCode === null) own.kill('SIGKILL'); await ended; });
    await expect.poll(() => output, { timeout: 5000 }).toContain('HOOK_EXIT:');
    expect(output).toContain('HOOK_EXIT:0');
    expect(observations).toHaveLength(3); expect(observations.at(-1)).toMatchObject({ status: 'unknown', facts: { recentActivity: { kind: 'reading' } } });
    expect(JSON.stringify(observations)).not.toMatch(/native-private-session|native-private-prompt|native-private-tool/);
    own.kill('SIGKILL'); await ended;
    await expect.poll(() => observations.at(-1)?.connected, { timeout: 2500 }).toBe(false);
    expect(observations.at(-1)?.facts?.recentActivity).toBeUndefined();
  }, 10000);
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
