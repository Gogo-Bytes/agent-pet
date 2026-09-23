import { createRequire } from 'node:module';
import { acceptDarwinEvidence } from './darwin-policy.js';

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
export interface DarwinWritePrimitives extends DarwinPrimitives {
  readonly writeVersion: 1;
  initializeWriter(root: NativeHandle): NativeHandle;
  createDirectory(parent: NativeHandle, name: string, lease: NativeHandle): NativeHandle;
  beginWrite(parent: NativeHandle, temporaryName: string, finalName: string, maxBytes: number, lease: NativeHandle): NativeHandle;
  write(writeHandle: NativeHandle, bytes: Buffer): void;
  publishNew(writeHandle: NativeHandle): NativeHandle;
  publishReplace(writeHandle: NativeHandle, expectedFile: NativeHandle): NativeHandle;
  removeChecked(expectedFile: NativeHandle, lease: NativeHandle): void;
  removeDirectoryChecked(expectedDirectory: NativeHandle, lease: NativeHandle): void;
}
type RawDarwinWritePrimitives = DarwinWritePrimitives;
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
function sameVolume(...samples: DarwinEvidence[]): void {
  const first = samples[0];
  if (!first || samples.some(sample => sample.dev !== first.dev || sample.fsid0 !== first.fsid0 || sample.fsid1 !== first.fsid1)) {
    throw new Error('mutation-volume-mismatch');
  }
}
/** Exact dormant write capability loader. It returns a policy-gated adapter, never raw mutators. */
export function loadDarwinWritePrimitives(): DarwinWritePrimitives {
  const raw = loadDarwinPrimitives() as RawDarwinWritePrimitives;
  if (raw.writeVersion !== 1 ||
      !['initializeWriter', 'createDirectory', 'beginWrite', 'write', 'publishNew', 'publishReplace',
        'removeChecked', 'removeDirectoryChecked'].every(name =>
        typeof (raw as unknown as Record<string, unknown>)[name] === 'function')) {
    throw new Error('native-write-version');
  }
  /* Child handles cannot enumerate their own native chain. Retain the opened
     root in this dormant adapter and use its fresh root/ancestor evidence for
     every legitimate descendant capability. Raw unregistered handles fail
     closed instead of falling back to pathname evidence. */
  type Capability = { root: NativeHandle; parent: NativeHandle | undefined; lease: NativeHandle | undefined };
  const capabilities = new WeakMap<NativeHandle, Capability>();
  const remember = (root: NativeHandle, handle: NativeHandle, parent?: NativeHandle, lease?: NativeHandle): NativeHandle => {
    capabilities.set(handle, { root, parent, lease });
    return handle;
  };
  const rootFor = (handle: NativeHandle): NativeHandle => {
    const capability = capabilities.get(handle);
    if (!capability) throw new Error('path-changed');
    return capability.root;
  };
  function fresh(handle: NativeHandle, role: 'directory' | 'file'): DarwinEvidence {
    const root = rootFor(handle);
    const uid = process.getuid?.();
    if (uid === undefined) throw new Error('unsupported-platform');
    for (const evidence of raw.ancestors(root)) acceptDarwinEvidence(evidence, 'ancestor', uid);
    const rootEvidence = raw.inspect(root);
    acceptDarwinEvidence(rootEvidence, 'directory', uid);
    // Validate every retained private directory, not only the immediate parent.
    // Root ancestors may cross the system/data volume boundary; private descendants may not.
    for (let current = handle; current !== root;) {
      const parent = capabilities.get(current)?.parent;
      if (!parent || rootFor(parent) !== root) throw new Error('mutation-root-mismatch');
      if (parent !== root) {
        const evidence = raw.inspect(parent);
        acceptDarwinEvidence(evidence, 'directory', uid);
        sameVolume(rootEvidence, evidence);
      }
      current = parent;
    }
    const current = handle === root ? rootEvidence : raw.inspect(handle);
    acceptDarwinEvidence(current, role, uid);
    sameVolume(rootEvidence, current);
    return current;
  }
  function validateAll(handles: Array<[NativeHandle, 'directory' | 'file']>): void {
    const roots = handles.map(([handle]) => rootFor(handle));
    const root = roots[0];
    if (!root || roots.some(value => value !== root)) throw new Error('mutation-root-mismatch');
    sameVolume(...handles.map(([handle, role]) => fresh(handle, role)));
  }
  function transactionLease(handle: NativeHandle): NativeHandle {
    const lease = capabilities.get(handle)?.lease;
    if (!lease) throw new Error('path-changed');
    return lease;
  }
  const adapter: DarwinWritePrimitives = {
    version: 1, napi: 8, writeVersion: 1,
    openRoot(path) {
      const root = raw.openRoot(path); return remember(root, root);
    },
    openDirectory(parent, name) {
      const root = rootFor(parent); return remember(root, raw.openDirectory(parent, name), parent);
    },
    openFile(parent, name) {
      const root = rootFor(parent); return remember(root, raw.openFile(parent, name), parent);
    },
    acquireWriter(root) {
      validateAll([[root, 'directory']]);
      return remember(rootFor(root), raw.acquireWriter(root), root);
    },
    inspect: raw.inspect, ancestors: raw.ancestors, readBounded: raw.readBounded, close: raw.close,
    initializeWriter(root) {
      if (rootFor(root) !== root) throw new Error('path-changed');
      validateAll([[root, 'directory']]);
      return remember(rootFor(root), raw.initializeWriter(root), root);
    },
    createDirectory(parent, name, lease) {
      validateAll([[parent, 'directory'], [lease, 'file']]);
      return remember(rootFor(parent), raw.createDirectory(parent, name, lease), parent);
    },
    beginWrite(parent, temporaryName, finalName, maxBytes, lease) {
      validateAll([[parent, 'directory'], [lease, 'file']]);
      return remember(rootFor(parent), raw.beginWrite(parent, temporaryName, finalName, maxBytes, lease), parent, lease);
    },
    write(writeHandle, bytes) {
      validateAll([[writeHandle, 'file'], [transactionLease(writeHandle), 'file']]);
      raw.write(writeHandle, bytes);
    },
    publishNew(writeHandle) {
      validateAll([[writeHandle, 'file'], [transactionLease(writeHandle), 'file']]);
      return raw.publishNew(writeHandle);
    },
    publishReplace(writeHandle, expectedFile) {
      validateAll([[writeHandle, 'file'], [expectedFile, 'file'], [transactionLease(writeHandle), 'file']]);
      return raw.publishReplace(writeHandle, expectedFile);
    },
    removeChecked(expectedFile, lease) {
      validateAll([[expectedFile, 'file'], [lease, 'file']]);
      raw.removeChecked(expectedFile, lease);
    },
    removeDirectoryChecked(expectedDirectory, lease) {
      validateAll([[expectedDirectory, 'directory'], [lease, 'file']]);
      raw.removeDirectoryChecked(expectedDirectory, lease);
    },
  };
  return adapter;
}
