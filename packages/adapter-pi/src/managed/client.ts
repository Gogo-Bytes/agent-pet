import net from 'node:net';
import { lstat } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PrivateFiles } from './private-files.js';
import { NodeFilesPort } from './node-files-port.js';
import { DarwinFilesReader } from './darwin-files-port.js';
import { sameIdentity, type FilesystemPolicy, type Roots } from './path-policy.js';
import { CREDENTIAL_BYTES, credentialPath, parseCredential, parseRegistry, STORE_BYTES } from './auth-store.js';
import { endpoint, readDiscovery } from './discovery.js';
import { readValue, type FilesReader } from './files-port.js';
import { fail, sanitized } from './errors.js';
import { Frames, frameBudget, lowerLimits, sendFrame, type Limits } from './frames.js';
import { matchesAck, parseEvent, PROTOCOL, validId, type AuthHello, type ManagedSessionEvent } from './protocol.js';

export type ClientOptions = { roots: Roots; authSetId: string; targetId: string };
export type ManagedClient = { send(event: ManagedSessionEvent): void; close(): void; readonly closed: boolean };
type InternalClientOptions = ClientOptions & { policy?: FilesystemPolicy; limits?: Partial<Limits>; reader?: FilesReader;
  socketCheck?: (path: string) => Promise<{ identity: Stats }> };
/** One attempt. Every call rereads authority, discovery and credentials; no offline queue or retry timer. */
export async function connectManagedCore(options: InternalClientOptions): Promise<ManagedClient> {
  let socket: net.Socket | undefined;
  try {
    let reader: FilesReader;
    let socketCheck = options.socketCheck;
    if (options.reader) reader = options.reader;
    else {
      if (!options.policy) fail('acl-unverified');
      const scope = await options.policy.openRoots(options.roots);
      const node = new PrivateFiles(scope);
      reader = new NodeFilesPort(node);
      socketCheck ??= path => node.socket(path, 'socket-connect');
    }
    if (!validId(options.authSetId) || !validId(options.targetId)) fail('unauthorized');
    const limits = lowerLimits(options.limits);
    const discovery = await readDiscovery(reader, options.authSetId);
    const registry = await readValue(reader, join(reader.storageRoot, 'authorization.json'), STORE_BYTES, 'authority-read', parseRegistry);
    const target = registry.targets.find(t => t.targetId === options.targetId);
    if (registry.authSetId !== options.authSetId || !target || target.state !== 'enabled') fail('unauthorized');
    const credential = await readValue(reader, credentialPath(reader.storageRoot, target.targetId, target.epoch), CREDENTIAL_BYTES, 'credential-read', value =>
      parseCredential(value, options.authSetId, options.targetId));
    if (credential.epoch !== target.epoch || createHash('sha256').update(Buffer.from(credential.token, 'hex')).digest('hex') !== target.digest) fail('unauthorized');
    const path = endpoint(options.roots.runtimeRoot, discovery.instance);
    if (!socketCheck) fail('unsupported-platform');
    const checkedSocket = await socketCheck(path); // MUST precede even the first token byte.
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
        void socketCheck!(path).then(current => {
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

/** Internal B3-only native client factory. The reader is read-only and never claims writer.lock. */
export async function connectNativeManagedCore(options: ClientOptions & { limits?: Partial<Limits> }): Promise<ManagedClient> {
  if (process.platform !== 'darwin') return fail('unsupported-platform');
  const reader = await DarwinFilesReader.open(options.roots.storageRoot);
  try {
    const result = await connectManagedCore({ ...options, reader,
      socketCheck: async path => {
        const identity = await lstat(path);
        if (!identity.isSocket() || identity.uid !== process.getuid?.() || (identity.mode & 0o7777) !== 0o600) fail('unsafe-mode');
        return { identity };
      } });
    reader.close();
    return result;
  } catch (error) {
    reader.close();
    throw sanitized(error);
  }
}
