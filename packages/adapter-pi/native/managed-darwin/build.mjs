// Explicit developer build only. No downloads, PATH compiler lookup or runtime compilation.
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here = dirname(fileURLToPath(import.meta.url));
const headers = resolve(dirname(process.execPath), '../include/node');
const output = resolve(here, 'out/managed-darwin.node');
if (process.platform !== 'darwin' || !existsSync(`${headers}/node_api.h`)) {
  throw new Error('Native build infrastructure unavailable (Darwin and matching installed Node headers required)');
}
mkdirSync(dirname(output), { recursive: true });
const result = spawnSync('/usr/bin/clang', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2',
  '-DNAPI_VERSION=8', '-mmacosx-version-min=11.0', '-bundle', '-undefined', 'dynamic_lookup',
  '-I', headers, resolve(here, 'managed-darwin.c'), '-o', output],
{ timeout: 60_000, maxBuffer: 128 * 1024, encoding: 'utf8' });
if (result.error || result.status !== 0) throw new Error(`Native build failed: ${result.error?.message ?? result.stderr}`);
const fixture = spawnSync('/usr/bin/clang', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2',
  '-mmacosx-version-min=11.0', resolve(here, 'fixture-acl.c'), '-o', resolve(here, 'out/fixture-acl')],
{ timeout: 60_000, maxBuffer: 128 * 1024, encoding: 'utf8' });
if (fixture.error || fixture.status !== 0) throw new Error(`Fixture build failed: ${fixture.error?.message ?? fixture.stderr}`);
console.log(`Built managed-darwin: ${process.arch}, Node-API 8, macOS >=11 (local developer artifact only)`);
