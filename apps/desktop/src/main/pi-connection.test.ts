import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, realpath, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { PiBridgeAdapter } from '@agent-pet/adapter-pi';
import { createApplication } from '@agent-pet/application';
import type { PiBridgeConfig } from './pi-config.js';
import type { PreflightState } from '../shared/pi-preflight.js';
import { PiConnection } from './pi-connection.js';
import { PiTemporaryDeployment } from './pi-temp-deployment.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture(developmentEnvironment = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pet-ui-')));
  const target = join(root, 'target'); await mkdir(target, { mode: 0o700 });
  let selection: PreflightState = { revision: 1, target: { path: target, source: 'chosen' }, installations: [],
    selectedInstallation: null, inspection: null, scan: 'not-run', notice: 'none' };
  const adapter = new PiBridgeAdapter(); const app = createApplication([adapter]);
  const start = vi.spyOn(adapter, 'start');
  const connection = new PiConnection({ target: () => selection, adapter, publish: app.observe, developmentEnvironment });
  cleanups.push(async () => { await connection.stop(); await rm(root, { recursive: true, force: true }); });
  return { root, target, adapter, app, start, connection,
    select(source: 'default' | 'chosen' = 'chosen') { selection = { ...selection, revision: selection.revision + 1, target: { path: target, source } }; },
    async preview() { const state = await connection.preview(); expect(state.preview?.action).toBe('create'); return state.preview!; },
  };
}

it('reports environment reception independently of peer connection state', async () => {
  const { connection } = await fixture(true);
  connection.developmentStarted(false);
  expect(connection.snapshot()).toMatchObject({ status: 'failed', receiving: 'stopped' });
  connection.developmentStarted(true);
  expect(connection.snapshot()).toMatchObject({ status: 'configured-waiting', receiving: 'active' });
  connection.connectionChanged('connected');
  expect(connection.snapshot()).toMatchObject({ status: 'connected', receiving: 'active' });
  connection.connectionChanged('disconnected');
  expect(connection.snapshot()).toMatchObject({ status: 'disconnected', receiving: 'active' });
});

it('is inert until native target selection and explicit preview; cancelled/forged/stale plans never write or listen', async () => {
  const f = await fixture();
  expect(await readdir(f.target)).toEqual([]); expect(f.start).not.toHaveBeenCalled();
  f.select('default'); expect((await f.connection.preview()).notice).toBe('choose-target');
  f.select();
  const cancelled = await f.preview(); f.connection.invalidate();
  expect((await f.connection.confirm(cancelled.id)).notice).toBe('invalid-plan');
  const stale = await f.preview(); f.select();
  expect((await f.connection.confirm(stale.id)).notice).toBe('invalid-plan');
  const old = await f.preview(); const latest = await f.preview();
  expect(latest.id).not.toBe(old.id);
  expect((await f.connection.confirm(old.id)).notice).toBe('invalid-plan');
  for (const forged of [{ id: latest.id }, 'x'.repeat(81), '/arbitrary/path', latest.id]) {
    expect((await f.connection.confirm(forged)).notice).toBe('invalid-plan');
  }
  expect(await readdir(f.target)).toEqual([]); expect(f.start).not.toHaveBeenCalled();
});

it('bounds preview and confirm concurrency and drops a late preview after cancellation', async () => {
  const f = await fixture();
  const original = PiTemporaryDeployment.prototype.preview;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const preview = vi.spyOn(PiTemporaryDeployment.prototype, 'preview').mockImplementationOnce(async function (this: PiTemporaryDeployment) {
    await gate; return original.call(this);
  });
  const first = f.connection.preview(); await Promise.resolve();
  expect((await f.connection.preview()).notice).toBe('busy');
  f.connection.invalidate(); release();
  expect((await first).preview).toBeNull(); expect(preview).toHaveBeenCalledOnce();
  const plan = await f.preview();
  const applied = f.connection.confirm(plan.id);
  expect((await f.connection.confirm(plan.id)).notice).toBe('busy');
  expect((await applied).status).toBe('configured-waiting'); expect(f.start).toHaveBeenCalledOnce();
  expect((await f.connection.confirm(plan.id)).notice).toBe('invalid-plan');
});

it('never replaces a reserved development env bridge, including failed env startup', async () => {
  const f = await fixture(true);
  expect((await f.connection.preview()).preview).toBeNull();
  f.connection.developmentStarted(false);
  expect(f.connection.snapshot()).toMatchObject({ status: 'failed', mode: 'development-env', canConfigure: false });
  expect((await f.connection.preview()).preview).toBeNull();
  expect(await readdir(f.target)).toEqual([]); expect(f.start).not.toHaveBeenCalled();
});

it('reports changed-target and deployment failure without starting a listener or deleting uncertain data', async () => {
  const f = await fixture(); const plan = await f.preview();
  await writeFile(join(f.target, 'settings.json'), '{}');
  expect(await f.connection.confirm(plan.id)).toMatchObject({ status: 'failed', notice: 'stale-plan', canRemove: false });
  expect(f.start).not.toHaveBeenCalled();
  const second = await fixture(); const another = await second.preview();
  vi.spyOn(PiTemporaryDeployment.prototype, 'apply').mockResolvedValueOnce({ status: 'failed-preserved' });
  expect(await second.connection.confirm(another.id)).toMatchObject({ status: 'failed', notice: 'deploy-failed-preserved' });
  expect(second.start).not.toHaveBeenCalled();
});

