import type { Stats } from 'node:fs';
import { isAbsolute, normalize, sep } from 'node:path';
import { fail } from './errors.js';

export type Roots = { storageRoot: string; runtimeRoot: string };
export type Operation = 'authority-read' | 'authority-write' | 'credential-read' | 'credential-write'
  | 'discovery-read' | 'discovery-write' | 'socket-bind' | 'socket-connect' | 'cleanup' | 'ownership';
export type Identity = Pick<Stats, 'dev' | 'ino' | 'uid' | 'mode'>;
export interface PolicyScope {
  readonly roots: Readonly<Roots>;
  readonly uid: number;
  /** Backend must bind roots/identities and recheck ACL and mount evidence per operation. */
  revalidate(operation: Operation, path: string, identity: Identity): Promise<void>;
  /** Only a verified backend may allow a particular public sticky ancestor. */
  allowStickyAncestor(path: string, identity: Identity): Promise<void>;
}
export interface FilesystemPolicy { openRoots(roots: Roots): Promise<PolicyScope> }
export const productionPolicy: FilesystemPolicy = {
  async openRoots() { return fail('acl-unverified'); },
};
export function validatePath(path: string): void {
  if (process.platform === 'win32' || !process.getuid) fail('unsupported-platform');
  if (!isAbsolute(path) || path.includes('\0') || normalize(path) !== path ||
      path.split(sep).some(part => part === '.' || part === '..') || path.length > 4096 ||
      path.split(sep).length > 64) fail('unsupported-path');
}
export function sameIdentity(a: Identity, b: Identity): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.uid === b.uid && a.mode === b.mode;
}
