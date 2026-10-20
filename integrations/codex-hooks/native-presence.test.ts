import { randomBytes, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { startCodexNativePresence } from './native-presence.js';
import type { NativeHostIdentity } from '../hook-runtime/native-host.js';
const host = (pid = 10): NativeHostIdentity => ({ pid, ppid: 1, uid: process.getuid!(), startSeconds: 100, startMicroseconds: 12, executable: '/fixture/codex' });
const hook = (): NativeHostIdentity => ({ ...host(20), ppid: 10, executable: '/fixture/node' });
async function fixture() {
  const facts: { runId: string; fact: { kind: string } }[] = [], retired: string[] = [], changes: { observedHosts: number; observedSessions: number }[] = [];
  const rows = new Map([[10, host()], [20, hook()]]), token = randomBytes(32).toString('hex');
  const server = await startCodexNativePresence({ token, executable: '/fixture/codex', observerExecutable: '/fixture/node', probePath: '/fixture/probe',
    probe: async pid => rows.get(pid) ?? null, onFact: fact => { facts.push(fact); }, onRetire: run => { retired.push(run); }, onChange: state => { changes.push(state); } });
  const send = async (fact: unknown, eventId = randomUUID(), extra = {}) => {
    const response = await fetch(server.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ schemaVersion: 1, hookPid: 20, eventId, fact, ...extra }) });
    await response.arrayBuffer(); return response.status;
  };
  return { server, facts, retired, changes, rows, send };
}
const start = (id = 'session-one') => ({ kind: 'session-started', providerSessionId: id, source: 'startup' });
it('binds exact native ancestry, keeps independent sessions in one daemon and deduplicates callbacks', async () => {
  const f = await fixture();
  try {
    const id = randomUUID(); expect(await f.send(start(), id)).toBe(204); expect(await f.send(start(), id)).toBe(204);
    expect(await f.send(start('session-two'))).toBe(204);
    expect(f.facts).toHaveLength(2); expect(f.facts[0]!.runId).toBe(f.facts[1]!.runId);
    expect(f.changes.at(-1)).toEqual({ observedHosts: 1, observedSessions: 2 });
    expect(await f.send({ kind: 'session-ended', providerSessionId: 'session-one' })).toBe(204);
    expect(f.changes.at(-1)).toEqual({ observedHosts: 1, observedSessions: 1 });
    expect(await f.send(start())).toBe(403); // Ended native session cannot be resurrected.
    expect(f.retired).toEqual([]); // SessionEnd did not declare the daemon dead.
  } finally { await f.server.stop(); }
  expect(f.retired).toHaveLength(1);
});
it('admits a verified first task event after a missed startup without inventing a start event', async () => {
  const f = await fixture();
  try {
    expect(await f.send({ kind: 'tool-returned', providerSessionId: 'already-running', turnId: 'turn', toolCallId: 'call', activity: 'executing' })).toBe(204);
    expect(f.facts.map(item => item.fact.kind)).toEqual(['tool-returned']);
    expect(await f.send({ kind: 'session-ended', providerSessionId: 'unknown' })).toBe(403);
  } finally { await f.server.stop(); }
});
it('refuses foreign UID, wrong observer, executable and cyclic chains before publishing', async () => {
  for (const change of [() => ({ ...hook(), uid: host().uid + 1 }), () => ({ ...hook(), executable: '/foreign/node' }),
    () => ({ ...hook(), ppid: 20 }), () => ({ ...hook(), ppid: 30 })]) {
    const f = await fixture();
    try { f.rows.set(20, change()); expect(await f.send(start())).toBe(403); expect(f.facts).toEqual([]); }
    finally { await f.server.stop(); }
  }
});
it('rechecks ancestry and retires a reused PID without transferring observations', async () => {
  const f = await fixture();
  try {
    expect(await f.send(start())).toBe(204);
    f.rows.set(10, { ...host(), startMicroseconds: 13 });
    expect(await f.send(start('different'))).toBe(403);
    expect(f.facts).toHaveLength(1); expect(f.retired).toHaveLength(1);
  } finally { await f.server.stop(); }
});
it('rejects extra fields and child events; serializes acceptance and cleans up failed probes', async () => {
  const f = await fixture();
  try {
    expect(await f.send({ ...start(), childId: 'child' })).toBe(400);
    expect(await f.send(start(), randomUUID(), { prompt: 'PRIVATE' })).toBe(400);
    expect(await f.send({ ...start(), prompt: 'PRIVATE' })).toBe(400);
    expect(f.facts).toEqual([]);
  } finally { await f.server.stop(); }
});
it('refuses ancestry changed during verification and never publishes a late result after stop', async () => {
  const token = randomBytes(32).toString('hex'), facts: unknown[] = [];
  let calls = 0;
  const server = await startCodexNativePresence({ token, executable: '/fixture/codex', observerExecutable: '/fixture/node', probePath: '/fixture/probe',
    probe: async pid => pid === 10 ? host() : { ...hook(), ppid: ++calls > 1 ? 30 : 10 },
    onFact: value => { facts.push(value); }, onRetire: () => {} });
  try {
    const response = await fetch(server.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ schemaVersion: 1, hookPid: 20, eventId: randomUUID(), fact: start() }) });
    expect(response.status).toBe(403); await response.arrayBuffer(); expect(facts).toEqual([]);
  } finally { await server.stop(); }
  let started = false;
  const blocked = await startCodexNativePresence({ token, executable: '/fixture/codex', observerExecutable: '/fixture/node', probePath: '/fixture/probe',
    probe: async () => { started = true; return new Promise(() => {}); }, onFact: value => { facts.push(value); }, onRetire: () => {} });
  const pending = fetch(blocked.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ schemaVersion: 1, hookPid: 20, eventId: randomUUID(), fact: start() }) }).catch(() => null);
  await expect.poll(() => started).toBe(true); await blocked.stop(); await pending;
  expect(facts).toEqual([]);
});
it('allows successful expression callbacks and still closes on callback rejection', async () => {
  const token = randomBytes(32).toString('hex'), facts: unknown[] = [], changes: unknown[] = [];
  const server = await startCodexNativePresence({ token, executable: '/fixture/codex', observerExecutable: '/fixture/node', probePath: '/fixture/probe',
    probe: async pid => pid === 10 ? host() : pid === 20 ? hook() : null,
    onFact: value => facts.push(value), onRetire: () => {}, onChange: value => changes.push(value) });
  try {
    for (const session of ['one', 'two']) {
      const response = await fetch(server.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ schemaVersion: 1, hookPid: 20, eventId: randomUUID(), fact: start(session) }) });
      expect(response.status).toBe(204); await response.arrayBuffer();
    }
    expect(facts).toHaveLength(2); expect(changes.at(-1)).toEqual({ observedHosts: 1, observedSessions: 2 });
  } finally { await server.stop(); }
  const rejectedRuns: string[] = [];
  const rejecting = await startCodexNativePresence({ token, executable: '/fixture/codex', observerExecutable: '/fixture/node', probePath: '/fixture/probe',
    probe: async pid => pid === 10 ? host() : pid === 20 ? hook() : null,
    onFact: async () => { throw new Error('fixture consumer failure'); }, onRetire: value => { rejectedRuns.push(value); } });
  const response = await fetch(rejecting.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ schemaVersion: 1, hookPid: 20, eventId: randomUUID(), fact: start() }) }).catch(() => null);
  try {
    await response?.arrayBuffer().catch(() => {});
    await expect.poll(() => rejectedRuns.length).toBe(1);
    await expect(fetch(rejecting.url)).rejects.toThrow();
  } finally { await rejecting.stop(); }
});
