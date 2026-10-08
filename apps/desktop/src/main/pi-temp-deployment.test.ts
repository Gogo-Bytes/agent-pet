import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { PiTemporaryDeployment, type TemporaryDeploymentPreview, type TemporaryDeploymentReceipt } from './pi-temp-deployment.js';
import * as renderer from '../../../../integrations/pi-extension/configured-source.js';

const roots: string[] = [];
const config = { endpoint: 'synthetic-private-endpoint', token: 'synthetic-private-token-123456' };
async function fixture(existing = false, io?: ConstructorParameters<typeof PiTemporaryDeployment>[2]) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pet-deploy-')));
  roots.push(root);
  const target = join(root, 'target');
  if (existing) await mkdir(target, { mode: 0o700 });
  const deploy = new PiTemporaryDeployment(target, config, io);
  return { root, target, deploy, path: join(target, 'extensions', 'agent-pet.ts') };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function apply(deploy: PiTemporaryDeployment) {
  const preview = await deploy.preview();
  expect(preview.action).toBe('create');
  const applied = await deploy.apply(preview);
  expect(applied.status).toBe('deployed');
  if (applied.status !== 'deployed') throw new Error('Fixture deployment failed');
  return { preview, receipt: applied.receipt };
}

it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('retains ownership after denied unlink so a validated retry can remove only the file', async () => {
  const { deploy, path } = await fixture();
  const { receipt } = await apply(deploy);
  const original = await readFile(path);
  const directory = dirname(path);
  try {
    await chmod(directory, 0o500);
    expect(await deploy.withdraw(receipt)).toEqual({ file: 'failed-preserved', directories: 'retained', runtime: 'not-unloaded' });
    expect(await readFile(path)).toEqual(original);
  } finally {
    await chmod(directory, 0o700);
  }
  expect(await deploy.withdraw(receipt)).toEqual({ file: 'removed', directories: 'retained', runtime: 'not-unloaded' });
  expect(await readdir(directory)).toEqual([]);
  expect(await deploy.withdraw(receipt)).toEqual({ file: 'retained-unknown', directories: 'retained', runtime: 'not-unloaded' });
});

it('preview and cancellation are read-only and confirmation is host-held, not copied public bytes', async () => {
  const { deploy, root, target } = await fixture();
  const before = await lstat(root);
  const preview = await deploy.preview();
  expect(preview.target).toEqual({ path: target, source: 'chosen' });
  expect(preview.createDirectories).toEqual([target, join(target, 'extensions')]);
  expect(preview.loadRequirements).toContain('not installation or loaded/connected evidence');
  expect(preview.loadRequirements).toContain('does not unload');
  expect(await readdir(root)).toEqual([]);
  expect((await lstat(root)).mtimeMs).toBe(before.mtimeMs);
  expect(await deploy.apply({ ...preview } as TemporaryDeploymentPreview)).toEqual({ status: 'invalid-plan' });
  expect(deploy.cancel(preview)).toBe('cancelled');
  expect(await deploy.apply(preview)).toEqual({ status: 'invalid-plan' });
  expect(await readdir(root)).toEqual([]);
});

it.each([false, true])('creates just the private fixed artifact, renders once, and selectively removes own directories (existing target=%s)', async existing => {
  const render = vi.spyOn(renderer, 'renderConfiguredPiExtension');
  const { deploy, target, path, root } = await fixture(existing);
  const { preview, receipt } = await apply(deploy);
  expect(render).toHaveBeenCalledTimes(1);
  expect(await readFile(path, 'utf8')).toBe(await render.mock.results[0]!.value);
  expect((await lstat(path)).mode & 0o777).toBe(0o600);
  expect((await lstat(dirname(path))).mode & 0o777).toBe(0o700);
  expect(await readdir(dirname(path))).toEqual(['agent-pet.ts']);
  expect(await deploy.apply(preview)).toEqual({ status: 'invalid-plan' });
  expect(await deploy.withdraw(receipt)).toEqual({ file: 'removed', directories: 'removed', runtime: 'not-unloaded' });
  expect(await readdir(root)).toEqual(existing ? ['target'] : []);
  if (existing) expect(await readdir(target)).toEqual([]);
});

