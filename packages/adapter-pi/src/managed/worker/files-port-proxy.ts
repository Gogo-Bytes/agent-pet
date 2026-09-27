import { WorkerHost } from './host.js';
import { REMOVE_AFTER_DRAIN } from '../node-files-port.js';
import type { FileReceipt, FilesPort, OwnerClaim, ReadOperation, TransactionState, WriteOperation, WriteTransaction, JsonValue } from '../files-port.js';
import type { Roots } from '../path-policy.js';
import type { WorkerHostOptions } from './host.js';
import type { OpaqueId } from './protocol.js';

/** FilesPort proxy. Only opaque capability IDs cross the Worker boundary. */
export class WorkerFilesPort implements FilesPort {
  readonly storageRoot: string;
  readonly host: WorkerHost;
  #owner: OwnerClaim | undefined;
  #ownerCap: OpaqueId | undefined;
  #receipts = new WeakMap<FileReceipt, { cap: OpaqueId; active: boolean }>();
  constructor(options: WorkerHostOptions) { this.storageRoot = options.roots.storageRoot; this.host = new WorkerHost(options); }
  private receipt(cap: OpaqueId): FileReceipt { const value = Object.freeze(Object.create(null)); this.#receipts.set(value, { cap, active: true }); return value; }
  private consume(receipt: FileReceipt): OpaqueId { const record = this.#receipts.get(receipt); if (!record || !record.active) throw Object.assign(new Error('path-changed'), { code: 'path-changed' }); record.active = false; return record.cap; }
  private restore(receipt: FileReceipt): void { const record = this.#receipts.get(receipt); if (record && !record.active) record.active = true; }
  async initialized(): Promise<void> { await this.host.initialized; }
  async acquireOwner(): Promise<OwnerClaim> {
    const result = await this.host.initialized;
    if (this.#owner) throw Object.assign(new Error('ownership-busy'), { code: 'ownership-busy' });
    let removed = false; let removePromise: Promise<void> | undefined;
    const claim: OwnerClaim = { path: `${this.storageRoot}/owner`, get removed() { return removed; },
      remove: () => removePromise ??= this.host.request({ type: 'remove-owner', ownerCap: result.ownerCap }).then(() => { removed = true; }),
      close: async () => { if (!removed) throw Object.assign(new Error('unavailable'), { code: 'unavailable' }); await this.host.stop(); } };
    this.#owner = claim; this.#ownerCap = result.ownerCap; return claim;
  }
  async read(path: string, max: number, operation: ReadOperation): Promise<{ value: unknown; owned: FileReceipt }> {
    const owner = await this.ownerCap(); const result = await this.host.request<any>({ type: 'read', ownerCap: owner, path, maxBytes: max, operation }); return { value: result.value, owned: this.receipt(result.receiptCap) };
  }
  release(receipt: FileReceipt): Promise<void> { const cap = this.consume(receipt); return this.host.request({ type: 'release', ownerCap: this.ownerCapSync(), receiptCap: cap }).then(() => {}); }
  async createDirectory(path: string, operation: WriteOperation): Promise<void> { await this.host.request({ type: 'create-directory', ownerCap: await this.ownerCap(), path, operation }); }
  async beginWrite(path: string, max: number, operation: WriteOperation): Promise<WriteTransaction> {
    const owner = await this.ownerCap(); const result = await this.host.request<any>({ type: 'begin-write', ownerCap: owner, path, maxBytes: max, operation });
    let state: TransactionState = 'Prepared'; let busy = false;
    const run = async <T>(work: () => Promise<T>): Promise<T> => { if (busy) throw Object.assign(new Error('unavailable'), { code: 'unavailable' }); busy = true; try { return await work(); } finally { busy = false; } };
    const transaction: WriteTransaction = { get state() { return state; },
      write: value => run(async () => { await this.host.request({ type: 'transaction-write', ownerCap: owner, transactionCap: result.transactionCap, value: value as JsonValue }); state = 'Writing'; }),
      publishNew: () => run(async () => { const published = await this.host.request<any>({ type: 'transaction-publish-new', ownerCap: owner, transactionCap: result.transactionCap }); state = 'Published'; return this.receipt(published.receiptCap); }),
      publishReplace: previous => run(async () => { const cap = this.consume(previous); const published = await this.host.request<any>({ type: 'transaction-publish-replace', ownerCap: owner, transactionCap: result.transactionCap, receiptCap: cap }); state = 'Published'; return this.receipt(published.receiptCap); }),
      abort: () => run(async () => { await this.host.request({ type: 'transaction-abort', ownerCap: owner, transactionCap: result.transactionCap }); state = 'Aborted'; }),
      close: () => run(async () => { const closed = await this.host.request<any>({ type: 'transaction-close', ownerCap: owner, transactionCap: result.transactionCap }); state = closed.state; }),
    };
    return transaction;
  }
  async publish(path: string, value: unknown, max: number, operation: WriteOperation, previous?: FileReceipt): Promise<FileReceipt> {
    let previousCap: OpaqueId | undefined;
    if (previous !== undefined) previousCap = this.consume(previous);
    let transaction: WriteTransaction;
    try { transaction = await this.beginWrite(path, max, operation); }
    catch (error) {
      // Worker-side capacity preflight is a known no-op. Restore evidence that
      // was consumed locally before beginWrite so it remains addressable.
      if (previous !== undefined && error && typeof error === 'object' &&
        (error as { code?: unknown }).code === 'limit-exceeded' && (error as { effect?: unknown }).effect === 'none') this.restore(previous);
      throw error;
    }
    try { await transaction.write(value); return previousCap ? await transaction.publishReplace(this.receipt(previousCap)) : await transaction.publishNew(); }
    catch (error) { try { await transaction.abort(); } catch (abortError) { throw abortError; } throw error; }
    finally { await transaction.close(); }
  }
  async remove(receipt: FileReceipt): Promise<void> { const cap = this.consume(receipt); await this.host.request({ type: 'remove', ownerCap: await this.ownerCap(), receiptCap: cap }); }
  /** Core-only cleanup after drain; ordinary remove remains fenced by the Worker. */
  [REMOVE_AFTER_DRAIN](receipt: FileReceipt, owner: OwnerClaim): Promise<void> {
    if (this.#owner !== owner) return Promise.reject(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
    const cap = this.consume(receipt);
    return this.host.request({ type: 'remove-after-drain', ownerCap: this.ownerCapSync(), receiptCap: cap }).then(() => {});
  }
  async drain(): Promise<void> { await this.host.request({ type: 'drain', ownerCap: await this.ownerCap() }); }
  async close(): Promise<void> { await this.host.stop(); }
  private async ownerCap(): Promise<OpaqueId> { const claim = this.#owner; if (!claim) await this.acquireOwner(); return this.ownerCapSync(); }
  private ownerCapSync(): OpaqueId { if (!this.#owner || !this.#ownerCap) throw Object.assign(new Error('unavailable'), { code: 'unavailable' }); return this.#ownerCap; }
}
