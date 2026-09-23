import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const n = require('./out/managed-darwin.node');
try {
  const root = n.openRoot(process.argv[2]);
  const lease = n.initializeWriter(root);
  process.send?.({ state: 'initialized' });
  setTimeout(() => {}, 30_000);
  void lease;
} catch (error) {
  process.send?.({ state: 'failed', code: error?.code ?? String(error?.message ?? error) });
  process.exitCode = 0;
}