it('accepts only one simultaneous use of a plan and competing instances cannot overwrite', async () => {
  const { deploy, target, path } = await fixture(true);
  await mkdir(dirname(path), { mode: 0o700 });
  const other = new PiTemporaryDeployment(target, { ...config, token: 'other-synthetic-token-1234' });
  const [a, b] = await Promise.all([deploy.preview(), other.preview()]);
  const results = await Promise.all([deploy.apply(a), deploy.apply(a), other.apply(b)]);
  expect(results.filter(r => r.status === 'deployed')).toHaveLength(1);
  expect(results[1]).toEqual({ status: 'invalid-plan' });
  const bytes = await readFile(path, 'utf8');
  expect(bytes.includes(config.token) !== bytes.includes('other-synthetic-token-1234')).toBe(true);
  expect(await readdir(dirname(path))).toEqual(['agent-pet.ts']);
  const winner = results[0]!.status === 'deployed' ? deploy : other;
  const receipt = results.find(r => r.status === 'deployed')!;
  if (receipt.status === 'deployed') expect((await winner.withdraw(receipt.receipt)).file).toBe('removed');
});

it.each(['settings', 'target-replaced', 'extension-created', 'sibling-created'] as const)('rejects stale preview after %s without overwriting', async change => {
  const { deploy, target, root, path } = await fixture(true);
  await mkdir(dirname(path), { mode: 0o700 });
  const preview = await deploy.preview();
  if (change === 'settings') await writeFile(join(target, 'settings.json'), '{}');
  if (change === 'target-replaced') { await rename(target, join(root, 'original')); await mkdir(target); }
  if (change === 'extension-created') await writeFile(path, 'unknown');
  if (change === 'sibling-created') await writeFile(join(target, 'unknown'), 'keep');
  expect(await deploy.apply(preview)).toEqual({ status: 'stale-plan' });
  if (change === 'extension-created') expect(await readFile(path, 'utf8')).toBe('unknown');
  else await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each(['unknown', 'generated'] as const)('never adopts or overwrites a same-name %s file', async kind => {
  const { deploy, path } = await fixture(true);
  await mkdir(dirname(path), { mode: 0o700 });
  const bytes = kind === 'generated' ? await renderer.renderConfiguredPiExtension(config) : '\0unknown\xff';
  await writeFile(path, bytes, { mode: 0o600 });
  const preview = await deploy.preview();
  expect(preview.action).toBe('blocked');
  expect(preview.findings).toContain('existing-extension');
  expect(await deploy.apply(preview)).toEqual({ status: 'invalid-plan' });
  expect((await deploy.withdraw({ path, status: 'deployed-awaiting-load' })).file).toBe('retained-unknown');
  expect(await readFile(path, 'utf8')).toBe(bytes);
});

it.each(['settings.json', '.ignore', 'extensions/index.ts', 'extensions/package.json'] as const)('does not change or bypass loading obstacle %s', async relative => {
  const { deploy, target, path } = await fixture(true);
  await mkdir(dirname(path), { mode: 0o700 });
  const obstacle = join(target, relative);
  const bytes = relative === 'settings.json' ? '{"extensions":["!extensions/agent-pet.ts"]}' : '{}';
  await writeFile(obstacle, bytes, { mode: 0o600 });
  const preview = await deploy.preview();
  expect(preview.action).toBe('blocked');
  expect(await deploy.apply(preview)).toEqual({ status: 'invalid-plan' });
  expect(await readFile(obstacle, 'utf8')).toBe(bytes);
  await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects missing parents and symlink targets instead of discovering or creating them', async () => {
  const { root, target } = await fixture();
  const missing = new PiTemporaryDeployment(join(target, 'nested'), config);
  expect((await missing.preview()).action).toBe('blocked');
  await mkdir(join(root, 'actual'));
  await symlink(join(root, 'actual'), target);
  const linked = new PiTemporaryDeployment(target, config);
  expect((await linked.preview()).action).toBe('blocked');
  expect(await readdir(join(root, 'actual'))).toEqual([]);
});

it.each(['edited', 'replaced', 'symlink'] as const)('withdrawal retains an %s own path and all unknown siblings', async change => {
  const { deploy, path, target } = await fixture();
  const { receipt } = await apply(deploy);
  const bytes = await readFile(path, 'utf8');
  const sibling = join(target, 'extensions', 'unknown.ts');
  await writeFile(sibling, 'unknown sibling');
  if (change === 'edited') await writeFile(path, bytes + '\n// user edit');
  if (change === 'replaced') { await rename(path, join(target, 'original')); await writeFile(path, bytes, { mode: 0o600 }); }
  if (change === 'symlink') { await unlink(path); await symlink(sibling, path); }
  const result = await deploy.withdraw(receipt);
  expect(['retained-changed', 'failed-preserved']).toContain(result.file);
  expect(await readFile(path, 'utf8')).toBe(change === 'edited' ? bytes + '\n// user edit' : change === 'symlink' ? 'unknown sibling' : bytes);
  expect(await readFile(sibling, 'utf8')).toBe('unknown sibling');
});

it.each(['sibling', 'permissions', 'replacement', 'transient-sibling'] as const)('withdraws unchanged own file but retains %s changed directory', async change => {
  const { deploy, path, target, root } = await fixture();
  const { receipt } = await apply(deploy);
  if (change === 'sibling' || change === 'transient-sibling') {
    const sibling = join(dirname(path), 'unknown.ts');
    await writeFile(sibling, 'keep');
    if (change === 'transient-sibling') await unlink(sibling);
  }
  if (change === 'permissions') await chmod(dirname(path), 0o750);
  if (change === 'replacement') {
    await rename(dirname(path), join(root, 'old-extensions'));
    await mkdir(dirname(path), { mode: 0o700 });
    await rename(join(root, 'old-extensions', 'agent-pet.ts'), path);
  }
  const result = await deploy.withdraw(receipt);
  // A rename can change file ctime: preserving it is the conservative result.
  if (change === 'replacement') expect(['removed', 'retained-changed']).toContain(result.file);
  else expect(result.file).toBe('removed');
  expect(result.directories).toBe('retained');
  expect((await lstat(target)).isDirectory()).toBe(true);
  expect((await lstat(dirname(path))).isDirectory()).toBe(true);
  if (change === 'sibling') expect(await readFile(join(dirname(path), 'unknown.ts'), 'utf8')).toBe('keep');
});

it.each(['partial-write', 'close'] as const)('reports %s uncertainty truthfully and preserves residual bytes without adoption', async failure => {
  const { deploy, path } = await fixture(false, {
    async write(file, source) {
      await file.writeFile(failure === 'partial-write' ? source.slice(0, 40) : source);
      if (failure === 'partial-write') throw new Error(config.token);
    },
    async close(file) { await file.close(); throw new Error(config.endpoint); },
  });
  const preview = await deploy.preview();
  const result = await deploy.apply(preview);
  expect(result).toEqual({ status: 'failed-preserved' });
  expect((await lstat(path)).size).toBeGreaterThan(0);
  const bytes = await readFile(path, 'utf8');
  expect(await deploy.apply(preview)).toEqual({ status: 'invalid-plan' });
  expect((await deploy.preview()).action).toBe('blocked');
  expect((await deploy.withdraw({ path, status: 'deployed-awaiting-load' })).file).toBe('retained-unknown');
  expect(await readFile(path, 'utf8')).toBe(bytes);
  for (const secret of Object.values(config)) {
    expect(JSON.stringify({ leaked: secret })).toContain(secret);
    expect(JSON.stringify({ preview, result, deploy })).not.toContain(secret);
  }
});

it('captures configuration at construction and never accepts changed caller configuration on confirmation', async () => {
  const { target, path } = await fixture();
  const supplied = { ...config };
  const deploy = new PiTemporaryDeployment(target, supplied);
  const preview = await deploy.preview();
  supplied.token = 'changed-synthetic-token-123';
  supplied.endpoint = 'changed-synthetic-endpoint';
  expect(Object.isFrozen(preview)).toBe(true);
  expect(Object.isFrozen(preview.target)).toBe(true);
  expect((await deploy.apply(preview)).status).toBe('deployed');
  const source = await readFile(path, 'utf8');
  expect(source).toContain(config.token);
  expect(source).toContain(config.endpoint);
  expect(source).not.toContain(supplied.token);
  expect(source).not.toContain(supplied.endpoint);
});

it('keeps configuration/source only in host memory and the private artifact, never preview/results/errors/logs', async () => {
  const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
  const { deploy, path, target } = await fixture();
  const { preview, receipt } = await apply(deploy);
  const publicText = JSON.stringify({ deploy, preview, receipt, unknown: await deploy.withdraw({ ...receipt } as TemporaryDeploymentReceipt) });
  const source = await readFile(path, 'utf8');
  for (const secret of Object.values(config)) {
    expect(source).toContain(secret);
    expect(JSON.stringify({ leaked: secret })).toContain(secret);
    expect(publicText).not.toContain(secret);
  }
  expect(publicText).not.toContain('node:net');
  expect(logs.every(log => log.mock.calls.length === 0)).toBe(true);
  const invalid = new PiTemporaryDeployment(target, { endpoint: config.endpoint, token: 'short' });
  await expect(invalid.preview()).rejects.toThrow(/^Temporary pi preview failed$/);
  expect((await deploy.withdraw(receipt)).file).toBe('removed');
});
