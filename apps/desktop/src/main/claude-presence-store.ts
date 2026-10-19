import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize } from 'node:path';

const LEGACY_PATHS = ['plugin/.claude-plugin/plugin.json', 'plugin/hooks/hooks.json', 'plugin/runtime/hook.cjs', 'launcher.cjs', 'activation.json'] as const;
const LEGACY_DIRECTORIES = ['', 'plugin', 'plugin/.claude-plugin', 'plugin/hooks', 'plugin/runtime'] as const;
const MAX_FILE = 512 * 1024, MAX_TOTAL = 2 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
type Receipt = { schemaVersion: 1; configurationId: string; executable: string; disabled: boolean; files: Record<string, string> };
type OwnedFile = { stat: fs.Stats; digest: string };
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const keys = (value: unknown, expected: readonly string[]): value is Record<string, unknown> => !!value &&
  typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === expected.length &&
  Object.keys(value).sort().join('\n') === [...expected].sort().join('\n');
const uid = () => { if (!process.getuid) throw new Error(); return process.getuid(); };
const sameIdentity = (a: fs.Stats, b: fs.Stats) => a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs &&
  a.uid === b.uid && a.gid === b.gid && a.mode === b.mode;
const sameFile = (a: fs.Stats, b: fs.Stats) => sameIdentity(a, b) && a.size === b.size && a.nlink === b.nlink &&
  a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
