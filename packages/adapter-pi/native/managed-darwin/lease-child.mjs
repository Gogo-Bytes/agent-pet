// Test-only independent process: no services, user paths, credentials, or account changes.
import { createRequire } from 'node:module';
const n = createRequire(import.meta.url)('./out/managed-darwin.node');
const root = n.openRoot(process.argv[2]);
try {
  const lease = n.acquireWriter(root);
  if (process.argv[3] === 'hold') {
    process.send?.({ state: 'held' });
    // A live holder is deliberately unresponsive to protocol/connection probes.
    setInterval(() => {}, 1000);
  } else {
    n.close(lease); n.close(root);
    process.stdout.write('acquired\n');
  }
} catch (error) {
  n.close(root);
  if (error.code !== 'ownership-busy') throw error;
  process.stdout.write('busy\n');
}
