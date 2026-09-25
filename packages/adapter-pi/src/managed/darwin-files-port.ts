import { randomBytes } from 'node:crypto';
import { relative, sep } from 'node:path';
import { fail, sanitized } from './errors.js';
import type { FileReceipt, FilesPort, OwnerClaim, ReadOperation, TransactionState, WriteOperation, WriteTransaction } from './files-port.js';
import { acceptDarwinEvidence } from './darwin-policy.js';
import { loadDarwinWritePrimitives, type DarwinEvidence, type DarwinWritePrimitives, type NativeHandle } from './native-darwin.js';
import { validatePath } from './path-policy.js';

const MAX_BYTES = 256 * 1024;
const TARGET_FILE = /^[0-9a-f]{32}\.[1-9][0-9]*\.json$/;
const AUTHORITY = 'authorization.json';
const DISCOVERY = 'discovery.json';
const TARGETS = 'targets';

type Layout = { parent: NativeHandle; name: string };
type ReceiptRecord = { path: string; evidence: DarwinEvidence; active: boolean };
type TransactionRecord = {
  native: NativeHandle;
  parent: NativeHandle;
  temporary: string;
  finalName: string;
  path: string;
  max: number;
};

const NATIVE_MUTATION_UNCERTAINTY_CODES = new Set([
  'outcome-uncertain', 'publication-uncertain', 'write-uncertain', 'write-not-durable',
  'mkdir-uncertain', 'sync-uncertain', 'remove-uncertain', 'ownership-uncertain',
]);
function nativeCode(error: unknown): string {
  return error instanceof Error ? error.message : '';
}
function isNativeMutationUncertain(error: unknown): boolean {
  return NATIVE_MUTATION_UNCERTAINTY_CODES.has(nativeCode(error));
}
function mapNative(error: unknown, fallback: Parameters<typeof fail>[0] = 'unavailable'): never {
  const code = nativeCode(error);
  if (code === 'outcome-uncertain') return fail('outcome-uncertain');
  if (code === 'ownership-busy' || code === 'destination-exists' || code === 'native-mkdir') return fail('ownership-busy');
  if (code === 'unsupported-mount') return fail('unsupported-mount');
  if (code === 'unsupported-acl' || code === 'acl-unavailable' || code === 'evidence-unavailable' || code === 'unsafe-ancestor') return fail('acl-unverified');
  if (code === 'limit-exceeded') return fail('limit-exceeded');
  if (code === 'path-changed' || code === 'stale-handle' || code === 'stale-operation' || code === 'unsafe-object') return fail('path-changed');
  if (['publication-uncertain', 'write-uncertain', 'write-not-durable', 'mkdir-uncertain',
    'sync-uncertain', 'remove-uncertain', 'ownership-uncertain', 'close-uncertain'].includes(code)) {
    return fail('outcome-uncertain');
  }
  return fail(fallback);
}
function sameIdentity(a: DarwinEvidence, b: DarwinEvidence): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.uid === b.uid && a.gid === b.gid &&
    a.mode === b.mode && a.nlink === b.nlink && a.size === b.size &&
    a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && a.fsid0 === b.fsid0 && a.fsid1 === b.fsid1;
}
function bytesFor(value: unknown, max: number): Buffer {
  if (!Number.isSafeInteger(max) || max < 1 || max > MAX_BYTES) fail('limit-exceeded');
  let bytes: Buffer;
  try { bytes = Buffer.from(JSON.stringify(value)); }
  catch { fail('durability-failed'); }
  if (bytes.length > max) fail('limit-exceeded');
  return bytes;
}

/**
 * Internal Darwin FilesPort. It is intentionally not exported from the package
 * entrypoint: the native addon is a synchronous, test-only storage boundary.
 * Read receipts retain evidence only; no descriptor is transferred to callers.
 */
