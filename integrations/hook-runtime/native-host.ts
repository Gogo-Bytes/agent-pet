import { execFile } from 'node:child_process';
import { privatePath } from './private-activation.js';
export type NativeHostIdentity = { pid: number; ppid: number; uid: number; startSeconds: number; startMicroseconds: number; executable: string };
export type NativeHostProbe = (pid: number) => Promise<NativeHostIdentity | null>;
export const nativePid = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 0x7fffffff;
const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
export function validNativeIdentity(value: unknown, pid: number): value is NativeHostIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).sort().join(',') === 'executable,pid,ppid,startMicroseconds,startSeconds,uid' && v.pid === pid &&
    integer(v.ppid) && integer(v.uid) && integer(v.startSeconds) && Number(v.startSeconds) > 0 &&
    integer(v.startMicroseconds) && Number(v.startMicroseconds) < 1e6 && privatePath(v.executable);
}
export const sameHost = (a: NativeHostIdentity, b: NativeHostIdentity) => a.pid === b.pid && a.uid === b.uid &&
  a.startSeconds === b.startSeconds && a.startMicroseconds === b.startMicroseconds && a.executable === b.executable;
/** Reuses the existing exact-PID macOS metadata helper; never reads argv/env or enumerates processes. */
export function createNativeHostProbe(probePath: string, timeout = 250): NativeHostProbe {
  if (!privatePath(probePath)) throw new Error('Invalid native helper');
  return requested => new Promise(resolve => {
    if (process.platform !== 'darwin' || !nativePid(requested)) { resolve(null); return; }
    execFile(probePath, [String(requested)], { timeout, maxBuffer: 8192, env: {}, shell: false, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error || stderr) { resolve(null); return; }
      try { const value: unknown = JSON.parse(stdout); resolve(validNativeIdentity(value, requested) ? value : null); }
      catch { resolve(null); }
    });
  });
}
export async function checkedNativeProbe(probe: NativeHostProbe, requested: number): Promise<NativeHostIdentity | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([Promise.resolve().then(() => probe(requested)),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 250); })]);
    return validNativeIdentity(result, requested) && result.uid === process.getuid?.() ? { ...result } : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}
/** The supplied hook PID is a candidate, never trusted until the complete native ancestry is rechecked. */
export async function verifyNativeHost(options: { hookPid: number; executable: string; observerExecutable: string;
  probe: NativeHostProbe; active(): boolean }): Promise<NativeHostIdentity | null> {
  const chain: NativeHostIdentity[] = []; let current = options.hookPid, host: NativeHostIdentity | undefined;
  for (let depth = 0; depth < 16 && nativePid(current); depth++) {
    if (!options.active() || chain.some(item => item.pid === current)) return null;
    const item = await checkedNativeProbe(options.probe, current);
    if (!item || !options.active() || (depth === 0 && item.executable !== options.observerExecutable)) return null;
    chain.push(item);
    if (depth > 0 && item.executable === options.executable) { host = item; break; }
    current = item.ppid;
  }
  if (!host) return null;
  for (const item of chain) {
    if (!options.active()) return null;
    const check = await checkedNativeProbe(options.probe, item.pid);
    if (!check || !sameHost(item, check) || item.ppid !== check.ppid || !options.active()) return null;
  }
  return host;
}
