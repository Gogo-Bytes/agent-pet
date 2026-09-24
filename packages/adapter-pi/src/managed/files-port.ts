/** Internal storage seam, not a public plugin or filesystem security policy. */
export type ReadOperation = 'authority-read' | 'credential-read' | 'discovery-read';
export type WriteOperation = 'authority-write' | 'credential-write' | 'discovery-write';
/** Descriptor-free, backend-local evidence, never a native handle. */
export type FileReceipt = object;
export type TransactionState = 'Prepared' | 'Writing' | 'Published' | 'Aborted' | 'MutationUncertain' | 'CloseUncertain';

/** Durable owner claim. Removal is a one-way operation; an uncertain attempt is never retried. */
export interface OwnerClaim {
  readonly path: string;
  /** True only after this capability's successful namespace removal, even if subsequent sync fails. */
  readonly removed: boolean;
  remove(): Promise<void>;
  close(): Promise<void>;
}

/** Single owner; operations may not overlap. Always close, even after abort/publish fails. */
export interface WriteTransaction {
  readonly state: TransactionState;
  write(value: unknown): Promise<void>;
  publishNew(): Promise<FileReceipt>;
  publishReplace(previous: FileReceipt): Promise<FileReceipt>;
  /** Only a definitely unpublished transaction can remove its own temporary inode. */
  abort(): Promise<void>;
  /** Releases resources, never removes files or retries an uncertain close. */
  close(): Promise<void>;
}
export interface FilesReader {
  readonly storageRoot: string;
  /** Accept complete parent/leaf policy before bytes; close read handles before returning. */
  read(path: string, max: number, operation: ReadOperation): Promise<{ value: unknown; owned: FileReceipt }>;
  /** Synchronous, descriptor-free invalidation; foreign/released/consumed receipts fail. */
  release(receipt: FileReceipt): void;
}
export interface FilesPort extends FilesReader {
  /** The claim is created and parent-synced before authority reads are allowed. */
  acquireOwner(): Promise<OwnerClaim>;
  /** Fence new work, await in-flight writes, settle unpublished transactions; never close the owner claim. */
  drain(): Promise<void>;
  /** Final disposal only after drain and claim removal. Close uncertainty is terminal, never retried. */
  close(): Promise<void>;
  createDirectory(path: string, operation: WriteOperation): Promise<void>;
  beginWrite(path: string, max: number, operation: WriteOperation): Promise<WriteTransaction>;
  /** Owns the entire transaction, including abort on known failure and unconditional close. */
  publish(path: string, value: unknown, max: number, operation: WriteOperation, previous?: FileReceipt): Promise<FileReceipt>;
  /** Consumes valid evidence before I/O, including on failure. Wrong-path/foreign evidence is rejected before I/O. */
  remove(owned: FileReceipt): Promise<void>;
}
/** Ordinary parsed reads never transfer receipt ownership to callers, including on parse failure. */
export function readValue<T>(files: FilesReader, path: string, max: number, operation: ReadOperation,
  parse: (value: unknown) => T): Promise<T> {
  return files.read(path, max, operation).then(result => {
    let parsed: T;
    let failure: unknown;
    let parsedSuccessfully = false;
    try { parsed = parse(result.value); parsedSuccessfully = true; }
    catch (error) { failure = error; }
    try { files.release(result.owned); }
    catch (error) {
      // Release uncertainty is more important than a parse result: ownership did
      // not settle, so never hide this barrier behind a parser error.
      throw error;
    }
    if (!parsedSuccessfully) throw failure;
    return parsed!;
  });
}
