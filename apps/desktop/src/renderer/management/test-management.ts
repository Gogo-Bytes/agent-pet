import { vi } from 'vitest';
import { createSessionState, type SessionState } from '@agent-pet/domain';
import type { AgentConfiguration, ConfigurationsState, CreateConfiguration, PetBinding } from '../../shared/configurations.js';
import { defaultPreferences, type ManagementState, type PreferencePatch } from '../../shared/preferences.js';
import { initialPreflight, preflightBridge } from './test-preflight.js';
import { connectionBridge } from './test-connection.js';

export function configuration(id = 'pi-one', targetPath = '/isolated/project-one'): AgentConfiguration {
  return { id, name: `配置 ${id}`, provider: 'pi', targetPath, installation: null,
    pet: { assetId: 'starter', name: '团子' }, availability: 'available', inspection: null, connection: null };
}
/** Test-only typed bridge. No file, system preference, socket, or Agent operations. */
export function managementBridge(records: AgentConfiguration[] = [configuration()], supported = false) {
  let state: ManagementState = { preferences: { ...defaultPreferences, petName: '团子' }, preferenceError: null,
    login: { supported, enabled: false, error: null } };
  let configs: ConfigurationsState = { revision: 0, records, notice: 'none', busy: false, sessionConfigurations: {} };
  let sessions = createSessionState();
  const preferences = new Set<(state: ManagementState) => void>();
  const configurations = new Set<(state: ConfigurationsState) => void>();
  const observations = new Set<(state: SessionState) => void>();
  const offState = vi.fn(); const offConfigs = vi.fn(); const offSessions = vi.fn();
  function pushState(next: ManagementState) { state = next; preferences.forEach(listener => listener(next)); }
  function pushConfigs(next: ConfigurationsState) { configs = next; configurations.forEach(listener => listener(next)); }
  function changed(nextRecords = configs.records) { pushConfigs({ ...configs, records: nextRecords, revision: configs.revision + 1 }); return configs; }
  const bridge = {
    piPreflight: preflightBridge(), piConnection: connectionBridge(),
    locations: {
      choose: vi.fn(async (): Promise<string | null> => '/isolated/new-project'),
      authorize: vi.fn(async (path: string) => path),
      inspect: vi.fn(async (_path: string, _provider: string) => ({ target: initialPreflight.target, findings: [] })),
    },
    configurations: {
      getState: vi.fn(async () => configs),
      create: vi.fn(async (input: CreateConfiguration) => changed([...configs.records, { ...configuration('added', input.targetPath), ...input,
        availability: input.provider === 'pi' ? 'unchecked' as const : 'unsupported' as const, pet: null }])),
      rename: vi.fn(async (id: string, name: string) => changed(configs.records.map(record => record.id === id ? { ...record, name: name.trim() } : record))),
      changeTarget: vi.fn(async (id: string, path: string) => changed(configs.records.map(record => record.id === id ? { ...record, targetPath: path } : record))),
      bindPet: vi.fn(async (id: string, pet: PetBinding | null) => changed(configs.records.map(record => record.id === id ? { ...record, pet } : record))),
      inspect: vi.fn(async (_id: string) => changed()), preview: vi.fn(async (_id: string) => changed()),
      cancel: vi.fn(async (_id: string) => changed()), confirm: vi.fn(async (_id: string, _plan: string) => changed()),
      resume: vi.fn(async (_id: string) => changed()), disable: vi.fn(async (_id: string) => changed()),
      remove: vi.fn(async (id: string) => changed(configs.records.filter(record => record.id !== id))),
      subscribe: vi.fn((listener: (state: ConfigurationsState) => void) => { configurations.add(listener); return () => { configurations.delete(listener); offConfigs(); }; }),
    },
    getState: vi.fn(async () => state), getSessions: vi.fn(async () => sessions), openProject: vi.fn(async () => {}),
    updatePreferences: vi.fn(async (patch: PreferencePatch) => { pushState({ ...state, preferenceError: null, preferences: { ...state.preferences, ...patch } }); return state; }),
    setLogin: vi.fn(async (enabled: boolean) => { pushState({ ...state, login: { ...state.login, enabled } }); return state; }),
    subscribe: vi.fn((listener: (value: ManagementState) => void) => { preferences.add(listener); return () => { preferences.delete(listener); offState(); }; }),
    subscribeSessions: vi.fn((listener: (value: SessionState) => void) => { observations.add(listener); return () => { observations.delete(listener); offSessions(); }; }),
  } satisfies Window['management'];
  return { bridge, offState, offConfigs, offSessions, pushState, pushConfigs,
    state: () => state, configs: () => configs,
    pushSessions(next: SessionState) { sessions = next; observations.forEach(listener => listener(next)); },
    listenerCounts: () => [preferences.size, configurations.size, observations.size],
  };
}
