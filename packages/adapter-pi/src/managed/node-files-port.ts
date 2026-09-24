import { fail, sanitized } from './errors.js';
import type { FileReceipt, FilesPort, OwnerClaim, ReadOperation, TransactionState, WriteOperation, WriteTransaction } from './files-port.js';
import { type OwnedFile, type PrivateTransactionState, PrivateFiles } from './private-files.js';

/** Internal Core-only cleanup capability; not part of FilesPort. */
export const REMOVE_AFTER_DRAIN = Symbol('remove-after-drain');
type DrainTransaction = { abort(): Promise<void>; close(): Promise<void> };

/** Delegates the existing Node behavior; does not upgrade its security guarantees. */
export class NodeFilesPort implements FilesPort {
  readonly #owned = new WeakMap<FileReceipt, { owned: OwnedFile; active: boolean }>();
  readonly #replace = new WeakMap<WriteTransaction, (owned: OwnedFile) => Promise<FileReceipt>>();
  readonly #drainTransactions = new WeakMap<WriteTransaction, DrainTransaction>();
  readonly #transactions = new Set<WriteTransaction>();
  #closed = false;
  #owner: OwnerClaim | undefined;
  #draining = false;
  #drained: Promise<void> | undefined;
  #drainSucceeded = false;
  #poisoned = false;
  #disposal: Promise<void> | undefined;
  #ownerAcquiring = false;
  readonly #pending = new Set<Promise<unknown>>();
  constructor(private readonly files: PrivateFiles) {}
  get storageRoot(): string { return this.files.scope.roots.storageRoot; }
  private receipt(owned: OwnedFile): FileReceipt {
    const receipt = Object.freeze(Object.create(null));
    this.#owned.set(receipt, { owned, active: true });
    return receipt;
  }
  private record(receipt: FileReceipt): { owned: OwnedFile; active: boolean } {
    const record = this.#owned.get(receipt);
    if (!record || !record.active) fail('path-changed');
    return record;
  }
  private consume(receipt: FileReceipt): OwnedFile {
    const record = this.record(receipt); record.active = false;
    return record.owned;
  }
  private available(): void { if (this.#closed || this.#draining || this.#poisoned) fail('unavailable'); }
  acquireOwner(): Promise<OwnerClaim> {
    this.available();
    if (this.#owner || this.#ownerAcquiring) fail('ownership-busy');
    this.#ownerAcquiring = true;
    const work = (async () => {
      const owner = await this.files.acquireOwner();
      // Drain waits for this whole operation. If fencing began while the
      // backend was acquiring the claim, never return a capability afterward.
      if (this.#draining || this.#closed || this.#poisoned) {
        try { await owner.remove(); await owner.close(); }
        catch (error) {
          // A claim created across the drain fence cannot be released safely
          // after any cleanup failure, including a substitution or ENOENT.
          // Preserve the original acquisition error, but retain the barrier.
          this.#poisoned = true;
          throw error;
        }
        fail('unavailable');
      }
      this.#owner = owner;
      return owner;
    })().catch(error => {
      if (sanitized(error).code === 'outcome-uncertain') this.#poisoned = true;
      throw error;
    }).finally(() => { this.#ownerAcquiring = false; });
    return this.track(work);
  }
  private track<T>(work: Promise<T>): Promise<T> {
    this.#pending.add(work);
    void work.then(() => this.#pending.delete(work), () => this.#pending.delete(work));
    return work;
  }
  async read(path: string, max: number, operation: ReadOperation): Promise<{ value: unknown; owned: FileReceipt }> {
    this.available();
    return this.track((async () => {
      const result = await this.files.read(path, max, operation);
      const owned = this.receipt(result.owned);
      return { value: result.value, owned };
    })());
  }
  release(receipt: FileReceipt): void { this.consume(receipt); }
  async createDirectory(path: string, operation: WriteOperation): Promise<void> {
    this.available();
    await this.trackCleanup(this.files.createDirectory(path, operation));
  }
  async beginWrite(path: string, max: number, operation: WriteOperation): Promise<WriteTransaction> {
    this.available();
    return this.track(this.createTransaction(path, max, operation));
  }
  private async createTransaction(path: string, max: number, operation: WriteOperation): Promise<WriteTransaction> {
    const transaction = await this.files.beginWrite(path, max, operation);
    let state: TransactionState = 'Prepared';
    let closeUncertain = false;
    let wrapper!: WriteTransaction;
    const syncState = (): void => {
      const backendState: PrivateTransactionState = transaction.state;
      if (backendState === 'MutationUncertain') state = backendState;
      else if (backendState === 'CloseUncertain') { state = backendState; closeUncertain = true; }
      else if (backendState === 'Published' || backendState === 'Aborted') state = backendState;
    };
    const settle = async (action: () => Promise<void>): Promise<void> => {
      await action();
      syncState();
      // Closing a prepared or writing transaction only closes its descriptor;
      // it does not settle the temporary inode. Keep it as a drain barrier until
      // an explicit abort, publish, or uncertainty settles its outcome.
      if (state === 'Prepared' || state === 'Writing' ||
        state === 'MutationUncertain' || state === 'CloseUncertain') return;
      this.#transactions.delete(wrapper); this.#replace.delete(wrapper);
    };
    const replaceOwned = async (owned: OwnedFile): Promise<FileReceipt> => {
      try {
        const receipt = this.receipt(await transaction.publishReplace(owned)); syncState();
        state = 'Published'; return receipt;
      } catch (error) { syncState(); throw error; }
    };
    let busy = false;
    const run = <T>(action: () => Promise<T>, fence: 'public' | 'drain' = 'public'): Promise<T> => {
      if (busy) return Promise.reject(sanitized(null));
      if (fence === 'public') {
        try { this.available(); } catch (error) { return Promise.reject(error); }
      } else if (!this.#draining || this.#closed || this.#poisoned) return Promise.reject(sanitized(null));
      busy = true;
      return this.track(action().finally(() => { busy = false; }));
    };
    const abort = (fence: 'public' | 'drain'): Promise<void> => run(() => settle(async () => {
      try { await transaction.abort(); syncState(); state = 'Aborted'; }
      catch (error) { syncState(); throw error; }
    }), fence);
    const close = (fence: 'public' | 'drain'): Promise<void> => run(async () => {
      if (closeUncertain) fail('outcome-uncertain');
      try { await settle(transaction.close); syncState(); }
      catch (error) { closeUncertain = true; syncState(); state = 'CloseUncertain'; throw error; }
    }, fence);
    const candidate = {
      get state() { return state; },
      write: (value: unknown) => run(async () => { try { await transaction.write(value); syncState(); state = 'Writing'; } catch (error) { syncState(); throw error; } }),
      publishNew: () => run(async () => {
        try { const receipt = this.receipt(await transaction.publishNew()); syncState(); state = 'Published'; return receipt; }
        catch (error) { syncState(); throw error; }
      }),
      publishReplace: (previous: FileReceipt) => run(async () => {
        const owned = this.record(previous);
        if (owned.owned.path !== path) fail('path-changed');
        this.consume(previous);
        return replaceOwned(owned.owned);
      }),
      abort: () => abort('public'),
      close: () => close('public'),
    };
    wrapper = candidate;
    this.#replace.set(wrapper, owned => run(() => replaceOwned(owned)));
    this.#drainTransactions.set(wrapper, { abort: () => abort('drain'), close: () => close('drain') });
    this.#transactions.add(wrapper);
    return wrapper;
  }
  async publish(path: string, value: unknown, max: number, operation: WriteOperation, previous?: FileReceipt): Promise<FileReceipt> {
    // Consume valid replacement evidence before beginWrite can create a temporary inode.
    // Keep only the backend-private payload for this transaction; the public receipt is spent.
    const previousOwned = previous === undefined ? undefined : (() => {
      const record = this.record(previous);
      if (record.owned.path !== path) fail('path-changed');
      return this.consume(previous);
    })();
    const transaction = await this.beginWrite(path, max, operation);
    try {
      await transaction.write(value);
      if (previousOwned === undefined) return await transaction.publishNew();
      const replaceOwned = this.#replace.get(transaction);
      if (!replaceOwned) fail('unavailable');
      return await replaceOwned(previousOwned);
    } catch (error) {
      try { await transaction.abort(); } catch (abortError) { throw abortError; }
      throw error;
    } finally { await transaction.close(); }
  }
  private trackCleanup<T>(work: Promise<T>): Promise<T> {
    return this.track(work.catch(error => {
      if (sanitized(error).code === 'outcome-uncertain') this.#poisoned = true;
      throw error;
    }));
  }
  async remove(receipt: FileReceipt): Promise<void> {
    this.available();
    const owned = this.consume(receipt);
    await this.trackCleanup(this.files.remove(owned));
  }
  /**
   * Core-only post-drain cleanup. The owner identity fences this capability to
   * the Core that acquired it; it cannot remove the owner claim itself.
   */
  [REMOVE_AFTER_DRAIN](target: FileReceipt | OwnedFile, owner: OwnerClaim, directory = false): Promise<void> {
    if (this.#closed || !this.#drainSucceeded || this.#owner !== owner) return Promise.reject(sanitized(null));
    const record = this.#owned.get(target as FileReceipt);
    const owned = record ? this.consume(target as FileReceipt) : target as OwnedFile;
    if (owned.path === owner.path) return Promise.reject(sanitized(null));
    return this.trackCleanup(this.files.remove(owned, directory));
  }
  drain(): Promise<void> {
    this.#draining = true;
    return this.#drained ??= this.drainOnce();
  }
  private async drainOnce(): Promise<void> {
    while (this.#pending.size) await Promise.allSettled([...this.#pending]);
    let failed = false;
    for (const transaction of this.#transactions) {
      const drainTransaction = this.#drainTransactions.get(transaction);
      if (!drainTransaction) { failed = true; continue; }
      try {
        if (transaction.state === 'Prepared' || transaction.state === 'Writing') await drainTransaction.abort();
        if (transaction.state === 'MutationUncertain' || transaction.state === 'CloseUncertain') failed = true;
      } catch { failed = true; }
      try { await drainTransaction.close(); } catch { failed = true; }
    }
    if (this.#poisoned || failed || this.#transactions.size) fail('outcome-uncertain');
    this.#drainSucceeded = true;
  }
  close(): Promise<void> {
    // Rejected preconditions are not a close attempt. Once disposal starts its
    // promise (including CloseUncertain) is final, never a retry.
    if (!this.#drainSucceeded || this.#pending.size || this.#transactions.size || (this.#owner && !this.#owner.removed)) return Promise.reject(sanitized(null));
    return this.#disposal ??= (async () => {
      this.#closed = true;
      if (this.#owner) await this.#owner.close();
    })();
  }
}