export class DarwinFilesPort implements FilesPort {
  readonly #native: DarwinWritePrimitives;
  readonly #root: NativeHandle;
  readonly #lease: NativeHandle;
  readonly #owned = new WeakMap<FileReceipt, ReceiptRecord>();
  readonly #transactions = new Set<WriteTransaction>();
  readonly #drainAbort = new WeakMap<WriteTransaction, () => Promise<void>>();
  readonly #drainClose = new WeakMap<WriteTransaction, () => Promise<void>>();
  readonly #replace = new WeakMap<WriteTransaction, (previous: ReceiptRecord) => Promise<FileReceipt>>();
  readonly #pending = new Set<Promise<unknown>>();
  /** A close attempt relinquishes the capability even when native close is uncertain. */
  readonly #relinquished = new WeakSet<NativeHandle>();
  #targets: NativeHandle | undefined;
  #owner: { handle: NativeHandle; path: string; removed: boolean; closed: boolean; closeUncertain: boolean } | undefined;
  #closed = false;
  #draining = false;
  #drained: Promise<void> | undefined;
  #drainSucceeded = false;
  #poisoned = false;
  #disposal: Promise<void> | undefined;

  private constructor(readonly storageRoot: string, native: DarwinWritePrimitives,
    root: NativeHandle, lease: NativeHandle) {
    this.#native = native; this.#root = root; this.#lease = lease;
  }

  /** Opens an explicit repository-local root. No home/configuration discovery is performed. */
  static async open(storageRoot: string, initialize: boolean): Promise<DarwinFilesPort> {
    validatePath(storageRoot);
    if (process.platform !== 'darwin') return fail('unsupported-platform');
    let native: DarwinWritePrimitives | undefined;
    let root: NativeHandle | undefined;
    let lease: NativeHandle | undefined;
    const relinquished = new WeakSet<NativeHandle>();
    const closeOnce = (handle: NativeHandle): unknown => {
      if (relinquished.has(handle)) return undefined;
      relinquished.add(handle);
      try { native!.close(handle); return undefined; }
      catch (closeError) { return closeError; }
    };
    try {
      native = loadDarwinWritePrimitives();
      root = native.openRoot(storageRoot);
      lease = initialize ? native.initializeWriter(root) : native.acquireWriter(root);
      const files = new DarwinFilesPort(storageRoot, native, root, lease);
      return files;
    } catch (error) {
      let closeFailure: unknown;
      if (native && lease) closeFailure = closeOnce(lease);
      if (native && root) { const failure = closeOnce(root); if (closeFailure === undefined && failure !== undefined) closeFailure = failure; }
      if (closeFailure) mapNative(closeFailure, 'outcome-uncertain');
      mapNative(error, 'store-corrupt');
    }
  }

