import type { SessionObservation } from '../../packages/domain/src/index.js';
import { createCodexObservations } from './observations.js';
import { startCodexHookReceiver } from './transport.js';
/** Composition seam for Main. The host must independently verify run ownership and liveness.
 * No launch, persistent configuration, process scanning or presence guessing is performed here.
 */
export async function startCodexObservationBridge(options: {
  token: string; acceptRun(runId: string): boolean; name(): string;
  publish(observation: SessionObservation): void;
}) {
  const observations = createCodexObservations(options);
  let receiver: Awaited<ReturnType<typeof startCodexHookReceiver>>;
  try {
    receiver = await startCodexHookReceiver({ token: options.token, acceptRun: options.acceptRun,
      onFact: delivery => { observations.accept(delivery); } });
  } catch (error) { observations.stop(); throw error; }
  let stopped = false, closing: Promise<void> | undefined;
  return {
    url: receiver.url,
    retire(runId: string) { if (!stopped) observations.retire(runId); },
    stop(): Promise<void> {
      if (closing) return closing;
      stopped = true;
      // Close the network gate synchronously before publishing final disconnections.
      const closed = receiver.stop();
      closing = closed;
      observations.stop();
      return closing;
    },
  };
}
