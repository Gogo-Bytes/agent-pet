import { fail } from './errors.js';
import type { FileReceipt, FilesPort, ReadOperation, TransactionState, WriteOperation, WriteTransaction } from './files-port.js';
import { type OwnedFile, type PrivateTransactionState, PrivateFiles } from './private-files.js';

/** Delegates the existing Node behavior; does not upgrade its security guarantees. */
export class NodeFilesPort implements FilesPort {
  readonly #owned = new WeakMap<FileReceipt, { owned: OwnedFile; active: boolean }>();
  readonly #replace = new WeakMap<WriteTransaction, (owned: OwnedFile) => Promise<FileReceipt>>();
  readonly #transactions = new Set<WriteTransaction>();
  #closed = false;
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
  private available(): void { if (this.#closed) fail('unavailable'); }
  async read(path: string, max: number, operation: ReadOperation): Promise<{ value: unknown; owned: FileReceipt }> {
    this.available();
    const result = await this.files.read(path, max, operation);
    const owned = this.receipt(result.owned);
    return { value: result.value, owned };
  }
  release(receipt: FileReceipt): void { this.consume(receipt); }
  async createDirectory(path: string, operation: WriteOperation): Promise<void> {
    this.available(); await this.files.createDirectory(path, operation);
  }
  async beginWrite(path: string, max: number, operation: WriteOperation): Promise<WriteTransaction> {
    this.available();
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
      this.#transactions.delete(wrapper); this.#replace.delete(wrapper);
    };
    const replaceOwned = async (owned: OwnedFile): Promise<FileReceipt> => {
      try {
        const receipt = this.receipt(await transaction.publishReplace(owned)); syncState();
        state = 'Published'; return receipt;
      } catch (error) { syncState(); throw error; }
    };
    const candidate = {
      get state() { return state; },
      write: async (value: unknown) => { try { await transaction.write(value); syncState(); state = 'Writing'; } catch (error) { syncState(); throw error; } },
      publishNew: async () => {
        try { const receipt = this.receipt(await transaction.publishNew()); syncState(); state = 'Published'; return receipt; }
        catch (error) { syncState(); throw error; }
      },
      publishReplace: async (previous: FileReceipt) => {
        const owned = this.record(previous);
        if (owned.owned.path !== path) fail('path-changed');
        this.consume(previous);
        return replaceOwned(owned.owned);
      },
      abort: () => settle(async () => {
        try { await transaction.abort(); syncState(); state = 'Aborted'; }
        catch (error) { syncState(); throw error; }
      }),
      close: async () => {
        if (closeUncertain) fail('outcome-uncertain');
        try { await settle(transaction.close); syncState(); }
        catch (error) { closeUncertain = true; syncState(); state = 'CloseUncertain'; throw error; }
      },
    };
    wrapper = candidate;
    this.#replace.set(wrapper, replaceOwned);
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
  async remove(receipt: FileReceipt): Promise<void> {
    const owned = this.consume(receipt);
    await this.files.remove(owned);
  }
  async close(): Promise<void> {
    if (this.#closed) return;
    if (this.#transactions.size) fail('unavailable');
    this.#closed = true;
  }
}