it('retains the receipt and redacts a denied start, then removes only its unchanged artifact', async () => {
  const f = await fixture(); const preview = await f.preview();
  f.start.mockImplementationOnce(async config => { throw new Error(`denied ${config.token} ${config.endpoint}`); });
  const state = await f.connection.confirm(preview.id);
  expect(state).toMatchObject({ status: 'failed', notice: 'start-failed', canRemove: true });
  const config = f.start.mock.calls[0]![0] as PiBridgeConfig;
  const source = await readFile(state.deployedPath!, 'utf8');
  for (const secret of [config.token, config.endpoint]) {
    expect(source).toContain(secret); expect(JSON.stringify(state)).not.toContain(secret);
  }
  expect(await f.connection.remove()).toMatchObject({ status: 'not-configured', notice: 'removed', canRemove: false, canConfigure: false });
  expect(await readdir(f.target)).toEqual([]);
});

it('preserves edited files on explicit withdrawal and never claims runtime unloading', async () => {
  const f = await fixture(); const preview = await f.preview();
  const state = await f.connection.confirm(preview.id);
  await writeFile(state.deployedPath!, 'user edit');
  expect(await f.connection.remove()).toMatchObject({ status: 'disconnected', notice: 'retained-changed', canRemove: false });
  expect(await readFile(state.deployedPath!, 'utf8')).toBe('user edit');
});

it('uses the deployed artifact with a real adapter/Application, reports hello/disconnect, and disposes private runtime on quit', async () => {
  const f = await fixture(); const preview = await f.preview();
  const states: unknown[] = []; f.connection.subscribe(state => states.push(state));
  const deployed = await f.connection.confirm(preview.id);
  expect(deployed.status).toBe('configured-waiting');
  const config = f.start.mock.calls[0]![0] as PiBridgeConfig;
  expect(config.endpoint).toMatch(/^\/tmp\/ap-[a-f0-9]{24}\/p\.sock$/);
  const runtime = config.endpoint.slice(0, config.endpoint.lastIndexOf('/'));
  expect((await stat(runtime)).mode & 0o777).toBe(0o700);
  expect((await stat(deployed.deployedPath!)).mode & 0o777).toBe(0o600);
  const source = await readFile(deployed.deployedPath!, 'utf8');
  await writeFile(join(f.root, 'runner.mjs'), `
import extension from './target/extensions/agent-pet.ts';
const hooks = new Map();
const ctx = { cwd: '/fixture/project', mode: 'tui', isIdle: () => true,
 sessionManager: { getSessionId: () => 'ui-fixture', getSessionName: () => 'UI fixture' } };
extension({ on: (event, fn) => hooks.set(event, fn) });
process.on('message', event => {
 if (event === 'work') hooks.get('agent_start')({}, ctx);
 if (event === 'complete') { hooks.get('message_end')({ message: { role: 'assistant', stopReason: 'stop' } }, ctx); hooks.get('agent_settled')({}, ctx); }
});
hooks.get('session_start')({}, ctx);
`);
  let child: ChildProcess | undefined;
  let closed: Promise<unknown> | undefined;
  try {
    child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'runner.mjs'], {
      cwd: f.root, env: {}, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    closed = once(child, 'close');
    await vi.waitFor(() => expect(f.connection.snapshot().status).toBe('connected'));
    child.send('work');
    await vi.waitFor(() => expect(f.app.snapshot().bubbles[0]?.status).toBe('working'));
    child.send('complete');
    await vi.waitFor(() => expect(f.app.snapshot().bubbles[0]?.status).toBe('completed-unread'));
    expect(await f.app.acknowledgeAndOpen({ provider: 'pi', sessionId: f.app.snapshot().bubbles[0]!.sessionId })).toEqual({ status: 'unsupported' });
    expect(f.app.snapshot().bubbles).toEqual([]);
    child.kill(); await closed;
    await vi.waitFor(() => expect(f.connection.snapshot().status).toBe('disconnected'));
    for (const secret of [config.token, config.endpoint]) {
      expect(source).toContain(secret); // positive control: artifact really uses this host config
      expect(JSON.stringify([states, f.app.snapshot()])).not.toContain(secret);
    }
    await f.connection.stop();
    await expect(stat(runtime)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(deployed.deployedPath!, 'utf8')).toBe(source); // quit does not silently uninstall
  } finally { if (child?.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await closed; }
}, 10000);

it('quit during consented adapter start waits for its late handle and stops exactly once', async () => {
  const f = await fixture(); const preview = await f.preview();
  let release!: () => void; const stop = vi.fn(async () => {});
  f.start.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return { stop }; });
  const confirming = f.connection.confirm(preview.id);
  await vi.waitFor(() => expect(f.start).toHaveBeenCalledOnce());
  let settled = false; const quitting = f.connection.stop().then(() => { settled = true; });
  await Promise.resolve(); expect(settled).toBe(false);
  release(); await confirming; await quitting;
  expect(stop).toHaveBeenCalledOnce();
  await f.connection.stop(); expect(stop).toHaveBeenCalledOnce();
});
