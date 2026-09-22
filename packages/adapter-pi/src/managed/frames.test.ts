import { expect, test } from 'vitest';
import { Bucket, frameBudget, Frames, LIMITS, lowerLimits, sendFrame } from './frames.js';
import { admitted, authentication, baseline, enabled, lifecycle, opened, raw, wire } from './test-helpers.js';

for (const kind of ['auth', 'baseline'] as const) test(`absolute ${kind} deadline rejects slow peers without liveness reset`, async () => {
  const f = await opened({ limits: { authMs: 300, baselineMs: 300 } });
  const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  const peer = kind === 'auth' ? await raw(a.path) : await admitted(a.auth, a.path);
  const trickle = setInterval(() => peer.socket.write(' '), 5);
  try { await peer.closed; } finally { clearInterval(trickle); }
  expect(peer.socket.destroyed).toBe(true);
});
test('authenticated idle baseline has no inactivity timeout', async () => {
  let published = 0; const f = await opened({ limits: { authMs: 300, baselineMs: 300 }, publish() { published++; } });
  const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  const peer = await admitted(a.auth, a.path); peer.socket.write(wire(baseline()));
  await expect.poll(() => published).toBe(1);
  await new Promise(resolve => setTimeout(resolve, 600));
  expect(peer.socket.destroyed).toBe(false);
});
for (const kind of ['sockets', 'unauthenticated', 'perTarget'] as const) test(`real sockets enforce ${kind} admission cap`, async () => {
  const f = await opened({ limits: { [kind]: 1 } }); const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  const first = kind === 'unauthenticated' ? await raw(a.path) : await admitted(a.auth, a.path);
  if (kind !== 'unauthenticated') first.socket.write(wire(baseline()));
  const second = await raw(a.path); second.socket.write(wire(a.auth)); await second.closed;
  expect(first.socket.destroyed).toBe(false);
});
test('connection token bucket limits new sockets globally', async () => {
  const f = await opened({ limits: { connectionsPerSecond: 1, connectionBurst: 1 } });
  const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  const first = await admitted(a.auth, a.path); first.socket.write(wire(baseline()));
  const second = await raw(a.path); await second.closed; expect(first.socket.destroyed).toBe(false);
});
for (const auth of [true, false]) test(`${auth ? 'auth' : 'event'} oversized incomplete frame rejected without newline`, async () => {
  const f = await opened(); const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  const peer = auth ? await raw(a.path) : await admitted(a.auth, a.path);
  peer.socket.write('x'.repeat((auth ? LIMITS.authBytes : LIMITS.frameBytes) + 1)); await peer.closed;
});
for (const dimension of ['frameBurst', 'globalFrameBurst', 'byteBurst', 'globalByteBurst', 'retainedBytes', 'globalRetainedBytes', 'outboundBytes'] as const) {
  test(`real transport enforces ${dimension}`, async () => {
    const f = await opened({ limits: { framesPerSecond: 1, globalFramesPerSecond: 1, [dimension]: dimension.includes('Frame') || dimension === 'frameBurst' ? 2 : dimension === 'outboundBytes' ? 64 : 1024 } });
    const target = await enabled(f.service); const a = await authentication(f, target.targetId);
    if (dimension === 'outboundBytes') {
      const peer = await raw(a.path); peer.socket.write(wire(a.auth)); await peer.closed;
    } else {
      const peer = await admitted(a.auth, a.path);
      peer.socket.write(wire(baseline()));
      if (dimension === 'frameBurst' || dimension === 'globalFrameBurst') peer.socket.write(wire(lifecycle(2)) + wire(lifecycle(3)));
      else peer.socket.write('x'.repeat(1025));
      await peer.closed;
    }
  });
}
test('aggregate global retention counts incomplete lines on separate sockets and releases on close', async () => {
  const f = await opened({ limits: { globalRetainedBytes: 100 } }); const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  const first = await raw(a.path); first.socket.write(' '.repeat(60));
  const second = await raw(a.path); second.socket.write(' '.repeat(60)); await second.closed;
  expect(first.socket.destroyed).toBe(false);
  first.socket.destroy(); await first.closed;
  const third = await raw(a.path); third.socket.write(' '.repeat(60));
  await new Promise(resolve => setImmediate(resolve)); expect(third.socket.destroyed).toBe(false);
});
test('coalesced complete frames yield in bounded batches; split multibyte UTF8 remains intact', async () => {
  const output: unknown[] = []; const f = await opened({ limits: { framesPerTurn: 2 }, publish: o => output.push(o) });
  const target = await enabled(f.service); const a = await authentication(f, target.targetId); const peer = await admitted(a.auth, a.path);
  const bytes = Buffer.from(wire({ ...baseline(), sessionName: '界' }));
  const offset = bytes.indexOf(Buffer.from('界')) + 1;
  peer.socket.write(bytes.subarray(0, offset)); await new Promise(resolve => setImmediate(resolve)); peer.socket.write(bytes.subarray(offset));
  await expect.poll(() => output.length).toBe(1);
  peer.socket.write(Array.from({ length: 20 }, (_, n) => wire(lifecycle(n + 2))).join(''));
  await expect.poll(() => output.length).toBe(21);
  expect(output[0]).toMatchObject({ agentName: '界' });
});
test('real socket output queue refuses excess bytes even while corked (deterministic slow-reader pressure)', async () => {
  const f = await opened(); const target = await enabled(f.service); const a = await authentication(f, target.targetId);
  const peer = await raw(a.path); const limits = lowerLimits({ outboundBytes: 256 });
  peer.socket.cork();
  try {
    sendFrame(peer.socket, { data: 'x'.repeat(200) }, limits);
    expect(() => sendFrame(peer.socket, { data: 'y'.repeat(200) }, limits)).toThrow('backpressure');
    expect(peer.socket.writableLength).toBeLessThanOrEqual(256);
  } finally { peer.socket.destroy(); }
});
test('limits only decrease; token bucket refills without unbounded accumulation', () => {
  expect(() => lowerLimits({ sockets: 65 })).toThrow('limit-exceeded');
  expect(() => lowerLimits({ framesPerTurn: 0 })).toThrow('limit-exceeded');
  const bucket = new Bucket(2, 2); const now = performance.now();
  expect(bucket.take(2, now)).toBe(true); expect(bucket.take(1, now)).toBe(false);
  expect(bucket.take(1, now + 500)).toBe(true); expect(bucket.take(3, now + 100000)).toBe(false);
});
