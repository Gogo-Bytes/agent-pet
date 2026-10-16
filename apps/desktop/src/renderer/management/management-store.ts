import { createSessionState, type SessionState } from '@agent-pet/domain';
import type { ConfigurationsState } from '../../shared/configurations.js';
import type { ManagementState } from '../../shared/preferences.js';

export type ManagementBridge = Window['management'];
export type ManagementSnapshot = { state: ManagementState | null; configurations: ConfigurationsState | null; sessions: SessionState; error: string };
/** One listener per IPC channel across all pages and Three.js. Initial replies never replace a newer push. */
export function createManagementStore(bridge: ManagementBridge) {
  let snapshot: ManagementSnapshot = { state: null, configurations: null, sessions: createSessionState(), error: '' };
  const listeners = new Set<() => void>();
  let generation = 0;
  let disconnect: (() => void) | undefined;
  let revisions = { state: 0, configurations: 0, sessions: 0 };
  function publish(patch: Partial<ManagementSnapshot>) { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); }
  async function request(current: number) {
    const before = { ...revisions };
    const responses = await Promise.allSettled([bridge.getState(), bridge.configurations.getState(), bridge.getSessions()]);
    if (current !== generation) return;
    const patch: Partial<ManagementSnapshot> = { error: '' };
    const keys = ['state', 'configurations', 'sessions'] as const;
    responses.forEach((response, index) => {
      const key = keys[index]!;
      if (response.status === 'fulfilled') {
        if (before[key] === revisions[key]) Object.assign(patch, { [key]: response.value });
      } else if (before[key] === revisions[key]) patch.error = '无法读取应用状态，请重新读取。';
    });
    publish(patch);
  }
  return {
    getSnapshot: () => snapshot,
    retry: () => request(generation),
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        const current = ++generation;
        revisions = { state: 0, configurations: 0, sessions: 0 };
        const offState = bridge.subscribe(state => { if (current === generation) { revisions.state++; publish({ state }); } });
        const offConfigs = bridge.configurations.subscribe(configurations => { if (current === generation) { revisions.configurations++; publish({ configurations }); } });
        const offSessions = bridge.subscribeSessions(sessions => { if (current === generation) { revisions.sessions++; publish({ sessions }); } });
        disconnect = () => { offState(); offConfigs(); offSessions(); };
        void Promise.resolve().then(() => { if (current === generation) return request(current); });
      }
      return () => { listeners.delete(listener); if (!listeners.size) { generation++; disconnect?.(); disconnect = undefined; } };
    },
  };
}
