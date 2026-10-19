import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { CodexNormalObserver } from './codex-normal-observer.js';
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'agent-pet-codex-store-fixture-'))), id = randomUUID();
  const options = { directory: join(root, `codex-normal-${id}`), configurationId: id, executable: '/fixture/codex', observerExecutable: '/fixture/node',
    nodeExecutable: '/fixture/node', runAsNode: false, probePath: '/fixture/probe', name: () => 'Fixture', publish: () => {},
    probe: async (pid: number) => [10, 20].includes(pid) ? { pid, ppid: pid === 20 ? 10 : 1, uid: process.getuid!(),
      startSeconds: 100, startMicroseconds: 5, executable: pid === 20 ? '/fixture/node' : '/fixture/codex' } : null };
  const controller = new CodexNormalObserver(options);
  return { root, options, controller };
}
it('persists private runtime, rotates capabilities after restart and leaves observer/hook content intact', async () => {
  const f = await fixture(); let next: CodexNormalObserver | undefined;
  try {
    expect(await f.controller.initialize('// self-owned fixture; never executes an Agent')).toBe(true);
    expect(f.controller.snapshot()).toEqual({ status: 'waiting-for-event', busy: false, observedSessions: 0 });
    const first = JSON.parse(await readFile(join(f.options.directory, 'activation.json'), 'utf8'));
    const hook = await readFile(join(f.options.directory, 'hook.json')), observer = await readFile(join(f.options.directory, 'observer.cjs'));
    expect(JSON.stringify(f.controller.snapshot())).not.toContain(first.token);
    await f.controller.stop(); next = new CodexNormalObserver(f.options); expect(await next.restore()).toBe(true);
    const second = JSON.parse(await readFile(join(f.options.directory, 'activation.json'), 'utf8'));
    expect(second.token).not.toBe(first.token); expect(second.url).not.toBe(first.url);
    expect(await readFile(join(f.options.directory, 'hook.json'))).toEqual(hook);
    expect(await readFile(join(f.options.directory, 'observer.cjs'))).toEqual(observer);
    const response = await fetch(second.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + second.token },
      body: JSON.stringify({ schemaVersion: 1, hookPid: 20, eventId: randomUUID(), fact: { kind: 'session-started', source: 'startup', providerSessionId: 'native' } }) });
    expect(response.status).toBe(204); await response.arrayBuffer();
    expect(next.snapshot()).toMatchObject({ status: 'observing', observedSessions: 1 });
  } finally { await f.controller.stop(); await next?.stop(); await rm(f.root, { recursive: true, force: true }); }
});
it.each(['edited', 'pending', 'permissions'])('fails closed on %s runtime and preserves all user changes', async mode => {
  const f = await fixture(); let next: CodexNormalObserver | undefined;
  try {
    expect(await f.controller.initialize('// fixture')).toBe(true); await f.controller.stop();
    if (mode === 'edited') await writeFile(join(f.options.directory, 'observer.cjs'), '// user change');
    if (mode === 'pending') await writeFile(join(f.options.directory, '.pending'), 'keep', { mode: 0o600 });
    if (mode === 'permissions') await chmod(join(f.options.directory, 'activation.json'), 0o644);
    const before = await readFile(join(f.options.directory, 'activation.json'));
    next = new CodexNormalObserver(f.options); expect(await next.restore()).toBe(false);
    expect(next.snapshot()).toMatchObject({ status: 'failed', observedSessions: 0 });
    expect(await readFile(join(f.options.directory, 'activation.json'))).toEqual(before);
    if (mode === 'edited') expect(await readFile(join(f.options.directory, 'observer.cjs'), 'utf8')).toBe('// user change');
    if (mode === 'pending') expect(await readFile(join(f.options.directory, '.pending'), 'utf8')).toBe('keep');
  } finally { await f.controller.stop(); await next?.stop(); await rm(f.root, { recursive: true, force: true }); }
});
it('never adopts an existing directory or writes below a nonprivate parent', async () => {
  const f = await fixture();
  try {
    await mkdir(f.options.directory, { mode: 0o700 }); await writeFile(join(f.options.directory, 'mine'), 'keep');
    expect(await f.controller.initialize('// fixture')).toBe(false);
    expect(await readFile(join(f.options.directory, 'mine'), 'utf8')).toBe('keep');
    const other = { ...f.options, configurationId: randomUUID() }; other.directory = join(f.root, `codex-normal-${other.configurationId}`);
    await chmod(f.root, 0o755); const controller = new CodexNormalObserver(other);
    expect(await controller.initialize('// fixture')).toBe(false); await controller.stop();
  } finally { await chmod(f.root, 0o700); await f.controller.stop(); await rm(f.root, { recursive: true, force: true }); }
});
it('stop waits for an in-flight start to resolve and cleans up the cancelled receiver', async () => {
  const f = await fixture(); let release!: () => void, stopped = false, completed = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const controller = new CodexNormalObserver({ ...f.options, startBridge: async () => {
    await gate; return { activation: '{}', stop: async () => { stopped = true; } };
  } });
  try {
    const initializing = controller.initialize('// fixture');
    await expect.poll(() => controller.snapshot().busy).toBe(true);
    const closing = controller.stop().then(() => { completed = true; });
    await Promise.resolve(); expect(completed).toBe(false);
    release(); await closing; expect(stopped).toBe(true); expect(await initializing).toBe(false);
    expect(controller.snapshot().status).toBe('stopped');
  } finally { release(); await controller.stop(); await f.controller.stop(); await rm(f.root, { recursive: true, force: true }); }
});
