import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
/** Test-only host for the production Renderer. Not an Electron build entry. */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer/test-support'), plugins: [react()],
  build: { rollupOptions: { input: {
    management: resolve(__dirname, 'src/renderer/test-support/management-review.html'),
    connectionScenes: resolve(__dirname, 'src/renderer/test-support/connection-scenes.html'),
    connectionFrame: resolve(__dirname, 'src/renderer/test-support/connection-scene-frame.html'),
  } } },
  server: { host: '127.0.0.1', port: 4175, strictPort: true, fs: { allow: [resolve(__dirname, '../../..')] } },
});
