import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PiPreflight } from './pi-preflight.js';
import * as files from './pi-preflight-files.js';
import type { Inspection } from '../shared/pi-preflight.js';
let root: string;
beforeEach(async () => { root = await realpath(await mkdtemp(join(tmpdir(), 'pet-p2a-service-'))); });
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); await rm(root, { recursive: true, force: true }); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function create(pick = vi.fn<(_: 'installation' | 'target') => Promise<string | null>>(async () => null)) {
  return { service: new PiPreflight({ home: root, guiPath: join(root, 'bin'), pick }), pick };
}
describe('Main-owned pi selection and asynchronous operation authority', () => {
  it('does not read settings until explicit inspect and keeps installation separate', async () => {
    const json = vi.spyOn(files.ReadBudget.prototype, 'json');
    const { service, pick } = create();
    await mkdir(join(root, '.pi/agent'), { recursive: true });
    await writeFile(join(root, '.pi/agent/settings.json'), 'INVALID_SECRET');
    expect(service.snapshot().target).toEqual({ path: join(root, '.pi/agent'), source: 'default' });
    const custom = join(root, 'custom'); await mkdir(custom);
    pick.mockResolvedValueOnce(custom); await service.choose('target');
    expect(json).not.toHaveBeenCalled();
    expect(service.snapshot().selectedInstallation).toBeNull();
    expect((await service.inspect()).inspection?.findings).toEqual([]);
    service.useDefaultTarget(); expect(service.snapshot().inspection).toBeNull();
    expect((await service.inspect()).inspection?.findings).toEqual(['unreadable']);
    expect(JSON.stringify(service.snapshot())).not.toContain('INVALID_SECRET');
  });
  it('graphical installation selection reads only package identity and does not choose a config target', async () => {
    const packageRoot = join(root, 'package'); await mkdir(join(packageRoot, 'dist/bundle'), { recursive: true });
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '0.85.1', bin: { pi: 'dist/bundle/cli.js' }, piConfig: { configDir: '.pi' } }));
    await writeFile(join(packageRoot, 'dist/bundle/cli.js'), 'throw new Error("never execute")');
    const { service, pick } = create(); const target = service.snapshot().target;
    pick.mockResolvedValueOnce(packageRoot);
    const chosen = await service.choose('installation');
    expect(chosen.target).toEqual(target); expect(chosen.inspection).toBeNull();
    expect(chosen.installations[0]?.compatibility).toBe('verified-0.85.1');
    expect(chosen.selectedInstallation).toBe(chosen.installations[0]?.id);
    service.selectInstallation(chosen.selectedInstallation!);
    expect((await service.choose('installation')).selectedInstallation).toBe(chosen.selectedInstallation);
  });
  it('invalidates stale scan results when a newer target is selected', async () => {
    const pending = deferred<Awaited<ReturnType<typeof files.detectInstallations>>>();
    const scan = vi.spyOn(files, 'detectInstallations').mockReturnValueOnce(pending.promise);
    const { service, pick } = create(); const first = service.detect();
    pick.mockResolvedValueOnce(join(root, 'new')); await service.choose('target');
    pending.resolve({ installations: [{ id: 'old', path: join(root, 'old'), compatibility: 'unverified', version: null }], scan: 'complete' });
    await first; expect(scan).toHaveBeenCalledTimes(1);
    expect(service.snapshot().target.path).toBe(join(root, 'new'));
    expect(service.snapshot().installations).toEqual([]);
  });
  it('native cancellation or rejection preserves the target and never returns raw errors', async () => {
    const { service, pick } = create(); const before = service.snapshot().target;
    expect((await service.choose('target')).notice).toBe('cancelled');
    expect(service.snapshot().target).toEqual(before);
    pick.mockRejectedValueOnce(new Error('SECRET_NATIVE_ERROR'));
    const result = await service.choose('target'); expect(result.target).toEqual(before); expect(result.notice).toBe('failed');
    expect(JSON.stringify(result)).not.toContain('SECRET_NATIVE_ERROR');
  });
  it('a delayed picker cannot replace a newer default selection; overlapping pickers are not launched', async () => {
    const pending = deferred<string | null>(); const { service, pick } = create(); pick.mockReturnValueOnce(pending.promise);
    const first = service.choose('target'); service.useDefaultTarget();
    expect((await service.choose('target')).notice).toBe('busy'); expect(pick).toHaveBeenCalledTimes(1);
    pending.resolve(join(root, 'old')); await first;
    expect(service.snapshot().target.source).toBe('default');
  });
  it('a cancelled newer picker invalidates a stale inspection without changing selection', async () => {
    const pending = deferred<Inspection>(); vi.spyOn(files, 'inspectTarget').mockReturnValueOnce(pending.promise);
    const { service } = create(); const target = service.snapshot().target;
    const first = service.inspect(); await service.choose('target');
    pending.resolve({ target, findings: ['existing-extension'] }); await first;
    expect(service.snapshot().target).toEqual(target); expect(service.snapshot().inspection).toBeNull();
    expect(service.snapshot().notice).toBe('cancelled');
  });
  it('never commits an inspection for the old target, nor allows raw path selection', async () => {
    const pending = deferred<Inspection>(); vi.spyOn(files, 'inspectTarget').mockReturnValueOnce(pending.promise);
    const { service, pick } = create(); const target = service.snapshot().target;
    const first = service.inspect(); pick.mockResolvedValueOnce(join(root, 'new')); await service.choose('target');
    pending.resolve({ target, findings: [] }); await first;
    expect(service.snapshot().target.path).toBe(join(root, 'new')); expect(service.snapshot().inspection).toBeNull();
    expect(() => service.selectInstallation('/arbitrary/path')).toThrow('Invalid installation selection');
  });
  it('times out the response, bounds outstanding IO and prevents late completion from replacing the result', async () => {
    vi.useFakeTimers(); const pending = deferred<Inspection>();
    const inspect = vi.spyOn(files, 'inspectTarget').mockReturnValueOnce(pending.promise);
    const { service } = create(); const target = service.snapshot().target;
    const first = service.inspect(); await vi.advanceTimersByTimeAsync(files.limits.milliseconds);
    expect((await first).inspection?.findings).toEqual(['budget']);
    expect((await service.inspect()).notice).toBe('busy'); expect(inspect).toHaveBeenCalledTimes(1);
    pending.resolve({ target, findings: [] }); await Promise.resolve(); await Promise.resolve();
    expect(service.snapshot().inspection?.findings).toEqual(['budget']);
  });
  it('shutdown invalidates outstanding dialog and forbids subsequent work', async () => {
    const pending = deferred<string | null>(); const { service, pick } = create(); pick.mockReturnValueOnce(pending.promise);
    const first = service.choose('target'); service.close(); pending.resolve(join(root, 'old')); await first;
    expect(service.snapshot().target.source).toBe('default');
    await expect(service.inspect()).rejects.toThrow('Preflight unavailable');
  });
});
