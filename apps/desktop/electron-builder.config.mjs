import { resolve } from 'node:path';

/**
 * Local MVP packaging only. The output directory is supplied by the package
 * script so generated .app bundles stay outside the source tree.
 */
export default {
  appId: 'com.agentpet.desktop',
  productName: 'Agent Pet',
  asar: true,
  electronVersion: '36.9.5',
  directories: {
    app: resolve('apps/desktop'),
    output: process.env.AGENT_PET_BUILD_DIR ?? resolve('dist/agent-pet-local'),
  },
  files: [
    'out/**',
    'package.json',
    '!node_modules/**',
    '!src/**',
    '!electron.vite.config.ts',
    '!electron-builder.config.mjs',
  ],
  mac: {
    target: [{ target: 'dir', arch: ['arm64'] }],
    category: 'public.app-category.utilities',
    hardenedRuntime: false,
  },
  npmRebuild: false,
  nodeGypRebuild: false,
  publish: null,
};
