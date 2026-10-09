import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import * as fs from 'node:fs';
import * as asyncFs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { PiBridgeAdapter } from '@agent-pet/adapter-pi';
import { createApplication } from '@agent-pet/application';
import { PiConnection } from './pi-connection.js';
import { PiConnectionStore } from './pi-connection-store.js';
import { PiTemporaryDeployment } from './pi-temp-deployment.js';
import { piObservation } from '../renderer/test-support/pi-fixtures.js';
import type { PreflightState } from '../shared/pi-preflight.js';

vi.mock('node:fs/promises', async original => ({ ...await original<typeof import('node:fs/promises')>() }));
vi.mock('node:fs', async original => ({ ...await original<typeof import('node:fs')>() }));
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pet-restart-')));
  const target = join(root, 'target'); fs.mkdirSync(target, { mode: 0o700 });
  const selection: PreflightState = { revision: 1, target: { path: target, source: 'chosen' }, installations: [],
    selectedInstallation: null, inspection: null, scan: 'not-run', notice: 'none' };
  const connections: PiConnection[] = []; const runtimes = new Set<string>();
  function controller(developmentEnvironment = false) {
    const store = new PiConnectionStore(root);
    const adapter = new PiBridgeAdapter(); const app = createApplication([adapter]);
    const start = vi.spyOn(adapter, 'start'); const select = vi.fn(() => selection);
    const connection = new PiConnection({ target: select, adapter, publish: app.observe, developmentEnvironment, store });
    connections.push(connection);
    return { connection, store, start, app, select };
  }
  cleanups.push(async () => {
    for (const c of connections) await c.stop();
    for (const path of runtimes) fs.rmSync(path, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  });
  async function deploy() {
    const c = controller(); const preview = await c.connection.preview();
    expect(preview.preview?.action).toBe('create');
    expect(await c.connection.confirm(preview.preview!.id)).toMatchObject({ status: 'configured-waiting', saved: 'ready' });
    const saved = c.store.snapshot()!; runtimes.add(dirname(saved.config.endpoint));
    return { ...c, saved, path: join(target, 'extensions/agent-pet.ts') };
  }
  return { root, target, controller, deploy, record: join(root, 'pi-connection/connection.json') };
}

it('clean restart is inert; explicit resume uses SAME installed extension/config over real socket into Application', async () => {
  const f = fixture(); const first = await f.deploy();
  const source = fs.readFileSync(first.path, 'utf8');
  await first.connection.stop();
  expect(fs.existsSync(dirname(first.saved.config.endpoint))).toBe(true);
  expect(fs.existsSync(first.saved.config.endpoint)).toBe(false);
  const inspect = vi.spyOn(PiTemporaryDeployment.prototype, 'matches');
  const targetStat = vi.spyOn(asyncFs, 'lstat'); const targetOpen = vi.spyOn(asyncFs, 'open');
  const ownStat = vi.spyOn(fs, 'lstatSync');
  const second = f.controller();
  expect(targetStat).not.toHaveBeenCalled(); expect(targetOpen).not.toHaveBeenCalled();
  expect(ownStat.mock.calls.every(([path]) => !String(path).startsWith(f.target))).toBe(true);
  targetStat.mockRestore(); targetOpen.mockRestore(); ownStat.mockRestore();
  expect(second.start).not.toHaveBeenCalled(); expect(second.select).not.toHaveBeenCalled(); expect(inspect).not.toHaveBeenCalled();
  expect(second.connection.snapshot()).toMatchObject({ saved: 'ready', receiving: 'stopped', canResume: true, notice: 'resume-required' });
  const states: unknown[] = [second.connection.snapshot()]; second.connection.subscribe(s => states.push(s));
  expect(await second.connection.resume()).toMatchObject({ status: 'configured-waiting', receiving: 'active' });
  expect(second.start.mock.calls[0]![0]).toEqual(first.saved.config);
  expect(fs.readFileSync(first.path, 'utf8')).toBe(source);
  fs.writeFileSync(join(f.root, 'runner.mjs'), `
import extension from './target/extensions/agent-pet.ts';
const hooks = new Map();
const ctx = { cwd: '/fixture', mode: 'tui', isIdle: () => true,
 sessionManager: { getSessionId: () => 'restart-fixture', getSessionName: () => 'Restart fixture' } };
extension({ on: (name, fn) => hooks.set(name, fn) });
process.on('message', event => {
 if (event === 'work') hooks.get('agent_start')({}, ctx);
 if (event === 'complete') { hooks.get('message_end')({ message: { role: 'assistant', stopReason: 'stop' } }, ctx); hooks.get('agent_settled')({}, ctx); }
});
hooks.get('session_start')({}, ctx);
`);
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'runner.mjs'], {
    cwd: f.root, env: {}, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const closed = once(child, 'close');
  try {
    await vi.waitFor(() => expect(second.connection.snapshot().status).toBe('connected'));
    child.send('work'); await vi.waitFor(() => expect(second.app.snapshot().bubbles[0]?.status).toBe('working'));
    child.send('complete'); await vi.waitFor(() => expect(second.app.snapshot().bubbles[0]?.status).toBe('completed-unread'));
    for (const secret of [first.saved.config.token, first.saved.config.endpoint]) {
      expect(source).toContain(secret); expect(fs.readFileSync(f.record, 'utf8')).toContain(secret);
      expect(JSON.stringify([states, second.app.snapshot()])).not.toContain(secret);
    }
    expect(await second.connection.disable()).toMatchObject({ receiving: 'stopped', saved: 'disabled', notice: 'disabled' });
    await second.connection.stop();
    const third = f.controller();
    expect(third.connection.snapshot()).toMatchObject({ saved: 'disabled', receiving: 'stopped', canResume: true });
    expect(third.start).not.toHaveBeenCalled();
    expect(await third.connection.remove()).toMatchObject({ notice: 'removed', canConfigure: true, saved: 'none' });
    expect(fs.existsSync(first.path)).toBe(false);
    expect(new PiConnectionStore(f.root).snapshot()).toBeNull();
    expect((await third.connection.preview()).preview?.action).toBe('create');
  } finally { child.kill(); await closed; }
}, 10000);

