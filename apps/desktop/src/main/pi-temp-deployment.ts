import { constants, type Stats } from 'node:fs';
import { mkdir, open, rmdir, unlink, type FileHandle } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { renderConfiguredPiExtension, type PiExtensionConfig } from '../../../../integrations/pi-extension/configured-source.js';
import { inspectTarget, ReadBudget } from './pi-preflight-files.js';
import type { Finding } from '../shared/pi-preflight.js';

export interface TemporaryDeploymentPreview {
  readonly target: { readonly path: string; readonly source: 'chosen' };
  readonly path: string;
  readonly action: 'create' | 'blocked';
  readonly findings: readonly Finding[];
  readonly createDirectories: readonly string[];
  readonly loadRequirements: string;
}
export interface TemporaryDeploymentReceipt { readonly path: string; readonly status: 'deployed-awaiting-load' }
type Evidence = Map<string, string | null>;
type Plan = { source: string; evidence: Evidence; directories: readonly string[] };
type Ownership = { source: string; file: Stats; directories: Map<string, Stats> };
// A narrow deterministic write/close failure seam, not a replacement filesystem/installer.
type ArtifactIO = {
  write(file: FileHandle, source: string): Promise<void>;
  close(file: FileHandle): Promise<void>;
};
const artifactIO: ArtifactIO = {
  async write(file, source) { await file.writeFile(source, 'utf8'); },
  async close(file) { await file.close(); },
};
const identity = (s: Stats) => [s.dev, s.ino, s.birthtimeMs, s.mode, s.uid, s.gid].join(':');
const fingerprint = (s: Stats) => [identity(s), s.size, s.nlink, s.mtimeMs, s.ctimeMs].join(':');
const equalEvidence = (a: Evidence, b: Evidence) => a.size === b.size && [...a].every(([p, v]) => b.get(p) === v);

/** Explicit-target deployment only. No discovery, persistent ownership or runtime unloading.
 * Local revalidation + exclusive creation are not same-UID attacker isolation.
 */
export class PiTemporaryDeployment {
  #target: string;
  #config: PiExtensionConfig;
  #io: ArtifactIO;
  #plans = new WeakMap<TemporaryDeploymentPreview, Plan>();
  #owned = new WeakMap<TemporaryDeploymentReceipt, Ownership>();
  constructor(targetDirectory: string, config: PiExtensionConfig, io: ArtifactIO = artifactIO) {
    try {
      new ReadBudget().validatePath(targetDirectory);
      if (normalize(targetDirectory) !== targetDirectory || dirname(targetDirectory) === targetDirectory) throw new Error();
    } catch { throw new Error('Invalid temporary pi target'); }
    this.#target = targetDirectory;
    this.#config = { endpoint: config.endpoint, token: config.token };
    this.#io = io;
  }

