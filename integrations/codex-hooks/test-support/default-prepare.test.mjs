import { mkdtemp, realpath, chmod, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'vite';
import { expect, it } from 'vitest';
it('builds the actual configuration composition as a self-contained native review helper without executing an Agent', async () => {
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'codex-default-build-fixture-'))); await chmod(folder, 0o700);
  try {
    const output = await build({ configFile: false, logLevel: 'silent', ssr: { noExternal: [/^@agent-pet\//] },
      build: { write: false, ssr: resolve('apps/desktop/src/main/configurations.ts'), rollupOptions: { output: { format: 'cjs' } } } });
    const chunk = output.output.find(item => item.type === 'chunk' && item.isEntry);
    expect(chunk).toBeTruthy(); expect(chunk.code).not.toMatch(/require\(['"]@agent-pet\//);
    const path = join(folder, 'configurations.cjs'); await writeFile(path, chunk.code, { flag: 'wx', mode: 0o600 });
    const { Configurations } = createRequire(import.meta.url)(path);
    const collection = new Configurations({ directory: folder, adapter: () => { throw new Error('No Agent permitted'); }, publish: () => {} });
    expect(collection.snapshot().records).toEqual([]); await collection.stop();
  } finally { await rm(folder, { recursive: true, force: true }); }
});
