import { defineConfig, externalizeDepsPlugin, type ElectronViteConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { build } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Source compilation for both dev and build; this does not create an application package.
async function compileClaudeRuntime(): Promise<void> {
  for (const [source, name] of [['command-entry', 'hook'], ['launcher-entry', 'launcher'], ['native-hook-entry', 'native-hook']] as const) {
    await build({ configFile: false, logLevel: 'warn', build: {
      ssr: resolve('../../integrations/claude-hooks', `${source}.ts`),
      outDir: resolve('out/claude-runtime'), emptyOutDir: false,
      rollupOptions: { output: { format: 'cjs', entryFileNames: `${name}.cjs`, inlineDynamicImports: true } },
    } });
  }
  if (process.platform === 'darwin') await promisify(execFile)('/usr/bin/clang', ['-O2', '-Wall', '-Wextra', '-Werror',
    resolve('../../integrations/claude-hooks/native-process-probe.c'), '-o', resolve('out/claude-runtime/process-probe')],
    { timeout: 15000, maxBuffer: 16384 });
  await build({ configFile: false, logLevel: 'warn', build: {
    ssr: resolve('../../integrations/codex-hooks/native-hook-entry.ts'), outDir: resolve('out/codex-runtime'), emptyOutDir: false,
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'native-hook.cjs', inlineDynamicImports: true } },
  } });
}

export default defineConfig(async (): Promise<ElectronViteConfig> => {
  await compileClaudeRuntime();
  return {
    main: {
      plugins: [externalizeDepsPlugin({ exclude: ['@agent-pet/application', '@agent-pet/domain', '@agent-pet/adapter-core', '@agent-pet/adapter-pi', '@agent-pet/pet-runtime'] })],
      build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } },
    },
    preload: {
      build: { rollupOptions: { input: { index: resolve('src/preload/index.ts'), management: resolve('src/preload/management.ts') }, output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
    },
    renderer: { plugins: [react()], build: { rollupOptions: { input: { index: resolve('src/renderer/index.html'), management: resolve('src/renderer/management.html') } } } },
  };
});
