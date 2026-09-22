/** Internal storage seam, not a public plugin or filesystem security policy. */
export type ReadOperation = 'authority-read' | 'credential-read' | 'discovery-read';
export type WriteOperation = 'authority-write' | 'credential-write' | 'discovery-write';
/** Opaque ownership evidence. Only the issuing backend may interpret or accept it. */
export type FileReceipt = object;
export interface FilesReader {
  readonly storageRoot: string;
  read(path: string, max: number, operation: ReadOperation): Promise<{ value: unknown; owned: FileReceipt }>;
}
export interface FilesPort extends FilesReader {
  createDirectory(path: string, operation: WriteOperation): Promise<void>;
  publish(path: string, value: unknown, max: number, operation: WriteOperation, previous?: FileReceipt): Promise<FileReceipt>;
  remove(owned: FileReceipt): Promise<void>;
}
