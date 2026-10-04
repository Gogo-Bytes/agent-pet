import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { validateStagedResourceFiles, validateStagedResourceManifest, type StagedResourceManifest } from './staged-resource.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function manifest(): StagedResourceManifest {
  const file = (path: string, value: string) => ({ path, sha256: digest(value) });
  return { schema: 1, electron: '36.9.5', platform: 'darwin', arch: 'arm64',
    native: { version: 1, writeVersion: 1, napi: 8, addon: file('native/managed-darwin.node', 'native') },
    worker: { entry: file('src/managed/worker/entry.mjs', 'entry'), loader: file('src/managed/worker/loader.mjs', 'loader'), files: [file('src/managed/worker/protocol.ts', 'protocol')] } };
}

describe('B4.4a staged resource manifest', () => {
  test('accepts canonical hashes/version/arch/relative paths and verifies files', async () => {
    const root = await mkdtemp('/tmp/agent-pet-b44-manifest-');
    try {
      await mkdir(join(root, 'native')); await mkdir(join(root, 'src/managed/worker'), { recursive: true });
      await writeFile(join(root, 'native/managed-darwin.node'), 'native'); await writeFile(join(root, 'src/managed/worker/entry.mjs'), 'entry');
      await writeFile(join(root, 'src/managed/worker/loader.mjs'), 'loader'); await writeFile(join(root, 'src/managed/worker/protocol.ts'), 'protocol');
      const value = manifest(); validateStagedResourceManifest(value, { electron: '36.9.5', platform: 'darwin', arch: 'arm64' });
      await validateStagedResourceFiles(root, value);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test('rejects a file hash mismatch before Worker import', async () => {
    const root = await mkdtemp('/tmp/agent-pet-b44-hash-');
    try {
      await mkdir(join(root, 'native')); await mkdir(join(root, 'src/managed/worker'), { recursive: true });
      await writeFile(join(root, 'native/managed-darwin.node'), 'native'); await writeFile(join(root, 'src/managed/worker/entry.mjs'), 'changed');
      await writeFile(join(root, 'src/managed/worker/loader.mjs'), 'loader'); await writeFile(join(root, 'src/managed/worker/protocol.ts'), 'protocol');
      const value = manifest(); validateStagedResourceManifest(value, { electron: '36.9.5', platform: 'darwin', arch: 'arm64' });
      await expect(validateStagedResourceFiles(root, value)).rejects.toThrow('staged-resource-manifest:hash');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test.each([
    ['override', (m: any) => { m.nativeAddonPath = '/tmp/override.node'; }],
    ['schema mismatch', (m: any) => { m.schema = 2; }],
    ['native version', (m: any) => { m.native.version = 2; }],
    ['napi mismatch', (m: any) => { m.native.napi = 10; }],
    ['fixed path mismatch', (m: any) => { m.native.addon.path = 'native/other.node'; }],
    ['traversal', (m: any) => { m.worker.entry.path = '../entry.ts'; }],
    ['absolute path', (m: any) => { m.worker.entry.path = '/tmp/entry.ts'; }],
    ['electron mismatch', (m: any) => { m.electron = '35.0.0'; }],
    ['arch mismatch', (m: any) => { m.arch = 'x64'; }],
    ['duplicate path', (m: any) => { m.worker.loader.path = m.worker.entry.path; }],
    ['extra addon entry key', (m: any) => { m.native.addon.mode = 'staged'; }],
    ['extra worker entry key', (m: any) => { m.worker.files[0].mode = 'staged'; }],
  ])('rejects %s', (_name, mutate) => {
    const value = manifest(); mutate(value);
    expect(() => validateStagedResourceManifest(value, { electron: '36.9.5', platform: 'darwin', arch: 'arm64' })).toThrow('staged-resource-manifest');
  });
});
