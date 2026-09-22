// Test-only Worker environment. Existing fixture lock only; no bootstrap or core integration.
import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';
const n = createRequire(import.meta.url)('./out/managed-darwin.node');
const root = n.openRoot(workerData);
n.acquireWriter(root); // Native self-reference, deliberately no JS lease reference.
n.close(root); // Must invalidate operations, not release the lease.
parentPort.postMessage({ state: 'held-root-closed' });
parentPort.once('message', () => parentPort.close()); // Normal teardown, with the host still alive.
