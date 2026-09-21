import { createSessionState, type SessionState } from '@agent-pet/domain';
import type { OverlayLayout } from '../../../shared/overlay-layout.js';

export type PetBridge = Window['pet'];
type Snapshot = { sessions: SessionState; layout: OverlayLayout | null; error: string };

// One IPC listener pair, regardless of how many React/scene consumers subscribe.
// getSnapshot returns the same object until an actual bridge update arrives.
export function createPetStore(bridge: PetBridge) {
  let snapshot: Snapshot = { sessions: createSessionState(), layout: null, error: '' };
  const listeners = new Set<() => void>();
  let disconnect: (() => void) | undefined;
  let generation = 0;
  function publish(next: Snapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }
  return {
    bridge,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      const registration = () => listener();
      listeners.add(registration);
      if (listeners.size === 1) {
        const current = ++generation;
        let receivedSnapshot = false;
        const offSnapshot = bridge.subscribeSnapshot(sessions => {
          if (current !== generation) return;
          receivedSnapshot = true;
          if (sessions !== snapshot.sessions || snapshot.error) publish({ ...snapshot, sessions, error: '' });
        });
        const offLayout = bridge.subscribeLayout(layout => {
          if (current === generation && layout !== snapshot.layout) publish({ ...snapshot, layout });
        });
        disconnect = () => { offSnapshot(); offLayout(); };
        // StrictMode's synchronous teardown cancels its first request. Both IPC
        // subscriptions exist before requesting, even if the reply is synchronous.
        void Promise.resolve().then(async () => {
          if (current !== generation) return;
          try {
            await bridge.requestSnapshot();
          } catch {
            // An old/rejected initial request must not overwrite a newer push.
            if (current === generation && !receivedSnapshot) {
              publish({ ...snapshot, error: '无法获取 Session 状态，请重新打开窗口。' });
            }
          }
        });
      }
      return () => {
        listeners.delete(registration);
        if (listeners.size === 0 && disconnect) {
          ++generation;
          disconnect();
          disconnect = undefined;
        }
      };
    },
  };
}
export type PetStore = ReturnType<typeof createPetStore>;
