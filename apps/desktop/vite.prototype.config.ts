import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve('apps/desktop/prototype'),
  plugins: [react()],
  build: { rollupOptions: { input: {
    prototype: resolve('apps/desktop/prototype/index.html'),
    glassStudy: resolve('apps/desktop/prototype/glass-study.html'),
  } } },
  server: { strictPort: true, port: 4174 },
});
