import net, { type Socket } from 'node:net';
import { chmod, lstat, mkdir, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Stats } from 'node:fs';
import type { SessionObservation } from '@agent-pet/domain';
import { PiSessionMapper } from '../session-mapper.js';
import { AuthStore } from './auth-store.js';
import { fail, missing, sanitized } from './errors.js';
import { Bucket, Frames, frameBudget, lowerLimits, sendFrame, type Limits } from './frames.js';
import { PrivateFiles, type FaultHook, type OwnedFile } from './private-files.js';
import { NodeFilesPort, REMOVE_AFTER_DRAIN } from './node-files-port.js';
import type { FileReceipt, FilesPort, OwnerClaim } from './files-port.js';
import { DarwinFilesPort } from './darwin-files-port.js';
import { sameIdentity, type FilesystemPolicy, type Roots } from './path-policy.js';
import { ackFor, opaqueId, parseAuth, parseEvent, PROTOCOL, type AuthHello } from './protocol.js';
import { DISCOVERY_BYTES, endpoint, type Discovery } from './discovery.js';

// Wire sequence numbers restart per connection. Application revisions must instead
// advance across reconnects and core replacement within this process lifetime.
let managedObservationRevision = 0;
function nextObservationRevision(): number {
  if (managedObservationRevision >= Number.MAX_SAFE_INTEGER) fail('limit-exceeded');
  return ++managedObservationRevision;
}

export type CoreOptions = {
  roots: Roots; policy: FilesystemPolicy; initialize: boolean;
  publish(observation: SessionObservation): void;
  limits?: Partial<Limits>; fault?: FaultHook;
};

type RuntimeResource = { path: string; identity: Stats };
interface RuntimeBoundary {
  readonly runtimeRoot: string;
  createInstance(path: string): Promise<RuntimeResource>;
  socket(path: string): Promise<RuntimeResource>;
  unchanged(resource: RuntimeResource): Promise<boolean>;
  remove(resource: RuntimeResource): Promise<void>;
}

function nodeRuntime(files: PrivateFiles, storage: NodeFilesPort, owner: OwnerClaim): RuntimeBoundary {
  return {
    runtimeRoot: files.scope.roots.runtimeRoot,
    async createInstance(path) {
      return files.createDirectory(path, 'socket-bind');
    },
    async socket(path) {
      return files.socket(path, 'socket-bind');
    },
    async unchanged(resource) {
      try { return sameIdentity(resource.identity, await lstat(resource.path)); }
      catch { return false; }
    },
    async remove(resource) {
      await storage[REMOVE_AFTER_DRAIN](resource as never, owner, true);
    },
  };
}

// The native backend deliberately uses Node only for the synthetic UDS fixture
// boundary. Storage authority, owner claim and credentials remain native.
function nativeRuntime(runtimeRoot: string): RuntimeBoundary {
  const resource = async (path: string, operation: 'directory' | 'socket'): Promise<RuntimeResource> => {
    const identity = await lstat(path);
    if (operation === 'directory' && (!identity.isDirectory() || identity.isSymbolicLink())) fail('unsafe-type');
    if (operation === 'socket' && (!identity.isSocket() || identity.isSymbolicLink())) fail('unsafe-type');
    if (identity.uid !== process.getuid?.() || (operation === 'directory' ? (identity.mode & 0o7777) !== 0o700 : (identity.mode & 0o7777) !== 0o600)) fail('unsafe-mode');
    return { path, identity };
  };
  return {
    runtimeRoot,
    async createInstance(path) {
      await mkdir(path, { mode: 0o700 });
      return resource(path, 'directory');
    },
    socket(path) { return resource(path, 'socket'); },
    async unchanged(value) {
      try {
        const current = await lstat(value.path);
        return sameIdentity(value.identity, current);
      } catch { return false; }
    },
    async remove(value) {
      if (!(await resource(value.path, 'directory'))) return;
      await rmdir(value.path);
    },
  };
}

/** Internal mechanism seam only. ./managed does not expose policy injection. */
export async function openManagedCore(options: CoreOptions): Promise<ManagedCore> {
  try {
    const scope = await options.policy.openRoots(options.roots);
    const files = new PrivateFiles(scope, options.fault);
    await files.directory(scope.roots.storageRoot, 'ownership');
    await files.directory(scope.roots.runtimeRoot, 'ownership');
    const storage = new NodeFilesPort(files);
    const claim = await storage.acquireOwner();
    const store = await AuthStore.open(storage, options.initialize);
    return new ManagedCore(nodeRuntime(files, storage, claim), storage, claim, store, options.publish, lowerLimits(options.limits));
  } catch (error) { throw sanitized(error); }
}