it.each(['edit', 'replace'])('restart withdrawal preserves %s and retained evidence', async kind => {
  const f = fixture(); const first = await f.deploy(); await first.connection.stop();
  if (kind === 'replace') fs.renameSync(first.path, join(f.root, 'original.ts'));
  fs.writeFileSync(first.path, kind, { mode: 0o600 });
  const second = f.controller();
  expect(await second.connection.remove()).toMatchObject({ notice: 'retained-changed', receiving: 'stopped', saved: 'disabled', canRemove: true });
  expect(fs.readFileSync(first.path, 'utf8')).toBe(kind);
  expect(new PiConnectionStore(f.root).snapshot()?.ownership).toEqual(first.saved.ownership);
});

it.each(['missing-runtime', 'replaced-runtime', 'permissive-runtime', 'unknown-socket'])('refuses %s without unlink, reconstruction or listener', async kind => {
  const f = fixture(); const first = await f.deploy(); await first.connection.stop();
  const runtime = dirname(first.saved.config.endpoint);
  if (kind === 'missing-runtime' || kind === 'replaced-runtime') fs.rmdirSync(runtime);
  if (kind === 'replaced-runtime') fs.mkdirSync(runtime, { mode: 0o700 });
  if (kind === 'permissive-runtime') fs.chmodSync(runtime, 0o755);
  if (kind === 'unknown-socket') fs.writeFileSync(first.saved.config.endpoint, 'unknown');
  const second = f.controller();
  expect(await second.connection.resume()).toMatchObject({ notice: 'resume-refused', receiving: 'stopped' });
  expect(second.start).not.toHaveBeenCalled();
  if (kind === 'unknown-socket') expect(fs.readFileSync(first.saved.config.endpoint, 'utf8')).toBe('unknown');
  if (kind === 'missing-runtime') expect(fs.existsSync(runtime)).toBe(false);
  expect(await second.connection.remove()).toMatchObject({ notice: 'removed' });
});

it('rejects corrupt/foreign records visibly with no target inspection or automatic adoption', async () => {
  const f = fixture(); const first = await f.deploy(); await first.connection.stop();
  const bytes = fs.readFileSync(f.record, 'utf8');
  fs.writeFileSync(f.record, bytes.replace('"version":1', '"version":2'));
  const match = vi.spyOn(PiTemporaryDeployment.prototype, 'matches');
  const second = f.controller();
  expect(second.connection.snapshot()).toMatchObject({ status: 'failed', notice: 'saved-invalid', canConfigure: false, canResume: false, canRemove: false });
  await second.connection.resume(); await second.connection.preview();
  expect(match).not.toHaveBeenCalled(); expect(second.start).not.toHaveBeenCalled();
  expect(fs.existsSync(first.path)).toBe(true);
});

it('failed save before listen retains receipt; stop/save failure and failed removal publication are truthful', async () => {
  const f = fixture(); const c = f.controller(); const preview = await c.connection.preview();
  const save = vi.spyOn(c.store, 'save').mockReturnValueOnce(false);
  expect(await c.connection.confirm(preview.preview!.id)).toMatchObject({ notice: 'save-failed', receiving: 'stopped', canRemove: true, saved: 'uncertain' });
  expect(c.start).not.toHaveBeenCalled();
  // The receipt is still usable in this process, even though initial persistence failed.
  save.mockRestore();
  expect(await c.connection.remove()).toMatchObject({ notice: 'removed' });
  const next = await f.deploy();
  vi.spyOn(next.store, 'save').mockReturnValueOnce(false);
  expect(await next.connection.disable()).toMatchObject({ notice: 'save-failed', receiving: 'stopped', saved: 'uncertain', canRemove: true });
  expect(fs.existsSync(next.path)).toBe(true);
  await next.connection.stop();
  const resumed = f.controller(); expect(resumed.start).not.toHaveBeenCalled();
  const saved = vi.spyOn(resumed.store, 'save'); saved.mockReturnValueOnce(true).mockReturnValueOnce(false);
  expect(await resumed.connection.remove()).toMatchObject({ notice: 'removed-save-failed', receiving: 'stopped', canConfigure: false, canRemove: false });
  expect(fs.existsSync(next.path)).toBe(false);
});

