import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@agent-pet/application', '@agent-pet/domain', '@agent-pet/adapter-core', '@agent-pet/adapter-pi'] })],
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } },
  },
  preload: {
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts'), management: resolve('src/preload/management.ts') }, output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: { plugins: [react()], build: { rollupOptions: { input: { index: resolve('src/renderer/index.html'), management: resolve('src/renderer/management.html') } } } },
});
