import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { expect, it } from 'vitest';

it('Vite bundles the canonical inert template and renders from an isolated built module without workspace reads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pet-template-build-'));
  try {
    await build({ configFile: false, logLevel: 'silent', build: {
      ssr: resolve('integrations/pi-extension/configured-source.ts'), outDir: directory, emptyOutDir: false,
      rollupOptions: { output: { format: 'es', entryFileNames: 'render.mjs' } },
    } });
    const bundle = await readFile(join(directory, 'render.mjs'), 'utf8');
    expect(bundle).toContain('AGENT_PET_EXPLICIT_CONFIG');
    expect(bundle).not.toMatch(/readFile|__dirname/);
    const token = 'fixture-only-generated-after-build';
    expect(bundle).not.toContain(token);
    await writeFile(join(directory, 'run.mjs'), `
import { renderConfiguredPiExtension } from './render.mjs';
const text = await renderConfiguredPiExtension({ endpoint: '/fixture/never-listen.sock', token: '${token}' });
process.stdout.write(text);
`);
    const { stdout } = await promisify(execFile)(process.execPath, ['run.mjs'], { cwd: directory, env: {} });
    const canonical = await readFile(resolve('integrations/pi-extension/index.ts'), 'utf8');
    expect(stdout).toBe(canonical.replace('undefined /* AGENT_PET_EXPLICIT_CONFIG */', JSON.stringify({ endpoint: '/fixture/never-listen.sock', token })));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
