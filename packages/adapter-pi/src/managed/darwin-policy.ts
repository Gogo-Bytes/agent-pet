import type { DarwinEvidence } from './native-darwin.js';

/** Darwin SDK constants, not Linux ACL semantics. Unknown bits fail closed. */
const ACL_PERMISSIONS = 0x103ffen;
const ANCESTOR_MUTATION = 0x3574n; // write/add, delete, append, delete-child, write attrs/xattrs/security, owner
const ENTRY_FLAGS = 0x1f0;
const ACL_FLAGS = 0x20000; // NO_INHERIT; deferred inheritance is not supported
const LOCAL = 0x1000;
// Explicit reviewed subset: sync/noexec/nosuid/nodev, local/quota/rootfs,
// dontbrowse/journaled/no-xattr/nofollow/noatime/strictatime; cprotect/multilabel/dovolfs
// are tolerated feature bits, not ACL proof. Operations can still fail under MAC/content protection.
const COMMON_MOUNT_FLAGS = 0x9d90f09e;
const ANCESTOR_ONLY = 0x40000001; // readonly, snapshot
const u32 = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
function reject(reason: string): never { throw new Error(reason); }

/** Conservative access-policy acceptance, NOT a general effective-rights or principal resolver.
 * Callers must bind this evidence to the operation; no cached verified boolean is returned.
 * Shared sticky ancestors are intentionally unsupported in this slice.
 */
export function acceptDarwinEvidence(e: DarwinEvidence, role: 'ancestor' | 'directory' | 'file', uid: number): void {
  if (!u32(e.mountFlags) || e.filesystem !== 'apfs' || !(e.mountFlags & LOCAL) ||
      (e.mountFlags & ~(COMMON_MOUNT_FLAGS | (role === 'ancestor' ? ANCESTOR_ONLY : 0))) !== 0 ||
      !u32(e.fsid0) || !u32(e.fsid1)) reject('unsupported-mount');
  if (!u32(e.uid) || !u32(e.gid) || !u32(e.mode) || typeof e.dev !== 'bigint' || typeof e.ino !== 'bigint' ||
      e.dev < 0n || e.ino < 0n || typeof e.nlink !== 'bigint' || typeof e.size !== 'bigint' || e.size < 0n ||
      typeof e.mtimeNs !== 'bigint' || typeof e.ctimeNs !== 'bigint') reject('invalid-evidence');
  const type = e.mode & 0o170000;
  if (role === 'ancestor') {
    if (type !== 0o040000 || (e.uid !== uid && e.uid !== 0) || (e.mode & 0o022)) reject('unsafe-ancestor');
  } else if (e.uid !== uid || type !== (role === 'directory' ? 0o040000 : 0o100000) ||
      (e.mode & 0o7777) !== (role === 'directory' ? 0o700 : 0o600) ||
      (role === 'file' && (e.nlink !== 1n || e.size > 256n * 1024n))) reject('unsafe-object');
  if (!e.acl || !['absent', 'present'].includes(e.acl.state) || !u32(e.acl.flags) || (e.acl.flags & ~ACL_FLAGS) ||
      !Array.isArray(e.acl.entries) || e.acl.entries.length > 128 ||
      (e.acl.state === 'absent' && (e.acl.entries.length !== 0 || e.acl.flags !== 0))) reject('unsupported-acl');
  for (const entry of e.acl.entries) {
    if (![1, 2].includes(entry.tag) || !u32(entry.flags) || (entry.flags & ~ENTRY_FLAGS) ||
        typeof entry.permissions !== 'bigint' || entry.permissions < 0n || (entry.permissions & ~ACL_PERMISSIONS) ||
        !/^[0-9a-f]{32}$/.test(entry.principal)) reject('unsupported-acl');
    if (entry.tag === 1 && (role !== 'ancestor' || (entry.permissions & ANCESTOR_MUTATION))) reject('unsupported-acl');
  }
}