it('serializes resume/disable; late callbacks cannot resurrect stopped state or publish observations', async () => {
  const f = fixture(); const first = await f.deploy(); await first.connection.stop();
  const second = f.controller();
  let release!: () => void;
  const stop = vi.fn(async () => {});
  second.start.mockImplementationOnce(async (_config, sink) => {
    await new Promise<void>(resolve => { release = resolve; });
    sink.connectionChanged('connected'); return { stop };
  });
  const resume = second.connection.resume();
  await vi.waitFor(() => expect(second.start).toHaveBeenCalledOnce());
  expect((await second.connection.disable()).notice).toBe('busy');
  release(); await resume;
  stop.mockRejectedValueOnce(new Error('stop secret'));
  expect(await second.connection.disable()).toMatchObject({ notice: 'stop-failed', receiving: 'unknown', saved: 'disabled' });
  expect(await second.connection.disable()).toMatchObject({ notice: 'disabled', receiving: 'stopped' });
  second.start.mock.calls[0]![1].connectionChanged('connected');
  second.start.mock.calls[0]![1].publish(piObservation());
  expect(second.app.snapshot().bubbles).toEqual([]);
  expect(second.connection.snapshot()).toMatchObject({ status: 'disconnected', receiving: 'stopped' });
  expect(stop).toHaveBeenCalledTimes(2);
});

it('a reserved environment route never consumes a valid saved desktop connection', async () => {
  const f = fixture(); const first = await f.deploy(); await first.connection.stop();
  const env = f.controller(true); await env.connection.resume(); await env.connection.disable();
  expect(env.connection.snapshot()).toMatchObject({ mode: 'development-env', canResume: false, canRemove: false });
  expect(env.start).not.toHaveBeenCalled(); expect(fs.existsSync(first.path)).toBe(true);
});

it('preserves durable ownership across a failed withdrawal and permits a fully revalidated retry', async () => {
  const f = fixture(); const first = await f.deploy(); await first.connection.stop();
  const second = f.controller();
  vi.spyOn(PiTemporaryDeployment.prototype, 'withdraw').mockResolvedValueOnce({ file: 'failed-preserved', directories: 'retained', runtime: 'not-unloaded' });
  expect(await second.connection.remove()).toMatchObject({ notice: 'failed-preserved', saved: 'disabled', canRemove: true });
  expect(fs.existsSync(first.path)).toBe(true);
  expect(new PiConnectionStore(f.root).snapshot()?.ownership).toEqual(first.saved.ownership);
  expect(await second.connection.remove()).toMatchObject({ notice: 'removed', canRemove: false });
});

it.each(['token', 'endpoint', 'ownership-path', 'ownership-key', 'file-mode', 'runtime-mode'])('rejects unknown or invalid saved %s schema', async kind => {
  const f = fixture(); const first = await f.deploy(); await first.connection.stop();
  const record = JSON.parse(fs.readFileSync(f.record, 'utf8'));
  if (kind === 'token') record.connection.config.token = 'short';
  if (kind === 'endpoint') record.connection.config.endpoint = '/arbitrary/socket';
  if (kind === 'ownership-path') record.connection.ownership.directories[0][0] = '/arbitrary';
  if (kind === 'ownership-key') record.connection.ownership.extra = true;
  if (kind === 'file-mode') record.connection.ownership.file.mode++;
  if (kind === 'runtime-mode') record.connection.runtime.mode++;
  fs.writeFileSync(f.record, JSON.stringify(record));
  expect(f.controller().connection.snapshot()).toMatchObject({ notice: 'saved-invalid', canRemove: false, canResume: false });
});


it('refuses an existing real socket and leaves its listener untouched', async () => {
  const f = fixture(); const first = await f.deploy(); await first.connection.stop();
  const other = createServer();
  await new Promise<void>((resolve, reject) => { other.once('error', reject); other.listen(first.saved.config.endpoint, resolve); });
  try {
    const second = f.controller();
    expect(await second.connection.resume()).toMatchObject({ notice: 'resume-refused' });
    expect(second.start).not.toHaveBeenCalled();
    expect(other.listening).toBe(true); expect(fs.lstatSync(first.saved.config.endpoint).isSocket()).toBe(true);
  } finally { await new Promise<void>(resolve => other.close(() => resolve())); }
});
