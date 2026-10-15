import { createSessionState, applyObservation, type SessionState } from '@agent-pet/domain';
import type { ManagementBridge } from '../management/management-store.js';
import { defaultPreferences, type ManagementState } from '../../shared/preferences.js';
import type { ConfigurationsState, ConfigurationMetadata } from '../../shared/configurations.js';
import type { PreflightState } from '../../shared/pi-preflight.js';
import type { PiConnectionState } from '../../shared/pi-connection.js';

const base: PiConnectionState = { revision: 0, status: 'not-configured', mode: 'desktop', busy: false, canConfigure: true, preview: null, deployedPath: null, canRemove: false, canResume: false, receiving: 'stopped', saved: 'none', notice: 'none' };
export function createReviewBridge(scenario: string): ManagementBridge {
  let state: ManagementState = { preferences: { ...defaultPreferences }, preferenceError: null, login: { supported: false, enabled: false, error: null } };
  let configs: ConfigurationsState = { revision: 0, records: [], notice: 'none', busy: false, sessionConfigurations: {} };
  let sessions: SessionState = createSessionState();
  const stateListeners = new Set<(value: ManagementState) => void>();
  const configListeners = new Set<(value: ConfigurationsState) => void>();
  const sessionListeners = new Set<(value: SessionState) => void>();
  const paths = scenario === 'detail-long-path' ? [`/test/AgentPet/${'a-very-long-project-directory/'.repeat(12)}pi-config`] : scenario === 'scan-saved' ? ['/test/AgentPet/default'] : ['/test/AgentPet/personal', '/test/AgentPet/project'];
  if (scenario !== 'empty' && scenario !== 'scan-new') paths.forEach((path, index) => {
    const id = `review-${index}`;
    const record: ConfigurationMetadata = { id, name: scenario === 'scan-saved' ? 'pi 默认配置' : index === 0 ? '个人配置' : '一个用于验证窄窗口的很长很长的项目配置名称', provider: 'pi', targetPath: path, installation: null, pet: { assetId: 'starter', name: index ? '项目小伙伴' : '小伙伴' } };
    configs.records.push({ ...record, availability: 'available', inspection: { target: { path, source: 'chosen' }, findings: [] }, connection: { ...base, status: 'connected', receiving: 'active', saved: 'ready', canConfigure: false, canRemove: true, deployedPath: `${path}/extensions/agent-pet.ts` } });
    const sessionId = `${id}:pi:process:session`; configs.sessionConfigurations[sessionId] = id;
    sessions = applyObservation(sessions, { provider: 'pi', sessionId, status: index ? 'completed' : 'working', observedAt: '2026-10-14T00:00:00Z', agentName: record.name });
  });
  if (scenario === 'detail-error') configs.records = configs.records.map(record => ({ ...record, availability: 'attention',
    inspection: { target: { path: record.targetPath, source: 'chosen' }, findings: ['unreadable'] },
    connection: { ...base, status: 'failed', notice: 'preview-failed' } }));
  const preflight: PreflightState = { revision: 0, installations: [], automaticTarget: { path: '/test/AgentPet/default', source: 'default' }, selectedInstallation: null, target: { path: '/test/AgentPet', source: 'chosen' }, inspection: null, scan: 'complete', notice: 'none' };
  function pushConfigs() { configs = { ...configs, revision: configs.revision + 1 }; configListeners.forEach(listener => listener(configs)); return Promise.resolve(configs); }
  function subscribe<T>(listeners: Set<(value: T) => void>, listener: (value: T) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
  function record(id: string) { const value = configs.records.find(value => value.id === id); if (!value) throw new Error('Record missing'); return value; }
  return {
    nativeWindowControls: false,
    windowAction: async () => {},
    getState: async () => state,
    subscribe: listener => subscribe(stateListeners, listener),
    getSessions: async () => sessions, subscribeSessions: listener => subscribe(sessionListeners, listener), openProject: async () => {},
    updatePreferences: async patch => {
      state = scenario === 'error' ? { ...state, preferenceError: '测试边界：模拟磁盘保存失败，未应用更改。' } : { ...state, preferences: { ...state.preferences, ...patch } };
      stateListeners.forEach(listener => listener(state)); return state;
    }, setLogin: async () => state,
    locations: { choose: async () => '/test/AgentPet/new', authorize: async path => path, inspect: async (path, provider) => provider === 'pi' ? { target: { path, source: 'chosen' }, findings: [] } : null },
    piPreflight: { getState: async () => preflight, detect: async () => ({ ...preflight, installations: ['v22.22.3', 'v24.20.0'].map(version => ({ id: `pi-${version}`, path: `/test/AgentPet/.nvm/versions/node/${version}/bin/pi`, compatibility: 'verified-0.85.1' as const, version: '0.85.1' })) }), chooseInstallation: async () => preflight, chooseTarget: async () => preflight, selectInstallation: async () => preflight, useDefaultTarget: async () => preflight, inspect: async () => preflight },
    piConnection: { getState: async () => base, preview: async () => base, cancel: async () => base, confirm: async () => base, resume: async () => base, disable: async () => base, remove: async () => base, subscribe: () => () => {} },
    configurations: {
      getState: async () => configs, subscribe: listener => subscribe(configListeners, listener),
      cancelDetected: async () => {},
      prepareDetected: async () => { throw new Error('Browser fixture cannot authorize real locations. Verify detected setup with isolated Main IPC tests.'); },
      create: async input => {
        configs.notice = configs.records.some(value => value.provider === input.provider && value.targetPath === input.targetPath) ? 'duplicate' : 'none';
        if (configs.notice === 'none') configs.records = [...configs.records, { id: `review-${configs.revision + 2}`, ...input, installation: null, pet: null, availability: input.provider === 'pi' ? 'unchecked' : 'unsupported', inspection: null, connection: input.provider === 'pi' ? { ...base } : null }];
        return pushConfigs();
      }, rename: async (id, name) => { record(id).name = name.trim(); return pushConfigs(); },
      changeTarget: async (id, path) => { const current = record(id); configs.notice = current.connection?.deployedPath ? 'withdraw-first' : 'none'; if (configs.notice === 'none') current.targetPath = path; return pushConfigs(); },
      bindPet: async (id, pet) => { record(id).pet = pet; return pushConfigs(); },
      inspect: async id => { const current = record(id); current.inspection = { target: { path: current.targetPath, source: 'chosen' }, findings: [] }; current.availability = 'available'; return pushConfigs(); },
      preview: async id => { const current = record(id); current.connection = { ...base, preview: { id: 'isolated-plan', path: `${current.targetPath}/extensions/agent-pet.ts`, target: { path: current.targetPath, source: 'chosen' }, action: 'create', findings: [], createDirectories: [] } }; return pushConfigs(); },
      cancel: async id => { record(id).connection!.preview = null; return pushConfigs(); },
      confirm: async () => { throw new Error('Browser fixture cannot deploy. Real Main deployment is verified in isolated filesystem tests.'); },
      resume: async () => { throw new Error('Browser fixture cannot start receivers.'); },
      disable: async id => { record(id).connection = { ...base, status: 'disconnected', saved: 'disabled', canResume: true }; return pushConfigs(); },
      remove: async id => { configs.records = configs.records.filter(value => value.id !== id); configs.notice = 'none'; return pushConfigs(); },
    },
  };
}
