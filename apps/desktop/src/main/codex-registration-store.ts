import * as fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { readPrivateFile, verifyPrivateDirectory } from '../../../../integrations/hook-runtime/private-activation.js';
import { validCodexHookOwnership, type CodexHookOwnership } from './codex-user-hook.js';
export type CodexRegistration = { schemaVersion: 1; configurationId: string; target: string; executable: string;
  disabled: boolean; removed: boolean; ownership: CodexHookOwnership; original: string | null };
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
/** App-private ownership and original hook evidence. Never restore the original over later edits. */
export class CodexRegistrationStore {
  error = false;
  private readonly sources = new WeakMap<CodexRegistration, Buffer>();
  constructor(readonly directory: string, private readonly id: string, private readonly target: string) {}
  read(): CodexRegistration | null {
    try {
      verifyPrivateDirectory(dirname(this.directory));
      try { fs.lstatSync(this.directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
      verifyPrivateDirectory(this.directory);
      const names: string[] = [], folder = fs.opendirSync(this.directory);
      try { let next: fs.Dirent | null; while ((next = folder.readSync()) && names.length < 3) names.push(next.name); }
      finally { folder.closeSync(); }
      if (names.sort().join(',') !== 'receipt.json,state.json') throw new Error();
      const bytes = readPrivateFile(join(this.directory, 'state.json'), 256 * 1024);
      if (readPrivateFile(join(this.directory, 'receipt.json'), 64).toString('utf8') !== hash(bytes)) throw new Error();
      const value: unknown = JSON.parse(bytes.toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      const v = value as CodexRegistration;
      if (Object.keys(v).sort().join(',') !== 'configurationId,disabled,executable,original,ownership,removed,schemaVersion,target' ||
          v.schemaVersion !== 1 || v.configurationId !== this.id || v.target !== this.target ||
          typeof v.executable !== 'string' || !v.executable.startsWith('/') || v.executable.length > 4096 ||
          typeof v.disabled !== 'boolean' || typeof v.removed !== 'boolean' || (v.removed && !v.disabled) ||
          !(v.original === null || (typeof v.original === 'string' && Buffer.byteLength(v.original) <= 65536)) ||
          !validCodexHookOwnership(v.ownership) || v.ownership.directory !== this.target) throw new Error();
      this.sources.set(v, Buffer.from(bytes)); return v;
    } catch { this.error = true; return null; }
  }
  initialize(value: CodexRegistration): boolean {
    if (this.error) return false;
    try { verifyPrivateDirectory(dirname(this.directory)); fs.mkdirSync(this.directory, { mode: 0o700 });
      this.commit(value, false); return !!this.read(); } catch { this.error = true; return false; }
  }
  update(disabled: boolean, removed = false): boolean {
    if (this.error) return false;
    const saved = this.read(); if (!saved) return false;
    try { this.commit({ ...saved, disabled, removed }, true, this.sources.get(saved)); return !!this.read(); }
    catch { this.error = true; return false; }
  }
  private commit(value: CodexRegistration, replacing: boolean, validatedSource?: Buffer) {
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text) > 256 * 1024) throw new Error();
    verifyPrivateDirectory(this.directory);
    const before = validatedSource;
    if (replacing && (!before || !readPrivateFile(join(this.directory, 'state.json'), 256 * 1024).equals(before))) throw new Error();
    const durable = (path: string, content: string) => {
      const fd = fs.openSync(path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    };
    const syncDirectory = () => { const fd = fs.openSync(this.directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } };
    durable(join(this.directory, '.pending'), ''); syncDirectory();
    for (const [name, content] of [['state.json', text], ['receipt.json', hash(text)]]) {
      if (replacing) {
        const path = join(this.directory, `.next-${randomUUID()}`);
        durable(path, content!);
        if (name === 'state.json' && !readPrivateFile(join(this.directory, name), 256 * 1024).equals(before!)) throw new Error();
        fs.renameSync(path, join(this.directory, name!));
      } else durable(join(this.directory, name!), content!);
    }
    syncDirectory(); fs.unlinkSync(join(this.directory, '.pending')); syncDirectory();
  }
}