function absent(path: string): boolean {
  try { fs.lstatSync(path); return false; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
}
function validExecutable(value: unknown): value is string {
  return typeof value === 'string' && isAbsolute(value) && normalize(value) === value && dirname(value) !== value &&
    Buffer.byteLength(value) <= 4096 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function privateStat(path: string, kind: 'file' | 'directory'): fs.Stats {
  const stat = fs.lstatSync(path);
  if (stat.uid !== uid() || (stat.mode & 0o7777) !== (kind === 'file' ? 0o600 : 0o700) ||
      (kind === 'file' ? !stat.isFile() || stat.nlink !== 1 || stat.size > MAX_FILE : !stat.isDirectory())) throw new Error();
  return stat;
}
function readPrivate(path: string): { bytes: Buffer; stat: fs.Stats } {
  const before = privateStat(path, 'file');
  let fd: number | undefined;
  try {
    fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    if (!sameFile(before, fs.fstatSync(fd))) throw new Error();
    const buffer = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < buffer.length) {
      const length = fs.readSync(fd, buffer, count, buffer.length - count, count);
      if (!length) break;
      count += length;
    }
    if (count > MAX_FILE || !sameFile(before, fs.fstatSync(fd)) || !sameFile(before, privateStat(path, 'file'))) throw new Error();
    const closing = fd; fd = undefined; fs.closeSync(closing);
    return { bytes: buffer.subarray(0, count), stat: before };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function validReceipt(value: unknown, id: string, paths: readonly string[]): value is Receipt {
  return keys(value, ['schemaVersion', 'configurationId', 'executable', 'disabled', 'files']) && value.schemaVersion === 1 &&
    value.configurationId === id && validExecutable(value.executable) && typeof value.disabled === 'boolean' &&
    keys(value.files, paths) && Object.values(value.files).every(digest => typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest));
}

/** Main-only private materials. Constructor never creates/adopts a directory or repairs an
 * interrupted write. Unknown/edited/pending data is preserved. Path/fd checks bound local
 * races; this is not a claim of isolation from a concurrent same-UID process.
 */
export class ClaudePresenceStore {
  private failed = false;
  private value: Receipt | null = null;
  private readonly ancestors = new Map<string, fs.Stats>();
  private readonly directories = new Map<string, fs.Stats>();
  private readonly files = new Map<string, OwnedFile>();
  private normalUpgradeBackup = false;
  get error(): boolean { return this.failed; }
  private get paths(): readonly string[] { return this.layout === 'normal' ? ['observer.cjs', 'activation.json', 'hook.json', 'settings-before.json',
    ...(this.normalUpgradeBackup ? ['upgrade-before.json'] : [])] : LEGACY_PATHS; }
  private get directoryPaths(): readonly string[] { return this.layout === 'normal' ? [''] : LEGACY_DIRECTORIES; }
  constructor(private readonly directory: string, private readonly configurationId: string, private readonly layout: 'legacy' | 'normal' = 'legacy') {
    try {
      if (!UUID.test(configurationId) || !isAbsolute(directory) || normalize(directory) !== directory ||
          Buffer.byteLength(directory) > 4096 || /[\u0000-\u001f\u007f-\u009f]/u.test(directory) ||
          directory.split('/').length > 64 || basename(directory) !== `${layout === 'normal' ? 'claude-normal' : 'claude'}-${configurationId}`) throw new Error();
      let current = '/';
      this.ancestors.set(current, this.ancestorStat(current));
      for (const part of dirname(directory).split('/').filter(Boolean)) {
        current = join(current, part); this.ancestors.set(current, this.ancestorStat(current));
      }
      if (absent(directory)) return;
      if (layout === 'normal') this.normalUpgradeBackup = !absent(join(directory, 'upgrade-before.json'));
      for (const relative of this.directoryPaths) this.directories.set(relative, privateStat(join(directory, relative), 'directory'));
      // Fixed tree validation precedes reading any material, including activation secrets.
      this.checkTree(new Set([...this.paths, 'receipt.json']));
      let total = 0;
      for (const relative of [...this.paths, 'receipt.json']) {
        const { bytes, stat } = readPrivate(join(directory, relative)); total += bytes.length;
        if (total > MAX_TOTAL) throw new Error();
        this.files.set(relative, { stat, digest: hash(bytes) });
        if (relative === 'receipt.json') {
          const receipt: unknown = JSON.parse(bytes.toString('utf8'));
          if (!validReceipt(receipt, configurationId, this.paths)) throw new Error();
          this.value = receipt;
        }
      }
      if (!this.value || this.paths.some(path => this.files.get(path)?.digest !== this.value?.files[path])) throw new Error();
      this.assertState();
    } catch { this.failed = true; this.value = null; }
  }
  private ancestorStat(path: string): fs.Stats {
    const stat = fs.lstatSync(path);
    const rootStickyTmp = stat.uid === 0 && (stat.mode & 0o1000) !== 0 && basename(path) === 'tmp';
    if (!stat.isDirectory() || (stat.uid !== uid() && stat.uid !== 0) || ((stat.mode & 0o022) !== 0 && !rootStickyTmp)) throw new Error();
    return stat;
  }
  private checkDirectories(): void {
    for (const [path, stat] of this.ancestors) if (!sameIdentity(stat, this.ancestorStat(path))) throw new Error();
    for (const [relative, stat] of this.directories) if (!sameIdentity(stat, privateStat(join(this.directory, relative), 'directory'))) throw new Error();
  }
  private checkTree(filePaths: ReadonlySet<string>): void {
    this.checkDirectories();
    for (const relative of this.directories.keys()) {
      const expected = new Set<string>();
      for (const path of [...this.directories.keys(), ...filePaths]) {
        if (path && (dirname(path) === '.' ? '' : dirname(path)) === relative) expected.add(basename(path));
      }
      const directory = fs.opendirSync(join(this.directory, relative));
      let count = 0;
      try {
        for (let entry = directory.readSync(); entry; entry = directory.readSync()) {
          if (++count > expected.size || !expected.has(entry.name)) throw new Error();
        }
        if (count !== expected.size) throw new Error();
      } finally { directory.closeSync(); }
    }
  }
  private assertState(pending?: { relative: string; owned: OwnedFile }): void {
    const paths = new Set(this.files.keys()); if (pending) paths.add(pending.relative);
    this.checkTree(paths);
    for (const [relative, expected] of [...this.files, ...(pending ? [[pending.relative, pending.owned] as const] : [])]) {
      const actual = readPrivate(join(this.directory, relative));
      if (!sameFile(expected.stat, actual.stat) || expected.digest !== hash(actual.bytes)) throw new Error();
    }
    this.checkTree(paths);
    if ([...this.files.values()].reduce((sum, file) => sum + file.stat.size, 0) > MAX_TOTAL) throw new Error();
  }
  readMaterial(path: string): string | null {
    if (!this.paths.includes(path) || !this.verify()) return null;
    try {
      const actual = readPrivate(join(this.directory, path)), expected = this.files.get(path)!;
      if (!sameFile(actual.stat, expected.stat) || hash(actual.bytes) !== expected.digest) throw new Error();
      this.assertState(); return actual.bytes.toString('utf8');
    } catch { this.failed = true; return null; }
  }
  read(): { executable: string; disabled: boolean } | null {
    if (!this.value || !this.verify()) return null;
    return { executable: this.value.executable, disabled: this.value.disabled };
  }
  verify(): boolean {
    if (this.failed || !this.value) return false;
    try { this.assertState(); return true; } catch { this.failed = true; return false; }
  }
  private writeExclusive(relative: string, text: string): OwnedFile {
    this.assertState();
    const path = join(this.directory, relative);
    let fd: number | undefined;
    try {
      fd = fs.openSync(path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      const opened = fs.fstatSync(fd);
      fs.writeFileSync(fd, text); fs.fsyncSync(fd);
      const written = fs.fstatSync(fd);
      if (!sameIdentity(opened, written) || !sameFile(written, privateStat(path, 'file'))) throw new Error();
      const closing = fd; fd = undefined; fs.closeSync(closing);
      const actual = readPrivate(path);
      const owned = { stat: written, digest: hash(text) };
      if (!sameFile(written, actual.stat) || hash(actual.bytes) !== owned.digest) throw new Error();
      this.assertState({ relative, owned });
      return owned;
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  private syncRoot(): void {
    const fd = fs.openSync(this.directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try {
      if (!sameIdentity(this.directories.get('')!, fs.fstatSync(fd))) throw new Error();
      fs.fsyncSync(fd); this.checkDirectories();
    } finally { fs.closeSync(fd); }
  }
  private replace(relative: string, text: string): void {
    const pending = `${relative}.pending`;
    const owned = this.writeExclusive(pending, text);
    this.assertState({ relative: pending, owned });
    fs.renameSync(join(this.directory, pending), join(this.directory, relative));
    const committed = readPrivate(join(this.directory, relative));
    if (!sameIdentity(owned.stat, committed.stat) || hash(committed.bytes) !== owned.digest) throw new Error();
    this.files.set(relative, { stat: committed.stat, digest: owned.digest }); this.syncRoot(); this.assertState();
  }
  private receiptText(receipt: Receipt): string { return `${JSON.stringify(receipt)}\n`; }
  private ensureSize(replacements: Record<string, string>): void {
    let total = 0;
    for (const path of [...this.paths, 'receipt.json']) {
      const text = replacements[path], size = text === undefined ? this.files.get(path)?.stat.size : Buffer.byteLength(text);
      if (size === undefined || size > MAX_FILE) throw new Error();
      total += size;
    }
    if (total > MAX_TOTAL) throw new Error();
  }
  initialize(input: { executable: string; files: Record<string, string> }): boolean {
    if (this.failed) return false;
    try {
      if (this.value || this.directories.size || !validExecutable(input.executable) || !keys(input.files, this.paths) ||
          !Object.values(input.files).every(text => typeof text === 'string')) throw new Error();
      const files = { ...input.files };
      const receipt: Receipt = { schemaVersion: 1, configurationId: this.configurationId, executable: input.executable,
        disabled: false, files: Object.fromEntries(this.paths.map(path => [path, hash(files[path]!)])) };
      const text = this.receiptText(receipt);
      this.ensureSize({ ...files, 'receipt.json': text }); this.checkDirectories();
      if (!absent(this.directory)) throw new Error();
      for (const relative of this.directoryPaths) {
        this.assertState(); fs.mkdirSync(join(this.directory, relative), { mode: 0o700 });
        this.directories.set(relative, privateStat(join(this.directory, relative), 'directory')); this.assertState();
      }
      for (const relative of [...this.paths, 'receipt.json']) {
        const content = relative === 'receipt.json' ? text : files[relative]!;
        this.files.set(relative, this.writeExclusive(relative, content));
      }
      this.syncRoot(); this.value = receipt; this.assertState(); return true;
    } catch { this.failed = true; this.value = null; return false; }
  }
  replaceActivation(text: string, disabled: boolean): boolean {
    if (this.failed) return false;
    try {
      if (!this.value || typeof text !== 'string' || typeof disabled !== 'boolean') throw new Error();
      const next: Receipt = { ...this.value, disabled, files: { ...this.value.files, 'activation.json': hash(text) } };
      const receipt = this.receiptText(next);
      this.ensureSize({ 'activation.json': text, 'receipt.json': receipt });
      this.replace('activation.json', text); this.replace('receipt.json', receipt); this.value = next; return true;
    } catch { this.failed = true; this.value = null; return false; }
  }
  /** Explicit receipt-identity migration only; caller has revalidated the old
   * registration and saved an external private backup. Never writes settings.
   */
  replaceHookIdentity(text: string): boolean {
    if (this.failed) return false;
    try {
      if (this.layout !== 'normal' || !this.value || !this.verify() || typeof text !== 'string') throw new Error();
      const next: Receipt = { ...this.value, files: { ...this.value.files, 'hook.json': hash(text) } };
      const receipt = this.receiptText(next);
      this.ensureSize({ 'hook.json': text, 'receipt.json': receipt });
      this.replace('hook.json', text); this.replace('receipt.json', receipt); this.value = next; return true;
    } catch { this.failed = true; this.value = null; return false; }
  }
  /** Explicit one-time registration upgrade only. Keep original settings evidence
   * untouched and save old private materials before replacing any of them. A
   * partial publication fails closed with recovery evidence retained on disk.
   */
  replaceNormalMaterials(materials: Record<string, string>, disabled = false): boolean {
    if (this.failed) return false;
    try {
      const replacements = ['hook.json', 'observer.cjs', 'activation.json'];
      if (this.layout !== 'normal' || this.normalUpgradeBackup || !this.value || !this.verify() ||
          !keys(materials, replacements) || !Object.values(materials).every(text => typeof text === 'string') ||
          typeof disabled !== 'boolean') throw new Error();
      const before = Object.fromEntries(replacements.map(path => [path, this.readMaterial(path)]));
      if (Object.values(before).some(text => text === null)) throw new Error();
      const originalReceipt = readPrivate(join(this.directory, 'receipt.json')).bytes.toString('utf8');
      const backup = JSON.stringify({ schemaVersion: 1, materials: before, receipt: originalReceipt }) + '\n';
      this.normalUpgradeBackup = true;
      const next: Receipt = { ...this.value, disabled, files: { ...this.value.files,
        ...Object.fromEntries(replacements.map(path => [path, hash(materials[path]!)])), 'upgrade-before.json': hash(backup) } };
      const receipt = this.receiptText(next);
      this.ensureSize({ ...materials, 'upgrade-before.json': backup, 'receipt.json': receipt });
      this.files.set('upgrade-before.json', this.writeExclusive('upgrade-before.json', backup));
      this.syncRoot();
      // Prospective registration ownership precedes the shared-settings apply.
      for (const path of replacements) this.replace(path, materials[path]!);
      this.replace('receipt.json', receipt); this.value = next; return true;
    } catch { this.failed = true; this.value = null; return false; }
  }
  setDisabled(disabled: boolean): boolean {
    if (this.failed) return false;
    try {
      if (!this.value || typeof disabled !== 'boolean') throw new Error();
      const next = { ...this.value, disabled }, receipt = this.receiptText(next);
      this.ensureSize({ 'receipt.json': receipt }); this.replace('receipt.json', receipt); this.value = next; return true;
    } catch { this.failed = true; this.value = null; return false; }
  }
}
