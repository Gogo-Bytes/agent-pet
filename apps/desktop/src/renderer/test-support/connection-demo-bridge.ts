/** Explicitly synthetic UI data. Never imported by an Electron entry. No filesystem or IPC. */
import type { ManagementBridge } from '../management/management-store.js';
import type { AgentConfiguration, ConfigurationsState } from '../../shared/configurations.js';
import type { PiConnectionState } from '../../shared/pi-connection.js';
import type { PreflightState } from '../../shared/pi-preflight.js';
import type { ConnectionSceneId } from './connection-scenes-data.js';
import { createReviewBridge } from './review-bridge.js';

const folder = '/示例/pi/agent';
const fresh: PiConnectionState = { revision: 0, status: 'not-configured', mode: 'desktop', busy: false, canConfigure: true, preview: null, deployedPath: null, canRemove: false, canResume: false, receiving: 'stopped', saved: 'none', notice: 'none' };
const connected: PiConnectionState = { ...fresh, status: 'connected', canConfigure: false, canRemove: true, receiving: 'active', saved: 'ready', deployedPath: `${folder}/extensions/agent-pet.ts` };
// Unresolved until the user cancels/leaves. No mock timer that suddenly reports success.
const waiting = <T,>() => new Promise<T>(() => {});
export function createConnectionDemoBridge(scene: ConnectionSceneId): ManagementBridge {
  const bridge = createReviewBridge('empty');
  const listeners = new Set<(state: ConfigurationsState) => void>();
  const record: AgentConfiguration = { id: 'demo-pi', name: 'pi 默认配置', provider: 'pi', targetPath: folder, installation: null, pet: null, availability: 'available', inspection: { target: { path: folder, source: 'chosen' }, findings: [] }, connection: { ...connected } };
  let state: ConfigurationsState = { revision: 0, records: [record], notice: 'none', busy: false, sessionConfigurations: {} };
  const noRecords = scene === 'empty' || (scene.startsWith('scan-') && scene !== 'scan-saved') || scene.startsWith('detected');
  if (noRecords) state.records = [];
  if (['new', 'change-folder', 'preview', 'preview-blocked'].includes(scene)) record.connection = { ...fresh };
  if (['resume', 'paused'].includes(scene)) {
    record.availability = 'unchecked'; record.inspection = null;
    record.connection = { ...connected, status: 'disconnected', receiving: 'stopped', saved: scene === 'paused' ? 'disabled' : 'ready', canResume: true, notice: 'resume-required' };
  }
  if (['waiting', 'disconnected'].includes(scene)) record.connection = { ...connected, status: scene === 'waiting' ? 'configured-waiting' : 'disconnected' };
  if (scene === 'failed') record.connection = { ...connected, status: 'failed', receiving: 'stopped', notice: 'start-failed', canRemove: true };
  if (scene === 'unknown') record.connection = { ...connected, status: 'failed', receiving: 'unknown', notice: 'stop-failed' };
  if (scene === 'unsupported') { record.provider = 'claude'; record.name = '项目助手'; record.availability = 'unsupported'; record.inspection = null; record.connection = null; }
  if (scene === 'position-error') { record.availability = 'attention'; record.inspection!.findings = ['unreadable']; record.connection = { ...fresh }; }
  if (scene === 'long') { record.name = '这是一条用于查看长名称显示效果的项目连接'; record.targetPath = `/示例/${'非常长的项目文件夹/'.repeat(20)}pi/agent`; }
  if (scene === 'multiple') state.records.push({ ...record, id: 'demo-project', name: '工作项目', targetPath: '/示例/工作项目/pi', connection: { ...fresh } }, { ...record, id: 'demo-claude', name: '写作助手', provider: 'claude', targetPath: '/示例/写作', availability: 'unsupported', connection: null });
  const preflight: PreflightState = { revision: 0, installations: ['v22.22.3', 'v24.20.0'].map(version => ({ id: `demo-${version}`, path: `/示例/.nvm/versions/node/${version}/bin/pi`, version: '0.85.1', compatibility: 'verified-0.85.1' })), target: { path: folder, source: 'default' }, automaticTarget: { path: folder, source: 'default' }, selectedInstallation: null, inspection: null, scan: 'complete', notice: 'none' };
  if (scene === 'scan-empty' || scene === 'scan-error') preflight.installations = [];
  if (scene === 'scan-limited') preflight.scan = 'limited';
  if (scene === 'scan-unverified') preflight.installations = [{ id: 'demo-unverified', path: '/示例/bin/pi', version: '未知版本', compatibility: 'unverified' }];
  function push() { state = { ...state, revision: state.revision + 1 }; listeners.forEach(listener => listener(state)); return Promise.resolve(state); }
  function get(id: string) { const result = state.records.find(value => value.id === id); if (!result) throw new Error('Demo record missing'); return result; }
  function preview(id: string) {
    const value = get(id);
    value.connection = { ...fresh, preview: { id: 'demo-plan', path: `${value.targetPath}/extensions/agent-pet.ts`, target: { path: value.targetPath, source: 'chosen' }, action: scene === 'preview-blocked' ? 'blocked' : 'create', findings: scene === 'preview-blocked' ? ['existing-extension'] : [], createDirectories: [] } };
    return push();
  }
  return { ...bridge,
    locations: {
      choose: async () => { if (scene === 'manual-picker-error') throw new Error('Demo picker error'); return scene === 'manual-duplicate' ? folder : '/示例/我的项目/pi'; },
      authorize: async path => path,
      inspect: async (path, provider) => scene === 'manual-checking' ? waiting() : provider === 'pi' ? { target: { path, source: 'chosen' }, findings: scene === 'manual-blocked' ? ['settings-unknown'] : [] } : null,
    },
    piPreflight: { ...bridge.piPreflight, getState: async () => preflight, detect: async () => { if (scene === 'scan-loading') return waiting(); if (scene === 'scan-error') throw new Error('Demo scan error'); return preflight; } },
    configurations: { ...bridge.configurations,
      getState: async () => state, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      prepareDetected: async () => {
        if (scene === 'detected-checking') return waiting();
        if (scene === 'detected-error') throw new Error('Demo check error');
        state.records = [{ ...record, connection: { ...fresh } }]; await preview(record.id);
        return { state, configurationId: record.id };
      },
      create: async input => {
        state.notice = scene === 'manual-save-error' ? 'save-failed' : state.records.some(value => value.targetPath === input.targetPath && value.provider === input.provider) ? 'duplicate' : 'none';
        if (state.notice === 'none') state.records = [...state.records, { ...record, ...input, id: `demo-created-${state.revision}`, availability: input.provider === 'pi' ? 'unchecked' : 'unsupported', inspection: null, connection: input.provider === 'pi' ? { ...fresh } : null }];
        return push();
      },
      rename: async (id, name) => { get(id).name = name.trim(); return push(); },
      changeTarget: async (id, path) => { get(id).targetPath = path; return push(); },
      inspect: async id => { const value = get(id); value.availability = 'available'; value.inspection = { target: { path: value.targetPath, source: 'chosen' }, findings: [] }; return push(); },
      preview, cancel: async id => { get(id).connection!.preview = null; return push(); },
      confirm: async id => { get(id).connection = { ...connected, status: 'configured-waiting' }; return push(); },
      resume: async id => { get(id).connection = { ...connected, status: 'configured-waiting' }; return push(); },
      disable: async id => { get(id).connection = { ...connected, status: 'disconnected', receiving: 'stopped', saved: 'disabled', canResume: true }; return push(); },
      remove: async id => { state.notice = scene === 'remove-error' ? 'retained' : 'none'; if (state.notice === 'none') state.records = state.records.filter(value => value.id !== id); return push(); },
    },
  };
}