/** Internal B3-only native factory. It is intentionally not exported publicly. */
export async function openNativeManagedCore(options: Omit<CoreOptions, 'policy'>): Promise<ManagedCore> {
  if (process.platform !== 'darwin') return fail('unsupported-platform');
  let storage: DarwinFilesPort | undefined;
  try {
    storage = await DarwinFilesPort.open(options.roots.storageRoot, options.initialize);
    const claim = await storage.acquireOwner();
    const store = await AuthStore.open(storage, options.initialize);
    return new ManagedCore(nativeRuntime(options.roots.runtimeRoot), storage, claim, store, options.publish, lowerLimits(options.limits));
  } catch (error) {
    if (storage) { await storage.drain().catch(() => {}); await storage.close().catch(() => {}); }
    throw sanitized(error);
  }
}

export class ManagedCore {
  readonly generation = opaqueId();
  private readonly sockets = new Set<Socket>();
  private readonly targets = new Map<string, Set<Socket>>();
  private readonly server: net.Server;
  private readonly global;
  private readonly connections: Bucket;
  private unauthenticated = 0;
  private instance: OwnedFile | undefined;
  private socketIdentity: OwnedFile | undefined;
  private discovery: FileReceipt | undefined;
  private stopping: Promise<void> | undefined;
  private starting: Promise<Discovery> | undefined;
  private stopped = false;
  private failed = false;
  private listening = false;
  private ready = false;
  constructor(private readonly runtime: RuntimeBoundary, private readonly storage: FilesPort, private readonly claim: OwnerClaim,
    readonly store: AuthStore, private readonly publish: (observation: SessionObservation) => void,
    private readonly limits: Limits) {
    this.global = frameBudget(limits);
    this.connections = new Bucket(limits.connectionsPerSecond, limits.connectionBurst);
    this.server = net.createServer(socket => this.accept(socket));
    this.server.on('error', () => { this.failed = true; this.ready = false; this.destroyPeers(); });
    store.onDeny = target => {
      if (!target) { this.ready = false; this.destroyPeers(); }
      else for (const socket of this.targets.get(target) ?? []) socket.destroy();
    };
  }
  connectionsSnapshot(): Record<string, number> {
    return Object.fromEntries([...this.targets].map(([target, sockets]) => [target, [...sockets].filter(s => !s.destroyed).length]));
  }
  start(): Promise<Discovery> {
    if (this.stopped || this.store.poisoned || this.failed) return Promise.reject(sanitized(null));
    this.starting ??= this.startOnce(); return this.starting;
  }
  private async startOnce(): Promise<Discovery> {
    try {
      let instanceId = '';
      for (let attempt = 0; attempt < 4; attempt++) {
        instanceId = opaqueId(); const path = endpoint(this.runtime.runtimeRoot, instanceId);
        try { this.instance = await this.runtime.createInstance(dirname(path)); break; }
        catch (error) { if (sanitized(error).code !== 'ownership-busy') throw error; }
      }
      if (!this.instance) fail('ownership-busy');
      const path = endpoint(this.runtime.runtimeRoot, instanceId);
      try { await lstat(path); fail('ownership-busy'); } catch (error) { if (!missing(error)) throw error; }
      // Runtime directories and the UDS are synthetic fixture resources in B3;
      // the native storage backend does not claim socket ACL security.
      await new Promise<void>((resolve, reject) => {
        const error = () => reject(sanitized(null));
        this.server.once('error', error);
        this.server.listen(path, () => { this.server.off('error', error); this.listening = true; resolve(); });
      });
      await chmod(path, 0o600);
      this.socketIdentity = await this.runtime.socket(path);
      const discovery: Discovery = { schema: 1, protocolVersion: PROTOCOL, authSetId: this.store.snapshot().authSetId,
        generation: this.generation, instance: instanceId, credentialLayout: 1 };
      // Stable discovery from a crash is not silently adopted or overwritten.
      this.discovery = await this.storage.publish(join(this.storage.storageRoot, 'discovery.json'), discovery, DISCOVERY_BYTES, 'discovery-write');
      this.ready = !this.stopped && !this.store.poisoned; return discovery;
    } catch (error) { this.failed = true; this.ready = false; this.destroyPeers(); throw sanitized(error); }
  }
  private accept(socket: Socket): void {
    socket.unref();
    if (!this.ready || !this.connections.take() || this.sockets.size >= this.limits.sockets || this.unauthenticated >= this.limits.unauthenticated) { socket.destroy(); return; }
    this.sockets.add(socket); this.unauthenticated++;
    let auth: AuthHello | undefined; let ack = false; let countedUnauthenticated = true;
    let session: { process: string; provider: string; seq: number } | undefined;
    let mapper: PiSessionMapper | undefined;
    let deadline = setTimeout(() => socket.destroy(), this.limits.authMs); deadline.unref();
    const reader = new Frames(socket, this.limits, this.global, () => ack ? this.limits.frameBytes : this.limits.authBytes, value => {
      if (socket.destroyed || !this.ready) fail('unauthorized');
      if (!auth) {
        const candidate = parseAuth(value);
        if (candidate.generation !== this.generation || !this.store.authenticate(candidate) || reader.pendingBytes !== 0) fail('unauthorized');
        const peers = this.targets.get(candidate.targetId) ?? new Set<Socket>();
        if (peers.size >= this.limits.perTarget) fail('limit-exceeded');
        auth = candidate; peers.add(socket); this.targets.set(candidate.targetId, peers);
        countedUnauthenticated = false; this.unauthenticated--;
        mapper = new PiSessionMapper({ namespace: `managed:${candidate.authSetId}:${candidate.targetId}`, publish: observation => {
          if (!socket.destroyed && this.ready && this.store.current(candidate.targetId, candidate.epoch)) {
            this.publish({ ...observation, revision: nextObservationRevision() });
          }
        } });
        sendFrame(socket, ackFor(candidate), this.limits, () => {
          if (socket.destroyed || !this.store.current(candidate.targetId, candidate.epoch)) { socket.destroy(); return; }
          ack = true; clearTimeout(deadline);
          deadline = setTimeout(() => socket.destroy(), this.limits.baselineMs); deadline.unref();
        });
        return;
      }
      if (!ack || !this.store.current(auth.targetId, auth.epoch)) fail('unauthorized');
      const event = parseEvent(value);
      if (!session) {
        if (event.type !== 'hello' || !['working', 'idle'].includes(event.status)) fail('malformed-frame');
        session = { process: event.processInstanceId, provider: event.providerSessionId, seq: 0 }; clearTimeout(deadline);
      } else if (event.type === 'hello') fail('malformed-frame');
      if (event.processInstanceId !== session.process || event.providerSessionId !== session.provider || event.seq <= session.seq) fail('malformed-frame');
      session.seq = event.seq; mapper!.handle(event);
    });
    socket.on('close', () => {
      clearTimeout(deadline); reader.close(); this.sockets.delete(socket);
      if (countedUnauthenticated) this.unauthenticated--;
      if (auth) { const peers = this.targets.get(auth.targetId); peers?.delete(socket); if (!peers?.size) this.targets.delete(auth.targetId); }
    });
  }
  private destroyPeers(): void { for (const socket of this.sockets) socket.destroy(); }
  stop(): Promise<void> { this.stopping ??= this.stopOnce(); return this.stopping; }
  private async stopOnce(): Promise<void> {
    this.stopped = true; this.ready = false; this.destroyPeers();
    let failure: unknown;
    const preserve = (error: unknown): void => { if (failure === undefined) failure = error; };
    // Startup may still be publishing a listener. Settle it before teardown,
    // but never let a startup failure skip the remaining teardown.
    if (this.starting) await this.starting.catch(() => { /* failed start is represented by this.failed */ });
    // Preserve baseline ordering: store close precedes socket identity/listener
    // teardown. Unlike baseline, retain the original error while still making
    // listener teardown mandatory when store close fails.
    try { await this.store.close(); } catch (error) { preserve(error); }
    let pathChanged = false;
    if (this.socketIdentity) {
      if (!(await this.runtime.unchanged(this.socketIdentity))) pathChanged = true;
    }
    if (this.listening) {
      await new Promise<void>(resolve => this.server.close(() => resolve())).catch(error => { preserve(error); });
      this.listening = false;
    }
    try { await this.storage.drain(); } catch (error) { preserve(error); }

    if (pathChanged) preserve(sanitized(null, 'path-changed'));
    // Non-claim runtime resources may be cleaned after fencing even on a poison
    // path, except when Node has already observed a substituted socket leaf;
    // preserve the discovery evidence for that explicit barrier.
    if (!pathChanged && this.discovery) {
      try {
        if (this.storage instanceof NodeFilesPort) await this.storage[REMOVE_AFTER_DRAIN](this.discovery, this.claim);
        else if (this.storage instanceof DarwinFilesPort) await this.storage.removeAfterDrain(this.discovery);
        else await this.storage.remove(this.discovery);
        this.discovery = undefined;
      } catch (error) { preserve(error); }
    }
    if (!pathChanged && this.instance) {
      try { await this.runtime.remove(this.instance); this.instance = undefined; }
      catch (error) { preserve(error); }
    }
    // Durable poison and failed-open barriers retain the owner claim. In
    // particular, releasing the backend here would permit work to outlive it.
    if (failure !== undefined || this.store.poisoned || this.failed) {
      this.failed = true;
      throw sanitized(failure, 'outcome-uncertain');
    }

    // Claim removal is checked and one-way. If a final directory sync reports
    // uncertainty after unlink, OwnerClaim records that the path is gone and
    // permits disposal without trying to recreate the deleted barrier.
    try { await this.claim.remove(); }
    catch (error) {
      try { await this.claim.close(); await this.storage.close(); }
      catch { /* retain the original claim-removal error; disposal is secondary */ }
      this.failed = true;
      throw sanitized(error);
    }
    try {
      await this.claim.close();
      await this.storage.close();
    } catch (error) {
      // The claim is already removed; never recreate it or claim that the
      // durable barrier survived a late lease/backend close failure.
      this.failed = true;
      throw sanitized(error);
    }
  }
}
