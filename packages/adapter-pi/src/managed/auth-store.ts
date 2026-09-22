import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { fail, sanitized } from './errors.js';
import { exact, opaqueId, positive, validId, validToken, type AuthHello } from './protocol.js';
import { PrivateFiles, type OwnedFile } from './private-files.js';

export type Authorization = 'pending' | 'enabled' | 'revoked';
export type Target = { targetId: string; epoch: number; state: Authorization; digest: string | null };
type Registry = { schema: 1; authSetId: string; revision: number; targets: Target[] };
export type Credential = { schema: 1; authSetId: string; targetId: string; epoch: number; token: string };
export const STORE_BYTES = 256 * 1024;
export const CREDENTIAL_BYTES = 2048;
export const credentialPath = (root: string, targetId: string, epoch: number): string => {
  if (!validId(targetId) || !positive(epoch)) fail('store-corrupt');
  return join(root, 'targets', `${targetId}.${epoch}.json`);
};
const digest = (token: string) => createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex');
export function parseCredential(value: unknown, authSetId: string, targetId: string): Credential {
  if (!exact(value, ['schema', 'authSetId', 'targetId', 'epoch', 'token']) || value.schema !== 1 ||
      value.authSetId !== authSetId || value.targetId !== targetId || !positive(value.epoch) || !validToken(value.token)) fail('store-corrupt');
  return value as Credential;
}
export function parseRegistry(value: unknown): Registry {
  if (!exact(value, ['schema', 'authSetId', 'revision', 'targets']) || value.schema !== 1 || !validId(value.authSetId) ||
      !positive(value.revision) || !Array.isArray(value.targets) || value.targets.length > 128) fail('store-corrupt');
  const seen = new Set<string>();
  for (const target of value.targets) {
    if (!exact(target, ['targetId', 'epoch', 'state', 'digest']) || !validId(target.targetId) || seen.has(target.targetId) ||
        !positive(target.epoch) || !['pending', 'enabled', 'revoked'].includes(target.state as string) ||
        !(target.digest === null || validToken(target.digest)) || (target.state === 'enabled' && target.digest === null) ||
        (target.state === 'revoked' && target.digest !== null)) fail('store-corrupt');
    seen.add(target.targetId);
  }
  return value as Registry;
}

