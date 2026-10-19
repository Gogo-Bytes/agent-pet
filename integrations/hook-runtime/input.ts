import type { Readable } from 'node:stream';

export function readHookInput(input: Readable, maxBytes: number): Promise<string | undefined> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    let size = 0, settled = false;
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.pause();
      input.off('data', data); input.off('end', end); input.off('error', error); input.off('close', close);
      // An I/O error can already be queued when size/time limits settle. Keep a
      // silent guard until destroying our owned stream has actually closed it.
      const ignoreError = () => {};
      const closed = () => {
        clearImmediate(afterPendingEvents);
        input.off('error', ignoreError); input.off('close', closed);
      };
      // `closed` can become true before its queued error/close events fire.
      // An already-closed stream may never emit another close, so defer that
      // cleanup until Node has drained those pending events.
      const afterPendingEvents = setImmediate(() => { if (input.closed) closed(); });
      input.on('error', ignoreError);
      input.once('close', closed);
      input.destroy();
      const message = accepted ? Buffer.concat(chunks).toString('utf8') : undefined;
      chunks.length = 0;
      resolve(message);
    };
    const data = (chunk: unknown) => {
      if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string') { finish(false); return; }
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > maxBytes) finish(false);
      else chunks.push(bytes);
    };
    const end = () => finish(true), error = () => finish(false), close = () => finish(false);
    // Bound incomplete stdin independently of the sender's network deadline.
    const timer = setTimeout(() => finish(false), 1000);
    if (input.destroyed || input.readableEnded) { finish(false); return; }
    input.on('data', data); input.once('end', end); input.once('error', error); input.once('close', close);
  });
}
