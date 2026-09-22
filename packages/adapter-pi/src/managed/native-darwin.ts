import { createRequire } from 'node:module';

/** Internal primitive only. No package export, runtime build, path override, or policy injection into P2b.1. */
export type NativeHandle = object & { readonly __nativeHandle: unique symbol };
export type DarwinAclEntry = { tag: number; permissions: bigint; flags: number; principal: string };
export type DarwinEvidence = {
  dev: bigint; ino: bigint; uid: number; gid: number; mode: number; nlink: bigint; size: bigint;
  mtimeNs: bigint; ctimeNs: bigint; filesystem: string; mountFlags: number; fsid0: number; fsid1: number;
  acl: { state: 'absent' | 'present'; flags: number; entries: DarwinAclEntry[] };
};
export interface DarwinPrimitives {
  readonly version: 1;
  readonly napi: 8;
  /** Explicit canonical path only; walks and pins every component, refusing symlinks. */
  openRoot(path: string): NativeHandle;
  openDirectory(parent: NativeHandle, name: string): NativeHandle;
  openFile(parent: NativeHandle, name: string): NativeHandle;
  /** Existing empty 0600 writer.lock only: no creation, removal, replacement, or claim repair. */
  acquireWriter(root: NativeHandle): NativeHandle;
  inspect(handle: NativeHandle): DarwinEvidence;
  /** Root ancestors, in order, excluding the root itself. Fresh evidence, not policy acceptance. */
  ancestors(root: NativeHandle): DarwinEvidence[];
  readBounded(file: NativeHandle, max: number): { bytes: Buffer; before: DarwinEvidence; after: DarwinEvidence };
  close(handle: NativeHandle): void;
}
const require = createRequire(import.meta.url);
export function loadDarwinPrimitives(): DarwinPrimitives {
  if (process.platform !== 'darwin') throw new Error('unsupported-platform');
  // Development location only. Packaged Electron/external Node resource delivery is not approved.
  const native = require('../../native/managed-darwin/out/managed-darwin.node') as DarwinPrimitives;
  if (native.version !== 1 || native.napi !== 8 ||
      !['openRoot', 'openDirectory', 'openFile', 'acquireWriter', 'inspect', 'ancestors', 'readBounded', 'close']
        .every(name => typeof (native as unknown as Record<string, unknown>)[name] === 'function')) {
    throw new Error('native-version');
  }
  return native;
}