/** Single writer owned by the service's durable exclusive claim. Not a consent/install API. */
export class AuthStore {
  private registry!: Registry;
  private authority!: OwnedFile;
  private tokens = new Map<string, Credential>();
  private denied = new Set<string>();
  private fences = new Map<string, number>();
  private queue: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private closed = false;
  poisoned = false;
  onDeny: (targetId?: string) => void = () => {};
  private constructor(private readonly files: PrivateFiles) {}
  static async open(files: PrivateFiles, initialize: boolean): Promise<AuthStore> {
    const store = new AuthStore(files);
    const root = files.scope.roots.storageRoot;
    if (initialize) {
      await files.createDirectory(join(root, 'targets'), 'authority-write');
      store.registry = { schema: 1, authSetId: opaqueId(), revision: 1, targets: [] };
      store.authority = await files.publish(join(root, 'authorization.json'), store.registry, STORE_BYTES, 'authority-write');
    } else {
      const result = await files.read(join(root, 'authorization.json'), STORE_BYTES, 'authority-read');
      store.registry = parseRegistry(result.value); store.authority = result.owned;
      for (const target of store.registry.targets) if (target.state === 'enabled') {
        const { value } = await files.read(credentialPath(root, target.targetId, target.epoch), CREDENTIAL_BYTES, 'credential-read');
        const credential = parseCredential(value, store.registry.authSetId, target.targetId);
        if (credential.epoch !== target.epoch || digest(credential.token) !== target.digest) fail('store-corrupt');
        store.tokens.set(target.targetId, credential);
      }
    }
    return store;
  }
  snapshot(): { authSetId: string; revision: number; blocked: boolean; targets: Omit<Target, 'digest'>[] } {
    return { authSetId: this.registry.authSetId, revision: this.registry.revision, blocked: this.poisoned || this.closed,
      targets: this.registry.targets.map(({ digest: _digest, ...target }) => ({ ...target })) };
  }
  private available(): void { if (this.poisoned || this.closed) fail('unavailable'); }
  private expected(targetId: string, epoch: number, revision: number): Target {
    this.available();
    const target = this.registry.targets.find(t => t.targetId === targetId);
    if (!target || target.epoch !== epoch || this.registry.revision !== revision) fail('stale-operation');
    if (epoch >= Number.MAX_SAFE_INTEGER || revision >= Number.MAX_SAFE_INTEGER) fail('limit-exceeded');
    return target;
  }
  private invalidate(targetId: string): number {
    this.denied.add(targetId); const fence = (this.fences.get(targetId) ?? 0) + 1;
    this.fences.set(targetId, fence); this.tokens.delete(targetId); this.onDeny(targetId); return fence;
  }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    this.available();
    if (this.queued >= 128) {
      // Revoke/rotate may already have synchronously denied a target. Preserve the recovery barrier.
      this.poisoned = true; this.tokens.clear(); this.onDeny(); fail('limit-exceeded');
    }
    this.queued++;
    const result = this.queue.then(async () => {
      // Shutdown can cancel an already-denied mutation before its durable commit.
      // Treat that cancellation as uncertain so stop retains the restart barrier.
      try { this.available(); return await work(); }
      catch (error) { this.poisoned = true; this.tokens.clear(); this.onDeny(); throw sanitized(error); }
    });
    this.queue = result.catch(() => {}).finally(() => { this.queued--; });
    return result;
  }
  private async commit(target: Target): Promise<void> {
    if (this.registry.revision >= Number.MAX_SAFE_INTEGER) fail('limit-exceeded');
    const next: Registry = { ...this.registry, revision: this.registry.revision + 1,
      targets: [...this.registry.targets.filter(t => t.targetId !== target.targetId), target] };
    const authority = await this.files.publish(this.authority.path, next, STORE_BYTES, 'authority-write', this.authority);
    this.registry = next; this.authority = authority;
  }
  private async credential(targetId: string, epoch: number): Promise<Credential> {
    const credential: Credential = { schema: 1, authSetId: this.registry.authSetId, targetId, epoch, token: randomBytes(32).toString('hex') };
    await this.files.publish(credentialPath(this.files.scope.roots.storageRoot, targetId, epoch), credential, CREDENTIAL_BYTES, 'credential-write');
    return credential;
  }
  private async cleanupCredential(targetId: string, epoch: number, expectedDigest: string): Promise<void> {
    const result = await this.files.read(credentialPath(this.files.scope.roots.storageRoot, targetId, epoch), CREDENTIAL_BYTES, 'credential-read');
    const credential = parseCredential(result.value, this.registry.authSetId, targetId);
    if (credential.epoch !== epoch || digest(credential.token) !== expectedDigest) fail('store-corrupt');
    await this.files.remove(result.owned);
  }
  prepareTarget(): Promise<Omit<Target, 'digest'>> {
    return this.enqueue(async () => {
      if (this.registry.targets.length >= 128) fail('limit-exceeded');
      const targetId = opaqueId(); const credential = await this.credential(targetId, 1);
      const target: Target = { targetId, epoch: 1, state: 'pending', digest: digest(credential.token) };
      await this.commit(target);
      return { targetId, epoch: 1, state: 'pending' };
    });
  }
  enableTarget(targetId: string, epoch: number, revision: number): Promise<void> {
    this.expected(targetId, epoch, revision); const fence = this.fences.get(targetId) ?? 0;
    return this.enqueue(async () => {
      const target = this.expected(targetId, epoch, revision);
      if (target.state !== 'pending' || this.denied.has(targetId)) fail('stale-operation');
      const { value } = await this.files.read(credentialPath(this.files.scope.roots.storageRoot, targetId, epoch), CREDENTIAL_BYTES, 'credential-read');
      const credential = parseCredential(value, this.registry.authSetId, targetId);
      if (credential.epoch !== epoch || digest(credential.token) !== target.digest) fail('store-corrupt');
      if ((this.fences.get(targetId) ?? 0) !== fence) fail('stale-operation');
      await this.commit({ ...target, state: 'enabled' });
      if ((this.fences.get(targetId) ?? 0) !== fence) fail('outcome-uncertain');
      this.tokens.set(targetId, credential);
    });
  }
  revokeTarget(targetId: string, epoch: number, revision: number): Promise<void> {
    const target = this.expected(targetId, epoch, revision);
    this.invalidate(targetId); // Synchronous denial precedes queued IO, including already buffered frames.
    return this.enqueue(async () => {
      this.expected(targetId, epoch, revision);
      await this.commit({ targetId, epoch: epoch + 1, state: 'revoked', digest: null });
      if (target.digest !== null) await this.cleanupCredential(targetId, epoch, target.digest);
    });
  }
  rotateTarget(targetId: string, epoch: number, revision: number): Promise<void> {
    const target = this.expected(targetId, epoch, revision);
    if (target.state !== 'enabled') fail('stale-operation');
    const fence = this.invalidate(targetId);
    return this.enqueue(async () => {
      this.expected(targetId, epoch, revision);
      await this.commit({ targetId, epoch: epoch + 1, state: 'pending', digest: null });
      const credential = await this.credential(targetId, epoch + 1);
      if (this.fences.get(targetId) !== fence) fail('stale-operation');
      await this.commit({ targetId, epoch: epoch + 1, state: 'enabled', digest: digest(credential.token) });
      if (this.fences.get(targetId) !== fence) fail('outcome-uncertain');
      this.denied.delete(targetId); this.tokens.set(targetId, credential);
      await this.cleanupCredential(targetId, epoch, target.digest!);
    });
  }
  current(targetId: string, epoch: number): boolean {
    return !this.closed && !this.poisoned && !this.denied.has(targetId) && this.tokens.get(targetId)?.epoch === epoch;
  }
  authenticate(auth: AuthHello): boolean {
    const credential = this.tokens.get(auth.targetId);
    return auth.authSetId === this.registry.authSetId && this.current(auth.targetId, auth.epoch) && !!credential &&
      validToken(auth.token) && timingSafeEqual(Buffer.from(auth.token, 'hex'), Buffer.from(credential.token, 'hex'));
  }
  async close(): Promise<void> {
    this.closed = true; this.tokens.clear(); this.onDeny(); await this.queue;
  }
}
