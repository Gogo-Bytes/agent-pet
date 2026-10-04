import { parentPort, workerData } from 'node:worker_threads';
import { randomBytes } from 'node:crypto';
import { fixturePolicy } from '../test-policy.js';
import { PrivateFiles } from '../private-files.js';
import { NodeFilesPort, REMOVE_AFTER_DRAIN } from '../node-files-port.js';
import { DarwinFilesPort } from '../darwin-files-port.js';
import type { FileReceipt, FilesPort, OwnerClaim, WriteTransaction } from '../files-port.js';
import { fail, ManagedError } from '../errors.js';
import { validateEnvelope, validateRequestBody, sanitizedWorkerError } from './validation.js';
import { MAX_RECEIPTS, MAX_TRANSACTIONS, WORKER_PROTOCOL, type RequestBody, type ReplyBody, type ReplyResult, type WireEnvelope, type OpaqueId } from './protocol.js';

if (!parentPort) throw new Error('protocol-failure');
const generation: OpaqueId = workerData && typeof workerData.workerGeneration === 'string' && /^[a-f0-9]{32}$/.test(workerData.workerGeneration) ? workerData.workerGeneration : randomBytes(16).toString('hex');
// Test-only cooperative delay: this yields to the Worker event loop and is
// not native syscall blocking, cancellation, or fault injection.
const testPauseMs = workerData && Number.isSafeInteger(workerData.testPauseMs) && workerData.testPauseMs >= 0 && workerData.testPauseMs <= 1000 ? workerData.testPauseMs : 0;
const testSmokeStages = workerData?.testSmokeStages === true;
const smokeStage = (name: string): void => { if (testSmokeStages) console.log(`B4.3 STAGE ${name} t=${Date.now()}`); };
smokeStage('worker-entry-loaded');
let sendSequence = 0; let receiveSequence = 0;
let storage: FilesPort | undefined; let owner: OwnerClaim | undefined; let ownerCap: OpaqueId | undefined; let stopped = false;
let initializationFailed = false;
const receipts = new Map<OpaqueId, FileReceipt>();
const transactions = new Map<OpaqueId, WriteTransaction>();
let receiptReservations = 0;
let transactionReservations = 0;
const cap = (): OpaqueId => randomBytes(16).toString('hex');
function reserveReceipt(reclaim = 0): { commit(value: FileReceipt): OpaqueId; release(): void } {
  if (receipts.size + receiptReservations - reclaim >= MAX_RECEIPTS) fail('limit-exceeded');
  receiptReservations++;
  let settled = false;
  return {
    commit(value) { if (settled) throw new Error('protocol-failure'); settled = true; receiptReservations--; const key = cap(); receipts.set(key, value); return key; },
    release() { if (!settled) { settled = true; receiptReservations--; } },
  };
}
function reserveTransaction(): { commit(value: WriteTransaction): OpaqueId; release(): void } {
  if (transactions.size + transactionReservations >= MAX_TRANSACTIONS) fail('limit-exceeded');
  transactionReservations++;
  let settled = false;
  return {
    commit(value) { if (settled) throw new Error('protocol-failure'); settled = true; transactionReservations--; const key = cap(); transactions.set(key, value); return key; },
    release() { if (!settled) { settled = true; transactionReservations--; } },
  };
}
function post(kind: 'reply' | 'event', requestId: OpaqueId, body: ReplyBody | { type: 'ready' } | { type: 'failed'; error: ReturnType<typeof sanitizedWorkerError> } | { type: 'stopped'; clean: boolean }): void {
  const envelope: WireEnvelope = { protocolVersion: WORKER_PROTOCOL, kind, workerGeneration: generation, sequence: ++sendSequence, requestId, body } as WireEnvelope;
  parentPort!.postMessage(envelope);
}
function protocolFailure(): void {
  try { post('event', cap(), { type: 'failed', error: { code: 'protocol-failure', effect: 'none' } }); } catch { /* transport is already unavailable */ }
}
function requireOwner(value: OpaqueId): FilesPort {
  if (!storage || !ownerCap || value !== ownerCap || stopped) fail('unavailable');
  return storage;
}
async function cleanupInitialization(candidate: { files?: FilesPort; claim?: OwnerClaim; ownerState: 'none' | 'definitely-acquired' | 'acquisition-uncertain' | 'close-uncertain' }): Promise<ManagedError | undefined> {
  const files = candidate.files;
  if (!files) return undefined;
  if (candidate.ownerState === 'definitely-acquired' && candidate.claim) {
    try { await files.drain(); } catch { return new ManagedError('outcome-uncertain'); }
    try { await candidate.claim.remove(); } catch {
      // An uncertain owner remains the restart barrier. Never retry or close it.
      if (!candidate.claim.removed) return undefined;
    }
    if (!candidate.claim.removed) return undefined;
    try { await candidate.claim.close(); } catch { candidate.ownerState = 'close-uncertain'; return new ManagedError('outcome-uncertain'); }
  } else if (candidate.ownerState === 'acquisition-uncertain' || candidate.ownerState === 'close-uncertain') {
    // Preserve unknown ownership/close barriers. No owner removal is legal.
    return undefined;
  } else {
    // A definite ownership-busy result means no owner directory was acquired.
    // Drain first so Darwin can release its retained lease/root handles.
    try { await files.drain(); } catch { candidate.ownerState = 'close-uncertain'; return new ManagedError('outcome-uncertain'); }
  }
  try { await files.close(); } catch { candidate.ownerState = 'close-uncertain'; return new ManagedError('outcome-uncertain'); }
  return undefined;
}
function takeReceipt(key: OpaqueId): FileReceipt {
  const value = receipts.get(key); if (!value) fail('path-changed');
  receipts.delete(key); return value;
}
async function dispatch(body: RequestBody): Promise<ReplyResult> {
  if (body.type === 'init') {
    if (storage || initializationFailed) fail('unavailable');
    const candidate: { files?: FilesPort; claim?: OwnerClaim; ownerState: 'none' | 'definitely-acquired' | 'acquisition-uncertain' | 'close-uncertain' } = { ownerState: 'none' };
    try {
      if (body.backend === 'node-fixture') {
        const policy = await fixturePolicy(body.roots);
        const scope = await policy.openRoots(body.roots);
        const files = new PrivateFiles(scope);
        await files.directory(body.roots.storageRoot, 'ownership'); await files.directory(body.roots.runtimeRoot, 'ownership');
        candidate.files = new NodeFilesPort(files);
      } else {
        // Darwin owns storageRoot, lease, owner and all native handles inside
        // this fixed Worker. Main never constructs this backend.
        smokeStage('native-open-start');
        candidate.files = await DarwinFilesPort.open(body.roots.storageRoot, body.initialize);
        smokeStage('native-open-complete');
      }
      try {
        candidate.claim = await candidate.files.acquireOwner();
        candidate.ownerState = 'definitely-acquired';
      } catch (error) {
        // Darwin distinguishes a definite existing owner from a mutation whose
        // result is unknown. Only the former permits releasing the lease/root.
        candidate.ownerState = error instanceof ManagedError && error.code === 'ownership-busy'
          ? 'none' : 'acquisition-uncertain';
        throw error;
      }
      storage = candidate.files; owner = candidate.claim; ownerCap = cap();
      return { type: 'initialized', ownerCap };
    } catch (error) {
      const cleanupError = await cleanupInitialization(candidate);
      initializationFailed = true; stopped = true;
      throw cleanupError ?? error;
    }
  }
  const files = requireOwner(body.ownerCap);
  switch (body.type) {
    case 'read': {
      const receipt = reserveReceipt();
      try { const result = await files.read(body.path, body.maxBytes, body.operation); return { type: 'read', value: result.value as any, receiptCap: receipt.commit(result.owned) }; }
      catch (error) { receipt.release(); throw error; }
    }
    case 'release': { const value = takeReceipt(body.receiptCap); await files.release(value); return { type: 'released' }; }
    case 'create-directory': await files.createDirectory(body.path, body.operation); return { type: 'directory-created' };
    case 'begin-write': {
      const reservation = reserveTransaction();
      try { const transaction = await files.beginWrite(body.path, body.maxBytes, body.operation); return { type: 'transaction-begun', transactionCap: reservation.commit(transaction), state: 'Prepared' }; }
      catch (error) { reservation.release(); throw error; }
    }
    case 'transaction-write': { const transaction = transactions.get(body.transactionCap); if (!transaction) fail('unavailable'); await transaction.write(body.value); return { type: 'transaction-written', state: 'Writing' }; }
    case 'transaction-publish-new': {
      const transaction = transactions.get(body.transactionCap); if (!transaction) fail('unavailable');
      const receipt = reserveReceipt();
      try { const result = await transaction.publishNew(); return { type: 'published', receiptCap: receipt.commit(result), state: 'Published' }; }
      catch (error) { receipt.release(); throw error; }
    }
    case 'transaction-publish-replace': {
      const transaction = transactions.get(body.transactionCap); if (!transaction) fail('unavailable');
      const previous = receipts.get(body.receiptCap); if (!previous) fail('path-changed');
      const receipt = reserveReceipt(1);
      try {
        receipts.delete(body.receiptCap);
        const result = await transaction.publishReplace(previous);
        return { type: 'published', receiptCap: receipt.commit(result), state: 'Published' };
      } catch (error) { receipt.release(); throw error; }
    }
    case 'transaction-abort': { const transaction = transactions.get(body.transactionCap); if (!transaction) fail('unavailable'); await transaction.abort(); return { type: 'transaction-aborted', state: 'Aborted' }; }
    case 'transaction-close': { const transaction = transactions.get(body.transactionCap); if (!transaction) fail('unavailable'); await transaction.close(); const state = transaction.state; if (state === 'Published' || state === 'Aborted') transactions.delete(body.transactionCap); return { type: 'transaction-closed', state }; }
    case 'remove': { const value = takeReceipt(body.receiptCap); await files.remove(value); return { type: 'removed' }; }
    case 'drain': await files.drain(); transactions.clear(); return { type: 'drained', transactions: 0 };
    case 'remove-after-drain': {
      const value = takeReceipt(body.receiptCap);
      if (files instanceof NodeFilesPort) await files[REMOVE_AFTER_DRAIN](value, owner!);
      else if (files instanceof DarwinFilesPort) await files.removeAfterDrain(value);
      else fail('unavailable');
      return { type: 'removed' };
    }
    case 'remove-owner': {
      if (!owner || body.ownerCap !== ownerCap) fail('unavailable');
      let removalError: unknown;
      try { await owner.remove(); } catch (error) { removalError = error; }
      // A known unlink followed by parent/lock sync or disposal failure is a
      // terminal committed outcome. Main must fence, but must not recreate or
      // reacquire the already-removed owner.
      if (owner.removed) {
        try { await owner.close(); await files.close(); } catch (error) { removalError ??= error; }
        stopped = true;
      }
      if (removalError) {
        const committed = owner.removed;
        const error = Object.assign(new Error(committed ? 'owner-unlink-committed' : 'outcome-uncertain'), {
          code: committed ? 'owner-unlink-committed' : 'outcome-uncertain', effect: committed ? 'committed' : 'uncertain',
        });
        throw error;
      }
      return { type: 'owner-removed', parentSync: 'complete' };
    }
  }
}
parentPort.on('message', async (value: unknown) => {
  if (stopped) return;
  let envelope: WireEnvelope;
  try {
    validateEnvelope(value);
    envelope = value;
    // Fence foreign generations before advancing sequence or touching backend state.
    if (envelope.workerGeneration !== generation || envelope.kind !== 'request' || envelope.sequence !== receiveSequence + 1) throw new Error('protocol-failure');
    receiveSequence = envelope.sequence;
    validateRequestBody(envelope.body);
  }
  catch { protocolFailure(); return; }
  try {
    const result = await dispatch(envelope.body);
    if (envelope.body.type === 'init' && testPauseMs > 0) await new Promise<void>(resolve => setTimeout(resolve, testPauseMs));
    post('reply', envelope.requestId, { type: 'reply', ok: true, result });
    if (envelope.body.type === 'init') post('event', cap(), { type: 'ready' });
    if (envelope.body.type === 'remove-owner') { post('event', envelope.requestId, { type: 'stopped', clean: true }); parentPort!.unref(); }
  } catch (error) {
    // Preserve only the fixed code/effect union; never forward native details.
    const safe = sanitizedWorkerError(error);
    post('reply', envelope.requestId, { type: 'reply', ok: false, error: safe });
  }
});
