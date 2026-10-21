import { createSessionState, type SessionState } from '@agent-pet/domain';
import type { ConfigurationsState } from '../../shared/configurations.js';
import type { ManagementState } from '../../shared/preferences.js';
import type { PetAssetsApi, PetAssetsState } from '../../shared/pet-assets.js';

export type ManagementBridge = Omit<Window['management'], 'petAssets'> & { petAssets?: PetAssetsApi };
export type ManagementSnapshot = { state: ManagementState | null; configurations: ConfigurationsState | null; petAssets: PetAssetsState | null; sessions: SessionState; error: string };
/** One listener per IPC channel across all pages and Three.js. Initial replies never replace a newer push. */
export function createManagementStore(bridge: ManagementBridge) {
  const petAssets: PetAssetsApi = bridge.petAssets ?? { getState: async () => ({ version: 1, records: [] }), getModel: async () => null, getAvatar: async () => null, choose: async () => ({ ok: false, reason: 'not-supported' }), confirm: async () => ({ version: 1, records: [] }), cancel: async () => {}, subscribe: () => () => {} };
  let snapshot: ManagementSnapshot = { state: null, configurations: null, petAssets: null, sessions: createSessionState(), error: '' };
  const listeners = new Set<() => void>();
  let generation = 0;
  let disconnect: (() => void) | undefined;
  let revisions = { state: 0, configurations: 0, petAssets: 0, sessions: 0 };
  function publish(patch: Partial<ManagementSnapshot>) { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); }
  async function request(current: number) {
    const before = { ...revisions };
    const requests = bridge.petAssets ? [bridge.getState(), bridge.configurations.getState(), petAssets.getState(), bridge.getSessions()] : [bridge.getState(), bridge.configurations.getState(), bridge.getSessions()];
    const responses = await Promise.allSettled(requests);
    if (current !== generation) return;
    const patch: Partial<ManagementSnapshot> = { error: '' };
    const keys = bridge.petAssets ? ['state', 'configurations', 'petAssets', 'sessions'] as const : ['state', 'configurations', 'sessions'] as const;
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
        revisions = { state: 0, configurations: 0, petAssets: 0, sessions: 0 };
        const offState = bridge.subscribe(state => { if (current === generation) { revisions.state++; publish({ state }); } });
        const offConfigs = bridge.configurations.subscribe(configurations => { if (current === generation) { revisions.configurations++; publish({ configurations }); } });
        const offPetAssets = petAssets.subscribe(value => { if (current === generation) { revisions.petAssets++; publish({ petAssets: value }); } });
        const offSessions = bridge.subscribeSessions(sessions => { if (current === generation) { revisions.sessions++; publish({ sessions }); } });
        disconnect = () => { offState(); offConfigs(); offPetAssets(); offSessions(); };
        void Promise.resolve().then(() => { if (current === generation) return request(current); });
      }
      return () => { listeners.delete(listener); if (!listeners.size) { generation++; disconnect?.(); disconnect = undefined; } };
    },
  };
}