  async #inspect() {
    const evidence: Evidence = new Map();
    const target = this.#target;
    class RecordingBudget extends ReadBudget {
      override async stat(path: string) {
        const stat = await super.stat(path);
        // Ancestors are identity-only: unrelated temporary siblings are not target state.
        const value = stat ? (path === target || path.startsWith(target + '/') ? fingerprint(stat) : identity(stat)) : null;
        if (evidence.has(path) && evidence.get(path) !== value) throw new Error('Changed target');
        evidence.set(path, value);
        return stat;
      }
    }
    const budget = new RecordingBudget();
    const inspection = await inspectTarget({ path: target, source: 'chosen' }, budget);
    if (inspection.findings.some(f => f !== 'missing-target')) return { evidence, findings: inspection.findings };
    // Fixed metadata evidence even for an absent target; never enumerate configuration.
    for (const relative of ['extensions', 'settings.json', '.gitignore', '.ignore', '.fdignore',
      'extensions/index.ts', 'extensions/index.js', 'extensions/agent-pet.ts', 'extensions/package.json',
      'extensions/.gitignore', 'extensions/.ignore', 'extensions/.fdignore']) await budget.stat(join(target, relative));
    // Only the target itself and its extensions directory may be created, never missing ancestors.
    if (!await budget.stat(dirname(target))) inspection.findings.push('unsafe');
    return { evidence, findings: inspection.findings };
  }

  async preview(): Promise<TemporaryDeploymentPreview> {
    try {
      const before = await this.#inspect();
      const source = await renderConfiguredPiExtension(this.#config);
      const after = await this.#inspect();
      if (!equalEvidence(before.evidence, after.evidence)) throw new Error();
      const directories = [this.#target, join(this.#target, 'extensions')]
        .filter(path => !after.evidence.get(path));
      const preview: TemporaryDeploymentPreview = Object.freeze({
        target: Object.freeze({ path: this.#target, source: 'chosen' as const }),
        path: join(this.#target, 'extensions', 'agent-pet.ts'),
        action: after.findings.every(f => f === 'missing-target') ? 'create' : 'blocked',
        findings: Object.freeze([...after.findings]),
        createDirectories: Object.freeze(directories),
        loadRequirements: 'Process-local deployment only; not installation or loaded/connected evidence. The selected pi configuration root must be active, extensions enabled and project trust granted where applicable. User must open pi or safely /reload; no settings/trust changes or automatic reload. Withdrawal does not unload a running extension.',
      });
      if (preview.action === 'create') this.#plans.set(preview, { source, evidence: after.evidence, directories });
      return preview;
    } catch { throw new Error('Temporary pi preview failed'); }
  }

  cancel(preview: TemporaryDeploymentPreview): 'cancelled' | 'invalid-plan' {
    return this.#plans.delete(preview) ? 'cancelled' : 'invalid-plan';
  }

  async apply(preview: TemporaryDeploymentPreview): Promise<
    { status: 'deployed'; receipt: TemporaryDeploymentReceipt } |
    { status: 'invalid-plan' | 'stale-plan' | 'failed-preserved' }
  > {
    const plan = this.#plans.get(preview);
    if (!plan) return { status: 'invalid-plan' };
    // Consume before awaiting: one confirmation can never create two artifacts.
    this.#plans.delete(preview);
    const directories = new Map<string, Stats>();
    let file: FileHandle | undefined;
    try {
      const current = await this.#inspect();
      if (!equalEvidence(plan.evidence, current.evidence)) return { status: 'stale-plan' };
      for (const path of plan.directories) {
        await mkdir(path, { mode: 0o700 }); // EEXIST is a change, not permission to adopt it.
        const stat = await new ReadBudget().stat(path);
        if (!stat?.isDirectory()) throw new Error();
        directories.set(path, stat);
      }
      // Recheck loading obstacles after directory creation; do not bypass settings/ignore rules.
      const ready = await this.#inspect();
      if (ready.findings.length) throw new Error();
      for (const [path, value] of plan.evidence) {
        if (path === this.#target || path === join(this.#target, 'extensions')) continue;
        if (ready.evidence.get(path) !== value) throw new Error();
      }
      for (const path of [this.#target, join(this.#target, 'extensions')]) {
        const stat = await new ReadBudget().stat(path);
        const original = directories.get(path);
        if (!stat || (original ? identity(stat) !== identity(original) : !plan.evidence.get(path)?.startsWith(identity(stat) + ':'))) throw new Error();
      }
      file = await open(preview.path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await this.#io.write(file, plan.source);
      const stat = await file.stat();
      await this.#io.close(file);
      file = undefined;
      if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size !== Buffer.byteLength(plan.source)) throw new Error();
      // Record directory timestamps after our own additions, not before them.
      for (const [path, original] of directories) {
        const now = await new ReadBudget().stat(path);
        if (!now || identity(now) !== identity(original)) throw new Error();
        directories.set(path, now);
      }
      const receipt: TemporaryDeploymentReceipt = Object.freeze({ path: preview.path, status: 'deployed-awaiting-load' });
      this.#owned.set(receipt, { source: plan.source, file: stat, directories });
      return { status: 'deployed', receipt };
    } catch {
      // Partial write/close is uncertain. Never unlink it, adopt it, or remove its directories.
      return { status: 'failed-preserved' };
    } finally {
      if (file) { try { await file.close(); } catch { /* Preserve uncertain state; never claim success. */ } }
    }
  }

  async withdraw(receipt: TemporaryDeploymentReceipt): Promise<{
    file: 'removed' | 'retained-changed' | 'retained-unknown' | 'failed-preserved';
    directories: 'removed' | 'retained';
    runtime: 'not-unloaded';
  }> {
    const owned = this.#owned.get(receipt);
    const result = (file: 'removed' | 'retained-changed' | 'retained-unknown' | 'failed-preserved', directories: 'removed' | 'retained' = 'retained') =>
      ({ file, directories, runtime: 'not-unloaded' as const });
    if (!owned) return result('retained-unknown');
    this.#owned.delete(receipt);
    let removed = false;
    try {
      const budget = new ReadBudget();
      const before = await budget.regular(receipt.path);
      if (!before || fingerprint(before) !== fingerprint(owned.file)) return result('retained-changed');
      const file = await open(receipt.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let matches = false;
      try {
        if (fingerprint(await file.stat()) !== fingerprint(owned.file)) return result('retained-changed');
        const bytes = Buffer.alloc(Buffer.byteLength(owned.source) + 1);
        let offset = 0;
        while (offset < bytes.length) {
          budget.check();
          const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
          if (!bytesRead) break;
          offset += bytesRead;
        }
        matches = bytes.subarray(0, offset).equals(Buffer.from(owned.source)) && fingerprint(await file.stat()) === fingerprint(owned.file);
      } finally { await file.close(); }
      const after = await budget.stat(receipt.path);
      if (!matches || !after || fingerprint(after) !== fingerprint(owned.file)) return result('retained-changed');
      // Establish which owned directories are unchanged BEFORE our removal changes timestamps.
      const removable = new Set<string>();
      for (const [path, stat] of owned.directories) {
        const now = await budget.stat(path);
        if (now && fingerprint(now) === fingerprint(stat)) removable.add(path);
      }
      await unlink(receipt.path);
      removed = true;
      let retained = false;
      for (const [path, stat] of [...owned.directories].reverse()) {
        try {
          const now = await budget.stat(path);
          if (!removable.has(path) || !now || identity(now) !== identity(stat)) { retained = true; continue; }
          await rmdir(path); // Empty-only, never recursive.
        } catch { retained = true; } // The file was removed even if directory cleanup fails.
      }
      return result('removed', retained ? 'retained' : 'removed');
    } catch {
      // Preserve retry evidence only before unlink succeeds; retry revalidates everything.
      if (!removed) this.#owned.set(receipt, owned);
      return result('failed-preserved');
    }
  }
}
