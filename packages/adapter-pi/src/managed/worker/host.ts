import { Worker, type MessagePort } from 'node:worker_threads';
import { randomBytes } from 'node:crypto';
import { MAX_PENDING, MAX_QUEUE, MAX_QUEUE_BYTES, WORKER_PROTOCOL, type ManagedWorkerError, type RequestBody, type ReplyBody, type WireEnvelope } from './protocol.js';
import { validateEnvelope, wireBytes } from './validation.js';

const id = (): string => randomBytes(16).toString('hex');
const transportError: ManagedWorkerError = { code: 'outcome-uncertain', effect: 'uncertain' };
type Pending = { requestId: string; body: RequestBody; bytes: number; resolve: (result: any) => void; reject: (error: ManagedWorkerError) => void; timer: ReturnType<typeof setTimeout> };
export type WorkerHostOptions = { roots: { storageRoot: string; runtimeRoot: string }; initialize: boolean; backend?: 'node-fixture' | 'darwin-addon'; timeoutMs?: number; onFailure?: (error: ManagedWorkerError) => void; worker?: Worker; testPauseMs?: number; testSmokeStages?: boolean };

/** B4.1 transport: one dispatched operation, bounded FIFO, terminal poison. */
export class WorkerHost {
  readonly generation = id();
  readonly #worker: Worker;
  readonly #timeout: number;
  readonly #onFailure: ((error: ManagedWorkerError) => void) | undefined;
  #sequence = 0;
  #workerSequence = 0;
  #failed = false;
  #stopped = false;
  #removeOwnerAcknowledged: { requestId: string; sequence: number } | undefined;
  #stoppedEvent = false;
  #queue: Pending[] = [];
  #queuedBytes = 0;
  #inFlight: Pending | undefined;
  #requests = new Map<string, Pending>();
  readonly initialized: Promise<{ type: 'initialized'; ownerCap: string }>;
  constructor(options: WorkerHostOptions) {
    this.#timeout = options.timeoutMs ?? 5000;
    this.#onFailure = options.onFailure;
    this.#worker = options.worker ?? new Worker(new URL('./entry.mjs', import.meta.url), {
      workerData: {
        workerGeneration: this.generation,
        ...(options.testPauseMs === undefined ? {} : { testPauseMs: options.testPauseMs }),
        ...(options.testSmokeStages === true ? { testSmokeStages: true } : {}),
      },
    });
    this.#worker.on('message', message => this.receive(message));
    this.#worker.on('error', () => this.poison());
    this.#worker.on('exit', code => {
      // A zero exit is clean only after remove-owner was acknowledged, the
      // Worker committed its terminal stopped event, and no work is stranded.
      // Unref is not a stop ack.
      const clean = this.#removeOwnerAcknowledged !== undefined && this.#stoppedEvent &&
        this.#queue.length === 0 && this.#inFlight === undefined && this.#requests.size === 0;
      if (code !== 0 || !clean) this.poison();
    });
    const init: RequestBody = { type: 'init', backend: options.backend ?? 'node-fixture', roots: options.roots, initialize: options.initialize };
    this.initialized = this.request<{ type: 'initialized'; ownerCap: string }>(init);
  }
  get failed(): boolean { return this.#failed; }
  private envelope(kind: 'request' | 'reply' | 'event', requestId: string, body: any): WireEnvelope {
    const envelope = { protocolVersion: WORKER_PROTOCOL, kind, workerGeneration: this.generation, sequence: ++this.#sequence, requestId, body } as WireEnvelope;
    wireBytes(envelope);
    return envelope;
  }
  request<T = any>(body: RequestBody): Promise<T> {
    if (this.#failed || this.#stopped) return Promise.reject(transportError);
    // remove-owner commits the Worker to terminal shutdown. Reject and fence
    // a caller that races that acknowledgement instead of queueing work the
    // stopped Worker cannot answer.
    if (this.#removeOwnerAcknowledged || this.#stoppedEvent) {
      this.poison();
      return Promise.reject(transportError);
    }
    const requestId = id();
    const envelope = { protocolVersion: WORKER_PROTOCOL, kind: 'request', workerGeneration: this.generation,
      sequence: this.#sequence + 1, requestId, body } as WireEnvelope;
    try { validateEnvelope(envelope); } catch { this.poison(); return Promise.reject(transportError); }
    const bytes = wireBytes(envelope);
    if (this.#queue.length >= MAX_QUEUE || this.#queuedBytes + bytes > MAX_QUEUE_BYTES || this.#requests.size >= MAX_PENDING) {
      this.poison(); return Promise.reject(transportError);
    }
    return new Promise<T>((resolve, reject) => {
      const pending: Pending = { requestId, body, bytes, resolve, reject, timer: setTimeout(() => this.timeout(pending), this.#timeout) };
      clearTimeout(pending.timer); // deadline starts when the request is dispatched, not while queued
      this.#queue.push(pending); this.#queuedBytes += bytes; this.#requests.set(pending.requestId, pending); this.pump();
    });
  }
  private pump(): void {
    if (this.#failed || this.#inFlight || !this.#queue.length) return;
    const pending = this.#queue.shift()!; this.#queuedBytes -= pending.bytes; this.#inFlight = pending;
    const envelope = this.envelope('request', pending.requestId, pending.body);
    pending.timer = setTimeout(() => this.timeout(pending), this.#timeout);
    try { this.#worker.postMessage(envelope); } catch { this.poison(); }
  }
  private timeout(pending: Pending): void { if (this.#inFlight === pending) this.poison(); }
  private receive(message: unknown): void {
    if (this.#failed) return;
    try { validateEnvelope(message); } catch { this.poison(); return; }
    const envelope = message as WireEnvelope;
    if (envelope.workerGeneration !== this.generation || envelope.sequence !== this.#workerSequence + 1) { this.poison(); return; }
    this.#workerSequence = envelope.sequence;
    if (envelope.kind === 'event') {
      const event = envelope.body as any;
      if (event.type === 'failed') this.poison(event.error);
      else if (event.type === 'stopped') {
        const acknowledged = this.#removeOwnerAcknowledged;
        // A terminal stopped event is meaningful only when it names the exact
        // remove-owner request that was acknowledged immediately beforehand.
        if (event.clean !== true || this.#stoppedEvent || !acknowledged || envelope.requestId !== acknowledged.requestId || envelope.sequence !== acknowledged.sequence + 1 ||
          this.#queue.length !== 0 || this.#inFlight !== undefined || this.#requests.size !== 0) {
          this.poison(); return;
        }
        this.#stoppedEvent = true;
      }
      return;
    }
    const pending = this.#requests.get(envelope.requestId);
    if (!pending || this.#inFlight !== pending || envelope.kind !== 'reply') { this.poison(); return; }
    clearTimeout(pending.timer);
    const body = envelope.body as ReplyBody;
    if (!body.ok && (body.error.effect === 'uncertain' || body.error.code === 'owner-unlink-committed')) { this.poison(body.error); return; }
    this.#requests.delete(pending.requestId); this.#inFlight = undefined;
    if (body.ok) {
      if (pending.body.type === 'remove-owner' && body.result.type === 'owner-removed') {
        this.#removeOwnerAcknowledged = { requestId: pending.requestId, sequence: envelope.sequence };
      }
      pending.resolve(body.result);
    } else pending.reject(body.error);
    // Do not dispatch work queued behind remove-owner. It can never be
    // acknowledged by a Worker that has committed terminal shutdown.
    if (this.#removeOwnerAcknowledged) {
      if (this.#queue.length !== 0 || this.#inFlight !== undefined || this.#requests.size !== 0) this.poison();
      return;
    }
    this.pump();
  }
  private poison(error: ManagedWorkerError = transportError): void {
    if (this.#failed) return;
    this.#failed = true;
    // Host callback is synchronous by contract, before any pending promise rejection.
    this.#onFailure?.(error);
    const pending = [...this.#requests.values()]; this.#queue = []; this.#requests.clear(); this.#inFlight = undefined; this.#queuedBytes = 0;
    for (const item of pending) { clearTimeout(item.timer); item.reject(error); }
  }
  /** No automatic termination: an uncertain Worker may still own backend resources. */
  async stop(): Promise<void> { this.#stopped = true; this.#worker.unref(); }
}
