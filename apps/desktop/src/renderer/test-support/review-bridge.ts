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
  const paths = scenario === 'detail-long-path' ? [`/test/AgentPet/${'a-very-long-project-directory/'.repeat(12)}pi-config`] : ['scan-saved', 'detail-resume', 'detail-paused', 'detail-waiting'].includes(scenario) ? ['/test/AgentPet/default'] : ['/test/AgentPet/personal', '/test/AgentPet/project'];
  if (scenario !== 'empty' && scenario !== 'scan-new' && !scenario.startsWith('claude-') && !scenario.startsWith('codex-')) paths.forEach((path, index) => {
    const id = `review-${index}`;
    const record: ConfigurationMetadata = { id, name: ['scan-saved', 'detail-resume', 'detail-paused', 'detail-waiting'].includes(scenario) ? 'pi 默认配置' : index === 0 ? '个人配置' : '一个用于验证窄窗口的很长很长的项目配置名称', provider: 'pi', targetPath: path, installation: null, pet: { assetId: 'starter', name: index ? '项目小伙伴' : '小伙伴' } };
    configs.records.push({ ...record, availability: 'available', inspection: { target: { path, source: 'chosen' }, findings: [] }, connection: { ...base, status: 'connected', receiving: 'active', saved: 'ready', canConfigure: false, canRemove: true, deployedPath: `${path}/extensions/agent-pet.ts` } });
    const sessionId = `${id}:pi:process:session`; configs.sessionConfigurations[sessionId] = id;
    sessions = applyObservation(sessions, { provider: 'pi', sessionId, status: index ? 'completed' : 'working', observedAt: '2026-10-14T00:00:00Z', agentName: record.name });
  });
  if (['detail-resume', 'detail-paused', 'detail-waiting'].includes(scenario)) {
    configs.records = configs.records.map(record => ({ ...record, availability: 'unchecked', inspection: null,
      connection: { ...record.connection!, status: scenario === 'detail-waiting' ? 'configured-waiting' : 'disconnected',
        receiving: scenario === 'detail-waiting' ? 'active' : 'stopped', saved: scenario === 'detail-paused' ? 'disabled' : 'ready',
        canResume: scenario !== 'detail-waiting', notice: scenario === 'detail-waiting' ? 'none' : 'resume-required' } }));
    sessions = createSessionState();
  }
  if (scenario === 'detail-error') configs.records = configs.records.map(record => ({ ...record, availability: 'attention',
    inspection: { target: { path: record.targetPath, source: 'chosen' }, findings: ['unreadable'] },
    connection: { ...base, status: 'failed', notice: 'preview-failed' } }));
  if (scenario.startsWith('claude-task')) {
    configs.records = [{ id: 'review-claude-task', name: 'Claude Code', provider: 'claude', targetPath: '/示例/.claude', installation: null,
      pet: null, availability: 'available', inspection: null, connection: null,
      claude: { revision: 0, mode: 'normal-start', scope: scenario === 'claude-task-upgrade' ? 'presence-only' : 'task-events',
        status: 'observing', busy: false, configured: true, observedRuns: 1, launchers: 1, preview: null, launchCommand: null,
        canConfigure: false, canUpgrade: scenario === 'claude-task-upgrade', canResume: false, notice: 'none' } }];
    configs.sessionConfigurations = { 'review-feedback': 'review-claude-task' };
    sessions = applyObservation(sessions, { sessionId: 'review-feedback', provider: 'claude', agentName: 'Claude Code', status: 'unknown',
      observedAt: '2026-10-18T00:00:00Z', capabilities: { reading: 'supported' },
      facts: { activities: [], waitingForInput: false, recentActivity: { id: 'review-recent', kind: 'reading' } } });
  }
  if (scenario.startsWith('codex-')) {
    configs.records = [{ id: 'review-codex', name: '我的 Codex', provider: 'codex', targetPath: '/示例/.codex', installation: null,
      pet: null, availability: scenario === 'codex-error' ? 'attention' : 'available', inspection: null, connection: null,
      codex: { revision: 0, status: scenario === 'codex-online' ? 'observing' : scenario === 'codex-waiting' ? 'waiting' :
        scenario === 'codex-error' ? 'failed' : 'not-configured', configured: scenario !== 'codex-preview', busy: false,
        observedSessions: scenario === 'codex-online' ? 1 : 0, canConfigure: scenario === 'codex-preview', canResume: scenario === 'codex-error',
        preview: null, notice: scenario === 'codex-error' ? 'saved-invalid' : 'none' } }];
    if (scenario === 'codex-online') {
      configs.sessionConfigurations = { 'review-codex-session': 'review-codex' };
      sessions = applyObservation(sessions, { provider: 'codex', sessionId: 'review-codex-session', agentName: 'Codex', status: 'unknown',
        connected: true, observedAt: '2026-10-19T00:00:00Z', capabilities: {}, facts: { activities: [], waitingForInput: false } });
    }
  }
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
      detectClaude: async () => ({ installations: scenario.startsWith('claude-scan') ? [
        { id: 'review-claude-npm', entryPath: '/示例/.nvm/versions/node/v22.18.0/bin/claude', executable: '/示例/npm/bin/claude.exe', kind: 'npm', version: '2.1.301', compatibility: 'verified' },
        ...(scenario === 'claude-scan-multiple' ? [{ id: 'review-claude-other', entryPath: '/示例/.nvm/versions/node/v24.20.0/bin/claude', executable: '/示例/npm-other/bin/claude.exe', kind: 'npm' as const, version: '2.1.301', compatibility: 'verified' as const }] : []),
        { id: 'review-claude-native', entryPath: '/示例/.local/bin/claude', executable: '/示例/.local/share/claude/versions/2.1.301', kind: 'native', version: null, compatibility: 'unverified' },
        { id: 'review-claude-brew', entryPath: '/示例/homebrew/bin/claude', executable: '/示例/homebrew/Caskroom/claude-code/2.1.286/claude', kind: 'homebrew', version: null, compatibility: 'unverified' },
      ] : [], targetPath: '/示例/.claude', scan: 'complete', notice: 'none' }),
      cancelClaudeScan: async () => {},
      prepareDetectedClaude: async id => {
        if (!scenario.startsWith('claude-scan')) throw new Error('Browser fixture cannot authorize real locations.');
        const directory = '/示例/AgentPet/private/claude';
        const value = { id: 'review-claude', name: 'Claude Code', provider: 'claude' as const, targetPath: '/示例/.claude', installation: null, pet: null, availability: 'available' as const, inspection: null, connection: null,
          claude: { revision: 0, mode: 'normal-start' as const, scope: 'presence-only' as const, status: 'not-configured' as const, busy: false, configured: false, observedRuns: 0, launchers: 0, launchCommand: null, canConfigure: true, canResume: false, notice: 'none' as const,
            preview: { id: 'review-claude-plan', executable: id === 'review-claude-other' ? '/示例/npm-other/bin/claude.exe' : '/示例/npm/bin/claude.exe', directory, files: ['observer.cjs','activation.json','hook.json','settings-before.json','receipt.json'].map(name => directory + '/' + name),
              settings: { path: '/示例/.claude/settings.json', exists: true, canApply: true, reason: '' } } } };
        configs.records = [value]; await pushConfigs(); return { state: configs, configurationId: value.id };
      },
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
      preview: async id => { const current = record(id);
        if (current.codex) {
          current.codex.preview = { id: 'codex-fixture-plan', executable: '/示例/Codex/bin/codex', path: current.targetPath + '/hooks.json', canApply: true, exists: true, events: ['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','Interrupt','PreCompact','PostCompact'] };
        } else if (current.claude) {
          const directory = '/示例/AgentPet/private/claude';
          current.claude.preview = { id: 'review-task-upgrade', operation: 'upgrade', directory, executable: '/示例/npm/bin/claude.exe',
            events: ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'PreCompact', 'PostCompact'],
            files: ['observer.cjs', 'activation.json', 'hook.json', 'upgrade-before.json', 'receipt.json'].map(name => directory + '/' + name),
            settings: { path: '/示例/.claude/settings.json', exists: true, canApply: true, reason: '' } };
        } else current.connection = { ...base, preview: { id: 'isolated-plan', path: `${current.targetPath}/extensions/agent-pet.ts`, target: { path: current.targetPath, source: 'chosen' }, action: 'create', findings: [], createDirectories: [] } };
        return pushConfigs(); },
      cancel: async id => { const value = record(id); if (value.codex) value.codex.preview = null; else if (value.claude) value.claude.preview = null; else if (value.connection) value.connection.preview = null; return pushConfigs(); },
      confirm: async () => { throw new Error('Browser fixture cannot deploy. Real Main deployment is verified in isolated filesystem tests.'); },
      resume: async () => { throw new Error('Browser fixture cannot start receivers.'); },
      disable: async id => { record(id).connection = { ...base, status: 'disconnected', saved: 'disabled', canResume: true }; return pushConfigs(); },
      remove: async id => { configs.records = configs.records.filter(value => value.id !== id); configs.notice = 'none'; return pushConfigs(); },
    },
  };
}
