import { fail } from './errors.js';
import type { FileReceipt, FilesPort, ReadOperation, WriteOperation } from './files-port.js';
import { type OwnedFile, PrivateFiles } from './private-files.js';

/** Delegates the existing Node behavior; does not upgrade its security guarantees. */
export class NodeFilesPort implements FilesPort {
  readonly #owned = new WeakMap<FileReceipt, OwnedFile>();
  constructor(private readonly files: PrivateFiles) {}
  get storageRoot(): string { return this.files.scope.roots.storageRoot; }
  private receipt(owned: OwnedFile): FileReceipt {
    const receipt = Object.freeze({});
    this.#owned.set(receipt, owned);
    return receipt;
  }
  private owned(receipt: FileReceipt): OwnedFile {
    const owned = this.#owned.get(receipt);
    if (!owned) fail('path-changed');
    return owned;
  }
  async read(path: string, max: number, operation: ReadOperation): Promise<{ value: unknown; owned: FileReceipt }> {
    const result = await this.files.read(path, max, operation);
    return { value: result.value, owned: this.receipt(result.owned) };
  }
  async createDirectory(path: string, operation: WriteOperation): Promise<void> {
    await this.files.createDirectory(path, operation);
  }
  async publish(path: string, value: unknown, max: number, operation: WriteOperation, previous?: FileReceipt): Promise<FileReceipt> {
    const owned = previous === undefined ? undefined : this.owned(previous);
    // Reject foreign receipts and mismatched destinations before even a temporary write.
    if (owned && owned.path !== path) fail('path-changed');
    return this.receipt(await this.files.publish(path, value, max, operation, owned));
  }
  async remove(receipt: FileReceipt): Promise<void> {
    await this.files.remove(this.owned(receipt));
  }
}
