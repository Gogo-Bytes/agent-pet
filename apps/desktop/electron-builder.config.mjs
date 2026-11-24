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
  extraResources: [
    { from: resolve('apps/desktop/out/claude-runtime'), to: 'out/claude-runtime', filter: ['hook.cjs', 'launcher.cjs', 'native-hook.cjs', 'process-probe'] },
    { from: resolve('apps/desktop/out/codex-runtime'), to: 'out/codex-runtime', filter: ['native-hook.cjs'] },
  ],
  files: [
    'out/main/index.cjs',
    'out/preload/{index,management}.cjs',
    'out/renderer/{index,management}.html',
    'out/renderer/assets/*.{js,css}',
    'out/renderer/assets/starter-*.glb',
    'package.json',
    '!node_modules/**',
  ],
  mac: {
    target: [{ target: 'dir', arch: ['arm64', 'x64'] }],
    minimumSystemVersion: '11.0',
    identity: null,
    category: 'public.app-category.utilities',
    hardenedRuntime: false,
  },
  npmRebuild: false,
  nodeGypRebuild: false,
  publish: null,
};
