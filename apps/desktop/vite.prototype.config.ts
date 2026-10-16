import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve('apps/desktop/prototype'),
  plugins: [react()],
  define: { __DESKTOP_VERSION__: JSON.stringify(JSON.parse(readFileSync(resolve('apps/desktop/package.json'), 'utf8')).version) },
  build: { rollupOptions: { input: {
    prototype: resolve('apps/desktop/prototype/index.html'),
    glassStudy: resolve('apps/desktop/prototype/glass-study.html'),
  } } },
  server: { strictPort: true, port: 4174 },
});
