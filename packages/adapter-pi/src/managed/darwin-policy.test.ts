import { describe, expect, it } from 'vitest';
import { acceptDarwinEvidence } from './darwin-policy.js';
import type { DarwinEvidence } from './native-darwin.js';

// Synthetic policy decisions only: these do NOT demonstrate native ACL or mount isolation.
const fixture = (): DarwinEvidence => ({
  dev: 1n, ino: 2n ** 60n, uid: 501, gid: 20, mode: 0o100600, nlink: 1n, size: 0n,
  mtimeNs: 1n, ctimeNs: 1n, filesystem: 'apfs', mountFlags: 0x1000, fsid0: 1, fsid1: 2,
  acl: { state: 'present', flags: 0, entries: [] },
});
const entry = (tag: number, permissions: bigint, flags = 0) => ({ tag, permissions, flags, principal: '0'.repeat(32) });
describe('darwin-policy (synthetic evidence)', () => {
  it('accepts exact private APFS evidence without truncating inode identity', () => {
    expect(() => acceptDarwinEvidence(fixture(), 'file', 501)).not.toThrow();
    expect(fixture().ino).toBe(1152921504606846976n);
  });
  it.each([0, 0x201000, 0x1001, 0x40001000, 0x1020, 0x1040, 0x1100, 0x10001000 | 0x800,
    0x401000, 0x2001000, 0x80001000 | 0x10000])('rejects unsafe/unknown writable mount flags %s', mountFlags => {
    expect(() => acceptDarwinEvidence({ ...fixture(), mountFlags: mountFlags >>> 0 }, 'file', 501)).toThrow('unsupported-mount');
  });
  it('allows readonly/snapshot APFS ancestors but not private roots', () => {
    const e = { ...fixture(), uid: 0, mode: 0o040755, mountFlags: 0x40005001 };
    expect(() => acceptDarwinEvidence(e, 'ancestor', 501)).not.toThrow();
    expect(() => acceptDarwinEvidence(e, 'directory', 501)).toThrow();
  });
  it.each([0x80, 0x4000000, 0x8000, 0x4909080])('tolerates documented feature bits %s, never unsafe combinations', bits => {
    const mountFlags = bits | 0x1000;
    expect(() => acceptDarwinEvidence({ ...fixture(), mountFlags }, 'file', 501)).not.toThrow();
    for (const unsafe of [1, 0x40000000, 0x200000, 0x20, 0x40, 0x100, 0x400000, 0x2000000, 0x800]) {
      expect(() => acceptDarwinEvidence({ ...fixture(), mountFlags: (mountFlags | unsafe) >>> 0 }, 'file', 501)).toThrow();
    }
  });
  it('rejects non APFS and malformed mount flags', () => {
    for (const e of [{ ...fixture(), filesystem: 'nfs' }, { ...fixture(), mountFlags: NaN }]) {
      expect(() => acceptDarwinEvidence(e, 'file', 501)).toThrow('unsupported-mount');
    }
  });
  it('accepts deny-delete ancestor and recognized inherited denies', () => {
    const e = fixture(); e.mode = 0o040755; e.acl.entries = [entry(2, 16n, 0x70)];
    expect(() => acceptDarwinEvidence(e, 'ancestor', 501)).not.toThrow();
    e.mode = 0o100600;
    expect(() => acceptDarwinEvidence(e, 'file', 501)).not.toThrow();
  });
  it('accepts ancestor read/search-only allows, never private allows', () => {
    const e = fixture(); e.mode = 0o040755; e.acl.entries = [entry(1, 10n, 0x70)];
    expect(() => acceptDarwinEvidence(e, 'ancestor', 501)).not.toThrow();
    e.mode = 0o100600;
    expect(() => acceptDarwinEvidence(e, 'file', 501)).toThrow('unsupported-acl');
  });
  it.each([4n, 16n, 32n, 64n, 256n, 1024n, 4096n, 8192n])('rejects ancestor mutation bit %s', permissions => {
    const e = fixture(); e.mode = 0o040755; e.acl.entries = [entry(1, permissions)];
    expect(() => acceptDarwinEvidence(e, 'ancestor', 501)).toThrow('unsupported-acl');
  });
  it('rejects unknown tags/permissions/inheritance/global flags and excess entries', () => {
    const bad = [entry(3, 0n), entry(2, 1n), entry(2, 0n, 1), entry(2, -1n)];
    for (const v of bad) { const e = fixture(); e.acl.entries = [v]; expect(() => acceptDarwinEvidence(e, 'file', 501)).toThrow(); }
    const e = fixture(); e.acl.flags = 1;
    expect(() => acceptDarwinEvidence(e, 'file', 501)).toThrow();
    e.acl.flags = 0; e.acl.entries = Array.from({ length: 129 }, () => entry(2, 0n));
    expect(() => acceptDarwinEvidence(e, 'file', 501)).toThrow();
  });
  it('accepts explicit absence only without contradictory entries/flags', () => {
    const e = fixture(); e.acl.state = 'absent';
    expect(() => acceptDarwinEvidence(e, 'file', 501)).not.toThrow();
    e.acl.entries = [entry(2, 16n)];
    expect(() => acceptDarwinEvidence(e, 'file', 501)).toThrow();
  });
  it('requires exact owner/type/mode/links and rejects sticky ancestors without an exception', () => {
    for (const e of [{ ...fixture(), uid: 502 }, { ...fixture(), mode: 0o100640 }, { ...fixture(), nlink: 2n },
      { ...fixture(), mode: 0o010600 }, { ...fixture(), size: 262145n }]) {
      expect(() => acceptDarwinEvidence(e, 'file', 501)).toThrow();
    }
    expect(() => acceptDarwinEvidence({ ...fixture(), mode: 0o041777, uid: 0 }, 'ancestor', 501)).toThrow();
  });
});
