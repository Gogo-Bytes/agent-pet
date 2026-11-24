import { randomBytes } from 'node:crypto';
import type { SessionObservation } from '../../packages/domain/src/index.js';
import { createCodexObservations } from './observations.js';
import { startCodexNativePresence } from './native-presence.js';
import type { NativeHostProbe } from '../hook-runtime/native-host.js';
/** Main composition boundary. Caller persists activation with its private ownership/receipt store.
 * No Codex installation, Agent launch, TOML edit, hook trust or Renderer filesystem access.
 */
export async function startCodexNormalBridge(options: {
  configurationId: string; executable: string; standaloneExecutable?: string | undefined; observerExecutable: string; probePath: string;
  name(): string; publish(observation: SessionObservation): void;
  onChange?(state: { observedHosts: number; observedSessions: number }): void;
  probe?: NativeHostProbe;
}) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options.configurationId))
    throw new Error('Invalid Codex configuration identity');
  const token = randomBytes(32).toString('hex');
  // Ingress owns host admission and replay checks. Keep session state only for its live runs.
  const live = new Map<string, ReturnType<typeof createCodexObservations>>();
  const presence = await startCodexNativePresence({ ...options, token,
    onFact: ({ runId, fact }) => {
      let observations = live.get(runId);
      if (!observations) {
        observations = createCodexObservations(options); live.set(runId, observations);
      }
      if (fact.kind !== 'session-ended') observations.admitVerifiedSession(runId, fact.providerSessionId, fact.turnId);
      observations.accept({ runId, fact });
    },
    onRetire: runId => {
      const observations = live.get(runId);
      live.delete(runId); observations?.stop();
    } });
  const activation = JSON.stringify({ schemaVersion: 1, provider: 'codex', configurationId: options.configurationId,
    executable: options.executable, observerExecutable: options.observerExecutable, url: presence.url, token }) + '\n';
  if (Buffer.byteLength(activation) > 8192) { await presence.stop(); throw new Error('Codex activation too large'); }
  return {
    // Secret stays Main-private. Never put this string in a renderer state or diagnostic.
    activation,
    stop: presence.stop,
  };
}
