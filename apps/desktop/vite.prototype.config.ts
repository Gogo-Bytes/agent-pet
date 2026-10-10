import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve('apps/desktop/prototype'),
  plugins: [react()],
  server: { strictPort: true, port: 4174 },
});