  private available(): void {
    if (this.#closed || this.#draining || this.#poisoned) fail('unavailable');
  }
  private requireOwner(): void {
    this.available();
    if (!this.#owner || this.#owner.removed) fail('unavailable');
  }
  private track<T>(work: Promise<T>): Promise<T> {
    this.#pending.add(work);
    void work.then(() => this.#pending.delete(work), () => this.#pending.delete(work));
    return work;
  }
  private poison(error: unknown): never {
    this.#poisoned = true;
    return mapNative(error, 'outcome-uncertain');
  }
  private mapMutation(error: unknown, fallback: Parameters<typeof fail>[0] = 'unavailable'): never {
    if (isNativeMutationUncertain(error)) return this.poison(error);
    return mapNative(error, fallback);
  }
  private receipt(path: string, evidence: DarwinEvidence): FileReceipt {
    const receipt = Object.freeze(Object.create(null));
    this.#owned.set(receipt, { path, evidence, active: true });
    return receipt;
  }
  private consume(receipt: FileReceipt): ReceiptRecord {
    const record = this.#owned.get(receipt);
    if (!record || !record.active) fail('path-changed');
    record.active = false;
    return record;
  }
  private layout(path: string): Layout {
    this.requireOwner(); validatePath(path);
    const rel = relative(this.storageRoot, path);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith(sep) || rel.includes('\0')) fail('unsupported-path');
    const parts = rel.split(sep);
    if (parts.length === 1 && (parts[0] === AUTHORITY || parts[0] === DISCOVERY)) return { parent: this.#root, name: parts[0]! };
    if (parts.length === 2 && parts[0] === TARGETS && TARGET_FILE.test(parts[1]!)) {
      this.#targets ??= (() => { try { return this.#native.openDirectory(this.#root, TARGETS); } catch (error) { mapNative(error, 'store-corrupt'); } })();
      return { parent: this.#targets!, name: parts[1]! };
    }
    fail('unsupported-path');
  }
  private layoutDirectory(path: string): Layout {
    this.requireOwner(); validatePath(path);
    if (path !== `${this.storageRoot}${sep}${TARGETS}`) fail('unsupported-path');
    return { parent: this.#root, name: TARGETS };
  }
  /** Fresh policy gate used before readBounded; the native read then rechecks its binding. */
  private acceptHandles(parent: NativeHandle, file?: NativeHandle): DarwinEvidence {
    const uid = process.getuid?.();
    if (uid === undefined) fail('unsupported-platform');
    for (const ancestor of this.#native.ancestors(this.#root)) acceptDarwinEvidence(ancestor, 'ancestor', uid);
    const root = this.#native.inspect(this.#root);
    acceptDarwinEvidence(root, 'directory', uid);
    const parentEvidence = this.#native.inspect(parent);
    acceptDarwinEvidence(parentEvidence, 'directory', uid);
    if (parentEvidence.dev !== root.dev || parentEvidence.fsid0 !== root.fsid0 || parentEvidence.fsid1 !== root.fsid1) fail('unsupported-mount');
    if (file) {
      const evidence = this.#native.inspect(file);
      acceptDarwinEvidence(evidence, 'file', uid);
      if (evidence.dev !== root.dev || evidence.fsid0 !== root.fsid0 || evidence.fsid1 !== root.fsid1) fail('unsupported-mount');
      return evidence;
    }
    return parentEvidence;
  }
  private closeNative(handle: NativeHandle): unknown {
    if (this.#relinquished.has(handle)) return undefined;
    this.#relinquished.add(handle);
    try { this.#native.close(handle); return undefined; }
    catch (error) { this.#poisoned = true; return error; }
  }
  private closeOrThrow(handle: NativeHandle): void {
    const failure = this.closeNative(handle);
    if (failure) mapNative(failure, 'outcome-uncertain');
  }

  async read(path: string, max: number, _operation: ReadOperation): Promise<{ value: unknown; owned: FileReceipt }> {
    this.requireOwner();
    if (!Number.isSafeInteger(max) || max < 1 || max > MAX_BYTES) fail('limit-exceeded');
    return this.track((async () => {
      const { parent, name } = this.layout(path);
      let file: NativeHandle | undefined;
      try {
        file = this.#native.openFile(parent, name);
        // Policy is accepted before readBounded can obtain any credential/authority bytes.
        this.acceptHandles(parent, file);
        const result = this.#native.readBounded(file, max);
        const before = this.acceptHandles(parent, file);
        acceptDarwinEvidence(result.before, 'file', process.getuid!());
        acceptDarwinEvidence(result.after, 'file', process.getuid!());
        if (!sameIdentity(before, result.after)) fail('path-changed');
        const value = JSON.parse(result.bytes.toString('utf8')) as unknown;
        const opened = file; file = undefined;
        this.closeOrThrow(opened);
        return { value, owned: this.receipt(path, result.after) };
      } catch (error) {
        if (file) { const opened = file; file = undefined; this.closeOrThrow(opened); }
        if (error instanceof Error && error.message === 'path-changed') fail('path-changed');
        mapNative(error, 'store-corrupt');
      }
    })());
  }
  release(receipt: FileReceipt): void { this.consume(receipt); }

  async acquireOwner(): Promise<OwnerClaim> {
    this.available();
    if (this.#owner) fail('ownership-busy');
    return this.track((async () => {
      try {
        const handle = this.#native.createDirectory(this.#root, 'owner', this.#lease);
        this.#owner = { handle, path: `${this.storageRoot}${sep}owner`, removed: false, closed: false, closeUncertain: false };
        const owner = this.#owner;
        return {
          path: owner.path,
          get removed() { return owner.removed; },
          remove: async () => {
            if (owner.removed) fail('unavailable');
            try { this.#native.removeDirectoryChecked(owner.handle, this.#lease); owner.removed = true; }
            catch (error) { this.mapMutation(error, 'outcome-uncertain'); }
          },
          close: async () => {
            if (owner.closeUncertain) fail('outcome-uncertain');
            if (owner.closed) return;
            if (!owner.removed) fail('unavailable');
            const failure = this.closeNative(owner.handle);
            if (failure) { owner.closeUncertain = true; mapNative(failure, 'outcome-uncertain'); }
            owner.closed = true;
          },
        } satisfies OwnerClaim;
      } catch (error) { this.mapMutation(error, 'ownership-busy'); }
    })());
  }

  async createDirectory(path: string, _operation: WriteOperation): Promise<void> {
    this.requireOwner();
    const { parent, name } = this.layoutDirectory(path);
    await this.track((async () => {
      try {
        const directory = this.#native.createDirectory(parent, name, this.#lease);
        this.#targets = directory;
      } catch (error) { this.mapMutation(error, 'ownership-busy'); }
    })());
  }

  async beginWrite(path: string, max: number, _operation: WriteOperation): Promise<WriteTransaction> {
    this.requireOwner();
    if (!Number.isSafeInteger(max) || max < 1 || max > MAX_BYTES) fail('limit-exceeded');
    const { parent, name } = this.layout(path);
    return this.track(this.createTransaction(path, parent, name, max));
  }
  private async createTransaction(path: string, parent: NativeHandle, finalName: string, max: number): Promise<WriteTransaction> {
    const temporary = `.native-write-${randomBytes(16).toString('hex')}`;
    let native: NativeHandle;
    try { native = this.#native.beginWrite(parent, temporary, finalName, max, this.#lease); }
    catch (error) { mapNative(error, 'durability-failed'); }
    const record: TransactionRecord = { native: native!, parent, temporary, finalName, path, max };
    let state: TransactionState = 'Prepared';
    let closed = false;
    let closeUncertain = false;
    let busy = false;
    let wrapper!: WriteTransaction;
    const closeHandle = async (): Promise<void> => {
      if (closeUncertain) fail('outcome-uncertain');
      if (closed) return;
      const handle = record.native;
      closed = true;
      const failure = this.closeNative(handle);
      if (failure) { closeUncertain = true; state = 'CloseUncertain'; mapNative(failure, 'outcome-uncertain'); }
    };
    const invoke = <T>(action: () => T | Promise<T>, fence: 'public' | 'drain' | 'cleanup' = 'public'): Promise<T> => {
      if (busy) return Promise.reject(sanitized(null));
      if (fence === 'public') { try { this.available(); } catch (error) { return Promise.reject(error); } }
      else if (fence === 'drain' && (!this.#draining || this.#closed || this.#poisoned)) return Promise.reject(sanitized(null));
      busy = true;
      return this.track(Promise.resolve().then(action).finally(() => { busy = false; }));
    };
    const finish = (): void => {
      // Publication settles the namespace, not the native transaction capability.
      if ((state === 'Published' || state === 'Aborted') && closed) this.#transactions.delete(wrapper);
    };
    const abort = (fence: 'public' | 'drain'): Promise<void> => invoke(async () => {
      if (state === 'Aborted') return;
      if (state === 'Published' || state === 'MutationUncertain' || state === 'CloseUncertain') fail('outcome-uncertain');
      await closeHandle();
      let temporary: NativeHandle | undefined;
      try {
        temporary = this.#native.openFile(record.parent, record.temporary);
        this.acceptHandles(record.parent, temporary);
        this.#native.removeChecked(temporary, this.#lease);
        const removed = temporary; temporary = undefined;
        this.closeOrThrow(removed);
        state = 'Aborted'; finish();
      } catch (error) {
        let closeFailure: unknown;
        if (temporary) { const opened = temporary; temporary = undefined; closeFailure = this.closeNative(opened); }
        // A transaction-handle close failure is the stronger state: no cleanup
        // classification may overwrite CloseUncertain with MutationUncertain.
        if (!closeUncertain) { state = 'MutationUncertain'; this.#poisoned = true; }
        if (closeFailure) mapNative(closeFailure, 'outcome-uncertain');
        mapNative(error, 'outcome-uncertain');
      }
    }, fence);
    const close = (fence: 'public' | 'drain'): Promise<void> => invoke(async () => {
      await closeHandle();
      finish();
    }, fence === 'public' ? 'cleanup' : fence);
    const publishNew = () => invoke(async () => {
      if (state !== 'Writing' || closed) fail(state === 'MutationUncertain' || state === 'CloseUncertain' ? 'outcome-uncertain' : 'unavailable');
      let published = false;
      let file: NativeHandle | undefined;
      try {
        this.#native.publishNew(record.native);
        published = true;
        state = 'Published';
        file = this.#native.openFile(record.parent, record.finalName);
        const evidence = this.acceptHandles(record.parent, file);
        const receipt = this.receipt(record.path, evidence);
        const opened = file; file = undefined;
        this.closeOrThrow(opened);
        finish(); return receipt;
      } catch (error) {
        let closeFailure: unknown;
        if (file) { const opened = file; file = undefined; closeFailure = this.closeNative(opened); }
        state = published ? 'MutationUncertain' : (nativeCode(error) === 'destination-exists' ? 'Writing' : 'MutationUncertain');
        if (state === 'MutationUncertain') this.#poisoned = true;
        if (closeFailure) mapNative(closeFailure, 'outcome-uncertain');
        mapNative(error, published ? 'outcome-uncertain' : 'durability-failed');
      }
    });
    const replaceRecord = async (previousRecord: ReceiptRecord): Promise<FileReceipt> => {
      let expected: NativeHandle | undefined;
      let file: NativeHandle | undefined;
      let published = false;
      try {
        expected = this.#native.openFile(record.parent, record.finalName);
        const evidence = this.acceptHandles(record.parent, expected);
        if (!sameIdentity(previousRecord.evidence, evidence)) fail('path-changed');
        this.#native.publishReplace(record.native, expected);
        published = true;
        state = 'Published';
        file = this.#native.openFile(record.parent, record.finalName);
        const current = this.acceptHandles(record.parent, file);
        const receipt = this.receipt(record.path, current);
        const opened = file; file = undefined;
        this.closeOrThrow(opened);
        const replaced = expected; expected = undefined;
        this.closeOrThrow(replaced);
        finish(); return receipt;
      } catch (error) {
        let closeFailure: unknown;
        if (file) {
          const opened = file; file = undefined;
          const failure = this.closeNative(opened); if (closeFailure === undefined && failure !== undefined) closeFailure = failure;
        }
        if (expected) {
          const opened = expected; expected = undefined;
          const failure = this.closeNative(opened); if (closeFailure === undefined && failure !== undefined) closeFailure = failure;
        }
        const code = nativeCode(error);
        if (published) { state = 'MutationUncertain'; this.#poisoned = true; }
        else if (!['destination-exists', 'stale-handle', 'path-changed'].includes(code)) { state = 'MutationUncertain'; this.#poisoned = true; }
        if (closeFailure) mapNative(closeFailure, 'outcome-uncertain');
        mapNative(error, published ? 'outcome-uncertain' : 'durability-failed');
      }
    };
    const publishReplace = (previous: FileReceipt) => invoke(async () => {
      if (state !== 'Writing' || closed) fail(state === 'MutationUncertain' || state === 'CloseUncertain' ? 'outcome-uncertain' : 'unavailable');
      const previousRecord = this.#owned.get(previous);
      if (!previousRecord || !previousRecord.active) fail('path-changed');
      if (previousRecord.path !== record.path) fail('path-changed');
      previousRecord.active = false;
      return replaceRecord(previousRecord);
    });
    wrapper = {
      get state() { return state; },
      write: (value: unknown) => invoke(() => {
        if (state !== 'Prepared' || closed) fail(state === 'MutationUncertain' || state === 'CloseUncertain' ? 'outcome-uncertain' : 'unavailable');
        const bytes = bytesFor(value, record.max);
        try { this.#native.write(record.native, bytes); state = 'Writing'; }
        catch (error) { if (nativeCode(error) !== 'native-write') { state = 'MutationUncertain'; this.#poisoned = true; } mapNative(error, 'durability-failed'); }
      }),
      publishNew,
      publishReplace,
      abort: () => abort('public'),
      close: () => close('public'),
    };
    this.#transactions.add(wrapper);
    this.#drainAbort.set(wrapper, () => abort('drain'));
    this.#drainClose.set(wrapper, () => close('drain'));
    this.#replace.set(wrapper, previous => invoke(() => replaceRecord(previous)));
    return wrapper;
  }

  async publish(path: string, value: unknown, max: number, operation: WriteOperation, previous?: FileReceipt): Promise<FileReceipt> {
    // Consume valid replacement evidence before beginWrite can create a temporary inode.
    // Keep only the backend-private evidence for the transaction; the public receipt is spent.
    const previousRecord = previous === undefined ? undefined : (() => {
      const candidate = this.#owned.get(previous);
      if (!candidate || !candidate.active || candidate.path !== path) fail('path-changed');
      candidate.active = false;
      return candidate;
    })();
    const transaction = await this.beginWrite(path, max, operation);
    let result: FileReceipt | undefined;
    let failure: unknown;
    try {
      await transaction.write(value);
      if (previousRecord === undefined) result = await transaction.publishNew();
      else {
        const replace = this.#replace.get(transaction);
        if (!replace) fail('unavailable');
        result = await replace(previousRecord);
      }
    } catch (error) {
      failure = error;
      if (transaction.state === 'Prepared' || transaction.state === 'Writing') {
        try { await transaction.abort(); } catch (abortError) { failure = abortError; }
      }
    }
    try { await transaction.close(); }
    catch (closeError) { failure = closeError; }
    if (failure) throw failure;
    return result!;
  }

  async remove(receipt: FileReceipt): Promise<void> {
    this.requireOwner();
    const record = this.consume(receipt);
    await this.track((async () => {
      const { parent, name } = this.layout(record.path);
      let file: NativeHandle | undefined;
      try {
        file = this.#native.openFile(parent, name);
        const current = this.acceptHandles(parent, file);
        if (!sameIdentity(record.evidence, current)) fail('path-changed');
        this.#native.removeChecked(file, this.#lease);
        const removed = file; file = undefined;
        this.closeOrThrow(removed);
      } catch (error) {
        let closeFailure: unknown;
        if (file) { const opened = file; file = undefined; closeFailure = this.closeNative(opened); }
        if (closeFailure) mapNative(closeFailure, 'outcome-uncertain');
        if (nativeCode(error) === 'remove-missing') return;
        this.mapMutation(error, 'unavailable');
      }
    })());
  }

  drain(): Promise<void> {
    this.#draining = true;
    return this.#drained ??= this.drainOnce();
  }
  private async drainOnce(): Promise<void> {
    while (this.#pending.size) await Promise.allSettled([...this.#pending]);
    let failed = false;
    for (const transaction of this.#transactions) {
      try {
        if (transaction.state === 'Prepared' || transaction.state === 'Writing') await this.#drainAbort.get(transaction)!();
        if (transaction.state === 'MutationUncertain' || transaction.state === 'CloseUncertain') failed = true;
      } catch { failed = true; }
      try { await this.#drainClose.get(transaction)!(); } catch { failed = true; }
    }
    if (this.#poisoned || failed || this.#transactions.size) fail('outcome-uncertain');
    this.#drainSucceeded = true;
  }
  async close(): Promise<void> {
    if (!this.#drainSucceeded || this.#pending.size || this.#transactions.size || (this.#owner && (!this.#owner.removed || !this.#owner.closed))) return Promise.reject(sanitized(null));
    return this.#disposal ??= (async () => {
      this.#closed = true;
      let failure: unknown;
      for (const handle of [this.#targets, this.#lease, this.#root]) {
        if (!handle) continue;
        const closeFailure = this.closeNative(handle);
        if (failure === undefined && closeFailure !== undefined) failure = closeFailure;
      }
      if (failure) { this.#poisoned = true; mapNative(failure, 'outcome-uncertain'); }
    })();
  }
}
