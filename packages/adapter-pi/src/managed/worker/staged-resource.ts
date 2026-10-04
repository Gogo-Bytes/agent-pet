import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, readdir } from 'node:fs/promises';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';

export const STAGED_RESOURCE_SCHEMA = 1;
export const STAGED_NATIVE_VERSION = 1;
export const STAGED_NAPI_VERSION = 8;
export const STAGED_ELECTRON_VERSION = '36.9.5';

export type StagedResourceEntry = { path: string; sha256: string };
export type StagedResourceManifest = {
  schema: 1;
  electron: string;
  platform: 'darwin';
  arch: 'arm64';
  native: { version: 1; writeVersion: 1; napi: 8; addon: StagedResourceEntry };
  worker: { entry: StagedResourceEntry; loader: StagedResourceEntry; files: StagedResourceEntry[] };
};

const HASH = /^[a-f0-9]{64}$/;
function fixedRelative(value: unknown): value is string {
  if (typeof value !== 'string' || !value || isAbsolute(value) || value.includes('\\') || value.includes('\0')) return false;
  const n = normalize(value);
  return n === value && value !== '.' && !value.split('/').some(part => part === '..');
}
function entry(value: unknown): value is StagedResourceEntry {
  return !!value && typeof value === 'object' &&
    Object.keys(value).sort().join(',') === 'path,sha256' &&
    fixedRelative((value as any).path) && HASH.test((value as any).sha256);
}
function fail(reason: string): never { throw new Error(`staged-resource-manifest:${reason}`); }

/** Validate the closed-world, fixed Darwin arm64 manifest before Worker import. */
export function validateStagedResourceManifest(value: unknown, actual: {
  electron: string; platform: string; arch: string;
}, expectedWorkerPaths?: string[]): asserts value is StagedResourceManifest {
  if (!value || typeof value !== 'object') fail('not-object');
  const m = value as any;
  if (m.schema !== STAGED_RESOURCE_SCHEMA || m.electron !== actual.electron || m.electron !== STAGED_ELECTRON_VERSION ||
      m.platform !== actual.platform || m.platform !== 'darwin' || m.arch !== actual.arch || m.arch !== 'arm64') fail('runtime-mismatch');
  if (!m.native || m.native.version !== 1 || m.native.writeVersion !== 1 || m.native.napi !== 8 || !entry(m.native.addon)) fail('native-contract');
  if (!m.worker || !entry(m.worker.entry) || !entry(m.worker.loader) || !Array.isArray(m.worker.files) || m.worker.files.length === 0) fail('worker-contract');
  if (m.native.addon.path !== 'native/managed-darwin.node' || m.worker.entry.path !== 'src/managed/worker/entry.mjs' || m.worker.loader.path !== 'src/managed/worker/loader.mjs') fail('fixed-path');
  if (Object.keys(m).sort().join(',') !== 'arch,electron,native,platform,schema,worker' || Object.keys(m.native).sort().join(',') !== 'addon,napi,version,writeVersion' || Object.keys(m.worker).sort().join(',') !== 'entry,files,loader') fail('override');
  const paths = [m.native.addon.path, m.worker.entry.path, m.worker.loader.path, ...m.worker.files.map((x: any) => x?.path)];
  if (new Set(paths).size !== paths.length || paths.some(path => !fixedRelative(path))) fail('relative-path');
  if (m.worker.files.some((x: any) => !entry(x))) fail('worker-file');
  if (expectedWorkerPaths && JSON.stringify(paths.slice(1).sort()) !== JSON.stringify([...expectedWorkerPaths].sort())) fail('closure-mismatch');
}

export async function validateStagedResourceFiles(root: string, manifest: StagedResourceManifest): Promise<void> {
  const entries = [manifest.native.addon, manifest.worker.entry, manifest.worker.loader, ...manifest.worker.files];
  const rootReal = await realpath(root);
  if ((await lstat(root)).isSymbolicLink()) fail('root-symlink');
  for (const item of entries) {
    const target = resolve(rootReal, item.path);
    const rel = relative(rootReal, target);
    if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail('resolved-path');
    let cursor = rootReal;
    for (const component of item.path.split('/')) { cursor = resolve(cursor, component); if ((await lstat(cursor)).isSymbolicLink()) fail('symlink'); }
    if (await realpath(target) !== target) fail('realpath');
    const stat = await lstat(target).catch(() => undefined);
    if (!stat || !stat.isFile() || stat.isSymbolicLink()) fail(`missing:${item.path}`);
    const digest = createHash('sha256').update(await readFile(target)).digest('hex');
    if (digest !== item.sha256) fail(`hash:${item.path}`);
  }
  const allowed = new Set([...entries.map(item => item.path), 'manifest.json']);
  const walk = async (directory: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      const path = resolve(directory, name); const stat = await lstat(path);
      if (stat.isSymbolicLink()) fail('symlink');
      if (stat.isDirectory()) await walk(path);
      else if (!stat.isFile() || !allowed.has(relative(rootReal, path))) fail('unexpected-file');
    }
  };
  await walk(rootReal);
}
