import net from 'node:net';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PrivateFiles } from './private-files.js';
import { NodeFilesPort } from './node-files-port.js';
import { sameIdentity, type FilesystemPolicy, type Roots } from './path-policy.js';
import { CREDENTIAL_BYTES, credentialPath, parseCredential, parseRegistry, STORE_BYTES } from './auth-store.js';
import { endpoint, readDiscovery } from './discovery.js';
import { readValue } from './files-port.js';
import { fail, sanitized } from './errors.js';
import { Frames, frameBudget, lowerLimits, sendFrame, type Limits } from './frames.js';
import { matchesAck, parseEvent, PROTOCOL, validId, type AuthHello, type ManagedSessionEvent } from './protocol.js';

export type ClientOptions = { roots: Roots; authSetId: string; targetId: string };
export type ManagedClient = { send(event: ManagedSessionEvent): void; close(): void; readonly closed: boolean };
/** One attempt. Every call rereads authority, discovery and credentials; no offline queue or retry timer. */
export async function connectManagedCore(options: ClientOptions & { policy: FilesystemPolicy; limits?: Partial<Limits> }): Promise<ManagedClient> {
  let socket: net.Socket | undefined;
  try {
    const scope = await options.policy.openRoots(options.roots);
    const files = new PrivateFiles(scope);
    const storage = new NodeFilesPort(files);
    if (!validId(options.authSetId) || !validId(options.targetId)) fail('unauthorized');
    const limits = lowerLimits(options.limits);
    const discovery = await readDiscovery(storage, options.authSetId);
    const registry = await readValue(storage, join(scope.roots.storageRoot, 'authorization.json'), STORE_BYTES, 'authority-read', parseRegistry);
    const target = registry.targets.find(t => t.targetId === options.targetId);
    if (registry.authSetId !== options.authSetId || !target || target.state !== 'enabled') fail('unauthorized');
    const credential = await readValue(storage, credentialPath(scope.roots.storageRoot, target.targetId, target.epoch), CREDENTIAL_BYTES, 'credential-read', value =>
      parseCredential(value, options.authSetId, options.targetId));
    if (credential.epoch !== target.epoch || createHash('sha256').update(Buffer.from(credential.token, 'hex')).digest('hex') !== target.digest) fail('unauthorized');
    const path = endpoint(scope.roots.runtimeRoot, discovery.instance);
    const checkedSocket = await files.socket(path, 'socket-connect'); // MUST precede even the first token byte.
    const auth: AuthHello = { type: 'auth', protocolVersion: PROTOCOL, authSetId: options.authSetId,
      targetId: options.targetId, epoch: credential.epoch, generation: discovery.generation, token: credential.token };
    const peer = net.createConnection(path); socket = peer; peer.unref();
    await new Promise<void>((resolve, reject) => {
      let admitted = false;
      const timer = setTimeout(() => { peer.destroy(); reject(sanitized(null, 'handshake-timeout')); }, limits.authMs); timer.unref();
      const rejectClosed = () => { clearTimeout(timer); if (!admitted) reject(sanitized(null, 'unauthorized')); };
      peer.once('close', rejectClosed);
      peer.once('error', () => { peer.destroy(); rejectClosed(); });
      new Frames(peer, limits, frameBudget(limits), () => limits.authBytes, ack => {
        if (admitted || !matchesAck(ack, auth)) { peer.destroy(); return; }
        admitted = true; clearTimeout(timer); resolve();
      });
      peer.once('connect', () => {
        void files.socket(path, 'socket-connect').then(current => {
          if (!sameIdentity(checkedSocket.identity, current.identity)) fail('path-changed');
          if (!peer.destroyed) sendFrame(peer, auth, limits);
        }).catch(() => peer.destroy());
      });
    });
    if (peer.destroyed) fail('unauthorized');
    return { get closed() { return peer.destroyed; },
      send(event) { try { sendFrame(peer, parseEvent(event), limits); } catch (error) { peer.destroy(); throw sanitized(error); } },
      close() { peer.destroy(); },
    };
  } catch (error) { socket?.destroy(); throw sanitized(error); }
}
