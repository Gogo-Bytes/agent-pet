import type { Socket } from 'node:net';
import { fail } from './errors.js';

export const LIMITS = Object.freeze({
  sockets: 64, unauthenticated: 16, perTarget: 8, authMs: 3000, baselineMs: 3000,
  authBytes: 2048, frameBytes: 65536, retainedBytes: 131072, globalRetainedBytes: 8388608,
  outboundBytes: 65536, connectionsPerSecond: 32, connectionBurst: 64,
  framesPerSecond: 32, frameBurst: 64, globalFramesPerSecond: 1024, globalFrameBurst: 2048,
  bytesPerSecond: 262144, byteBurst: 524288, globalBytesPerSecond: 8388608, globalByteBurst: 16777216,
  framesPerTurn: 16,
});
export type Limits = { -readonly [K in keyof typeof LIMITS]: number };
export function lowerLimits(overrides: Partial<Limits> = {}): Limits {
  const limits: Limits = { ...LIMITS };
  for (const key of Object.keys(overrides) as (keyof Limits)[]) {
    const value = overrides[key]!;
    if (!Object.hasOwn(LIMITS, key) || !Number.isSafeInteger(value) || value < 1 || value > LIMITS[key]) fail('limit-exceeded');
    limits[key] = value;
  }
  return limits;
}
export class Bucket {
  private tokens: number; private last = performance.now();
  constructor(private readonly rate: number, private readonly burst: number) { this.tokens = burst; }
  take(amount = 1, now = performance.now()): boolean {
    this.tokens = Math.min(this.burst, this.tokens + Math.max(0, now - this.last) * this.rate / 1000); this.last = now;
    if (amount > this.tokens) return false;
    this.tokens -= amount; return true;
  }
}
export type FrameBudget = { retained: number; frames: Bucket; bytes: Bucket };
export function frameBudget(limits: Limits): FrameBudget {
  return { retained: 0, frames: new Bucket(limits.globalFramesPerSecond, limits.globalFrameBurst), bytes: new Bucket(limits.globalBytesPerSecond, limits.globalByteBurst) };
}
/** Bounded NDJSON queue. Parsing work yields after a fixed number of frames. */
export class Frames {
  private buffer = Buffer.alloc(0);
  private immediate: NodeJS.Immediate | undefined;
  private closed = false;
  private readonly frames: Bucket;
  private readonly bytes: Bucket;
  constructor(private readonly socket: Socket, private readonly limits: Limits,
    private readonly global: FrameBudget, private readonly maximum: () => number,
    private readonly receive: (value: unknown) => void) {
    this.frames = new Bucket(limits.framesPerSecond, limits.frameBurst);
    this.bytes = new Bucket(limits.bytesPerSecond, limits.byteBurst);
    socket.on('data', chunk => {
      if (this.closed) return;
      try {
        const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (!this.bytes.take(input.length) || !global.bytes.take(input.length)) fail('rate-limited');
        // Drain queued complete frames before deciding whether the incoming chunk fits.
        if (!this.immediate) this.drain();
        if (this.buffer.length + input.length > limits.retainedBytes || global.retained + input.length > limits.globalRetainedBytes) fail('limit-exceeded');
        this.buffer = Buffer.concat([this.buffer, input]); global.retained += input.length;
        if (!this.immediate) this.drain();
      } catch { socket.destroy(); this.close(); }
    });
    socket.on('close', () => this.close());
    socket.on('error', () => { socket.destroy(); this.close(); });
  }
  get pendingBytes(): number { return this.buffer.length; }
  private drain(): void {
    if (this.closed) return;
    try {
      for (let work = 0; work < this.limits.framesPerTurn && !this.socket.destroyed; work++) {
        const newline = this.buffer.indexOf(10);
        if (newline < 0) {
          if (this.buffer.length > this.maximum()) fail('frame-too-large');
          return;
        }
        if (newline > this.maximum()) fail('frame-too-large');
        if (!this.frames.take() || !this.global.frames.take()) fail('rate-limited');
        const line = this.buffer.subarray(0, newline);
        this.buffer = Buffer.from(this.buffer.subarray(newline + 1)); this.global.retained -= newline + 1;
        const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line));
        this.receive(value);
      }
      if (this.buffer.length && !this.socket.destroyed) {
        this.immediate = setImmediate(() => { this.immediate = undefined; this.drain(); });
        this.immediate.unref();
      }
    } catch { this.socket.destroy(); this.close(); }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; clearImmediate(this.immediate);
    this.global.retained -= this.buffer.length; this.buffer = Buffer.alloc(0);
  }
}
export function sendFrame(socket: Socket, value: unknown, limits: Limits, done?: () => void): void {
  const line = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(line) > limits.frameBytes || socket.writableLength + Buffer.byteLength(line) > limits.outboundBytes || socket.destroyed) fail('backpressure');
  socket.write(line, error => { if (error) socket.destroy(); else done?.(); });
}
