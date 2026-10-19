import { randomUUID } from 'node:crypto';
import { startNativeReceiver } from '../hook-runtime/native-receiver.js';
import { privatePath } from '../hook-runtime/private-activation.js';
import { nativePid, checkedNativeProbe, createNativeHostProbe, sameHost, verifyNativeHost,
  type NativeHostIdentity, type NativeHostProbe } from '../hook-runtime/native-host.js';
import { validCodexHookFact } from './transport.js';
import type { CodexHookFact } from './normalize.js';
type Delivery = { schemaVersion: 1; hookPid: number; eventId: string; fact: CodexHookFact };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function parse(text: string): Delivery | null {
  let value: unknown; try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return Object.keys(v).sort().join(',') === 'eventId,fact,hookPid,schemaVersion' && v.schemaVersion === 1 &&
    nativePid(v.hookPid) && typeof v.eventId === 'string' && uuid.test(v.eventId) && validCodexHookFact(v.fact) &&
    v.fact.childId === undefined ? v as Delivery : null;
}
type Host = { identity: NativeHostIdentity; runId: string; sessions: Map<string, boolean>; seen: Set<string> };
/** Normal-start ingress. A verified native event proves observation, not CLI-window lifetime or task success. */
export async function startCodexNativePresence(options: {
  token: string; executable: string; observerExecutable: string; probePath: string;
  onFact(delivery: { runId: string; fact: CodexHookFact }): void;
  onRetire(runId: string): void;
  onChange?(state: { observedHosts: number; observedSessions: number }): void;
  /** Self-owned fixture boundary; application callers omit it. */
  probe?: NativeHostProbe;
}) {
  if (![options.executable, options.observerExecutable, options.probePath].every(privatePath) ||
      options.executable === options.observerExecutable || process.getuid?.() === undefined) throw new Error('Invalid Codex native configuration');
  const probe = options.probe ?? createNativeHostProbe(options.probePath);
  if (!options.probe) {
    // Warm only our own metadata helper. Observation checks remain bounded to 250ms.
    const warm = await createNativeHostProbe(options.probePath, 3000)(process.pid);
    if (!warm || warm.uid !== process.getuid?.()) throw new Error('Native helper unavailable');
  }
  const hosts = new Map<number, Host>(), retired = new Set<string>();
  let closed = false, polling = false, receiver: Awaited<ReturnType<typeof startNativeReceiver<Delivery>>>;
  const identityKey = (item: NativeHostIdentity) => `${item.pid}:${item.uid}:${item.startSeconds}:${item.startMicroseconds}:${item.executable}`;
  const call = (fn: () => unknown) => {
    try { void Promise.resolve(fn()).catch(() => { void stop(); }); return; }
    catch { /* Fail closed if the synchronous Main consumer is unavailable. */ }
    void stop();
  };
  const publish = () => call(() => options.onChange?.({ observedHosts: hosts.size,
    observedSessions: [...hosts.values()].reduce((count, host) => count + [...host.sessions.values()].filter(Boolean).length, 0) }));
  const retire = (host: Host) => {
    if (hosts.get(host.identity.pid) !== host) return;
    hosts.delete(host.identity.pid); retired.add(identityKey(host.identity));
    call(() => options.onRetire(host.runId));
  };
  receiver = await startNativeReceiver<Delivery>({ token: options.token, route: '/codex-native-presence', parse,
    accept: async (delivery, active) => {
      const available = () => active() && !closed;
      const identity = await verifyNativeHost({ hookPid: delivery.hookPid, executable: options.executable,
        observerExecutable: options.observerExecutable, probe, active: available });
      if (!identity || !available() || retired.has(identityKey(identity))) return false;
      let host = hosts.get(identity.pid);
      if (host && !sameHost(identity, host.identity)) { retire(host); publish(); return false; }
      if (!host) {
        if (delivery.fact.kind === 'session-ended' || hosts.size + retired.size >= 32) return false;
        host = { identity, runId: randomUUID(), sessions: new Map(), seen: new Set() }; hosts.set(identity.pid, host);
      }
      const id = delivery.fact.providerSessionId;
      if (host.sessions.get(id) === false) return false;
      if (!host.sessions.has(id)) {
        if (delivery.fact.kind === 'session-ended' || host.sessions.size >= 32) return false;
        host.sessions.set(id, true);
      }
      if (host.seen.has(delivery.eventId)) return true;
      if (host.seen.size >= 1024) { retire(host); publish(); return false; } // Saturation disconnects; no stale online baseline.
      host.seen.add(delivery.eventId);
      if (delivery.fact.kind === 'session-ended') host.sessions.set(id, false);
      call(() => options.onFact({ runId: host!.runId, fact: { ...delivery.fact } }));
      if (!available()) return false;
      publish(); return available();
    } });
  const interval = setInterval(() => {
    if (closed || polling) return; polling = true;
    void Promise.all([...hosts.values()].map(async host => {
      const checked = await checkedNativeProbe(probe, host.identity.pid);
      if (closed || hosts.get(host.identity.pid) !== host) return;
      if (!checked || !sameHost(checked, host.identity)) { retire(host); publish(); }
    })).finally(() => { polling = false; });
  }, 1000); interval.unref();
  let stopping: Promise<void> | undefined;
  function stop(): Promise<void> {
    if (stopping) return stopping;
    closed = true; clearInterval(interval);
    // Promise precedes callbacks so consumer reentry cannot start duplicate shutdown.
    let done!: () => void; stopping = new Promise<void>(resolve => { done = resolve; });
    for (const host of [...hosts.values()]) retire(host);
    publish(); void receiver.stop().then(done, done); return stopping;
  }
  return { url: receiver.url, stop };
}
