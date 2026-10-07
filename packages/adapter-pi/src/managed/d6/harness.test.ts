import { test, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import net from 'node:net';
import { join } from 'node:path';
import { createManagedPiService, connectManagedPiClient } from '../index.js';
import { productionPolicy } from '../path-policy.js';
import { runHarness } from './harness.js';
import { exitCode, serializeCases, serializeCleanup, serializeEnvironment, type Environment } from './evidence.js';

test('D6.1 bounded current-account harness: fixture behavior is distinct from blocked admission', async () => {
  const result = await runHarness(async () => {
    let inputReads = 0;
    const options = new Proxy({}, { get() { inputReads++; throw new Error('D6_INPUT'); } });
    // Public gates must not even inspect options; also count actual filesystem/socket entry calls.
    const spies = [vi.spyOn(fs, 'open'), vi.spyOn(fs, 'lstat'), vi.spyOn(fs, 'mkdir'), vi.spyOn(fs, 'readFile'),
      vi.spyOn(fs, 'writeFile'), vi.spyOn(net, 'createConnection'), vi.spyOn(net, 'createServer')];
    let ioCalls = 0;
    try {
      await expect(createManagedPiService(options as never)).rejects.toThrow('acl-unverified');
      await expect(connectManagedPiClient(options as never)).rejects.toThrow('acl-unverified');
      await expect(productionPolicy.openRoots(options as never)).rejects.toThrow('acl-unverified');
      ioCalls = spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
      expect(inputReads).toBe(0); expect(ioCalls).toBe(0);
    } finally { for (const spy of spies) spy.mockRestore(); }
    return { inputReads, ioCalls };
  });
  const output = process.env.D61_OUTPUT;
  if (output) {
    const environment: Environment = { schema: 1, scope: 'synthetic-current-account', productionAdmission: 'BLOCKED',
      platform: process.platform === 'darwin' || process.platform === 'linux' ? process.platform : 'other',
      arch: process.arch === 'arm64' || process.arch === 'x64' ? process.arch : 'other', node: process.version,
      commit: process.env.D61_COMMIT!, harnessDigest: process.env.D61_DIGEST!,
      nativeVersion: result.nativeAvailable ? 1 : null, napi: result.nativeAvailable ? 8 : null };
    await fs.writeFile(join(output, 'environment.json'), serializeEnvironment(environment), { flag: 'wx', mode: 0o600 });
    await fs.writeFile(join(output, 'cases.jsonl'), serializeCases(result.cases), { flag: 'wx', mode: 0o600 });
    await fs.writeFile(join(output, 'cleanup.json'), serializeCleanup(result.cleanup), { flag: 'wx', mode: 0o600 });
  }
  // A passing self-test is explicitly not a passing security/production gate.
  expect(result.cases.filter(c => c.status === 'FAIL').map(c => c.id)).toEqual([]);
  expect(result.cleanup.status).not.toBe('FAIL');
  expect(exitCode(result.cases, result.cleanup)).toBe(2);
  expect(result.cases.find(c => c.id === 'socket-native')?.status).toBe('BLOCKED');
}, 20_000);
