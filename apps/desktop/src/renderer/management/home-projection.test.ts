import { describe, expect, it } from 'vitest';
import { applyObservation, createSessionState, type SessionObservation, type SessionState } from '@agent-pet/domain';
import type { AgentConfiguration, ConfigurationsState } from '../../shared/configurations.js';
import type { PiConnectionState } from '../../shared/pi-connection.js';
import type { ClaudeConnectionState } from '../../shared/claude-connection.js';
import { projectHomePets } from './home-projection.js';
function config(id: string, status: PiConnectionState['status'] = 'connected'): AgentConfiguration {
  return { id, name: `项目 ${id}`, provider: 'pi', targetPath: `/isolated/${id}`, installation: null,
    availability: 'available', inspection: null, pet: { assetId: 'starter', name: `宠物 ${id}` },
    connection: { revision: 0, status, mode: 'desktop', busy: false, canConfigure: false, preview: null,
      deployedPath: null, canRemove: false, canResume: false, receiving: 'active', saved: 'none', notice: 'none' } };
}
function collection(records: AgentConfiguration[], sessionConfigurations: Record<string, string> = {}): ConfigurationsState {
  return { revision: 0, records, sessionConfigurations, notice: 'none', busy: false };
}
function sessions(values: Array<[string, SessionObservation['status']]>): SessionState {
  return values.reduce((state, [sessionId, status]) => applyObservation(state, {
    sessionId, status, provider: 'pi', agentName: sessionId, observedAt: '2026-10-14T00:00:00.000Z',
  }), createSessionState());
}
describe('home pet projection from shared configuration and Session state', () => {
  it('projects task-enabled Claude recent feedback and response errors through the shared pet source', () => {
    const record: AgentConfiguration = { ...config('claude'), provider: 'claude', connection: null,
      claude: { revision: 0, scope: 'task-events', mode: 'normal-start', status: 'observing', busy: false, configured: true,
        observedRuns: 1, launchers: 1, preview: null, launchCommand: null, canConfigure: false, canResume: false, notice: 'none' } };
    const source = collection([record], { observed: 'claude', foreign: 'other' });
    let state = applyObservation(createSessionState(), { sessionId: 'observed', provider: 'claude', status: 'unknown', observedAt: '2026-10-18T00:00:00Z', revision: 1,
      capabilities: { reading: 'supported' }, facts: { activities: [], waitingForInput: false, recentActivity: { id: 'one', kind: 'reading' } } });
    expect(projectHomePets(source, state, '默认')[0]).toMatchObject({ action: 'reading', status: '刚刚读取了文件', replay: 'observed:one' });
    state = applyObservation(state, { ...state.sessions.observed!, revision: 2, facts: { activities: [], waitingForInput: false } });
    expect(projectHomePets(source, state, '默认')[0]).toMatchObject({ action: 'idle', status: '陪伴中', replay: '' });
    state = applyObservation(state, { ...state.sessions.observed!, revision: 3, status: 'error', workId: 'response' });
    expect(projectHomePets(source, state, '默认')[0]).toMatchObject({ action: 'error', status: '回答出错了' });
    const disconnected = { ...record, claude: { ...record.claude!, status: 'waiting' as const, observedRuns: 0 } };
    expect(projectHomePets(collection([disconnected], { observed: 'claude' }), state, '默认')).toEqual([]);
  });
  it('projects each observing Claude configuration with neutral presence and no task facts, including zero Sessions', () => {
    const claude = (id: string, status: ClaudeConnectionState['status']): AgentConfiguration => ({ ...config(id), provider: 'claude', connection: null,
      claude: { revision: 0, scope: 'presence-only', status, busy: false, configured: true, observedRuns: status === 'observing' ? 1 : 0,
        launchers: 1, preview: null, launchCommand: 'synthetic-launch', canConfigure: false, canResume: false, notice: 'none' } });
    const source = collection([claude('one', 'observing'), claude('two', 'observing'), ...(['not-configured', 'waiting', 'disconnected', 'disabled', 'failed'] as const).map(status => claude(status, status))], { work: 'one', failure: 'two' });
    for (const state of [createSessionState(), sessions([['work', 'working'], ['failure', 'error']])]) {
      expect(projectHomePets(source, state, '默认').map(pet => [pet.id, pet.action, pet.restAction, pet.status])).toEqual([
        ['one', 'presence', 'presence', '陪伴中 · 任务状态暂不可用'], ['two', 'presence', 'presence', '陪伴中 · 任务状态暂不可用'],
      ]);
    }
  });
  it('preserves separate configuration identities for multiple installations of the same Provider', () => {
    const projected = projectHomePets(collection([config('one'), config('two')]), createSessionState(), '默认宠物');
    expect(projected.map(pet => [pet.id, pet.agent, pet.name, pet.configuration])).toEqual([
      ['one', 'pi', '宠物 one', '项目 one'], ['two', 'pi', '宠物 two', '项目 two'],
    ]);
    expect(projected.every(pet => pet.action === 'idle' && pet.status === '陪伴中')).toBe(true);
  });
  it('filters waiting, disconnected, failed and absent connections even when their configuration is available', () => {
    const statuses = ['connected', 'configured-waiting', 'disconnected', 'failed', 'not-configured'] as const;
    const absent = { ...config('absent'), connection: null };
    expect(projectHomePets(collection([...statuses.map(status => config(status, status)), absent]), createSessionState(), '默认').map(pet => pet.id)).toEqual(['connected']);
  });
  it('uses only Sessions mapped to the exact configuration and ignores an orphan or unmapped same-Provider Session', () => {
    const state = sessions([['one-work', 'working'], ['two-error', 'error'], ['orphan', 'working'], ['unmapped', 'working']]);
    const projected = projectHomePets(collection([config('one'), config('two'), config('three')], {
      'one-work': 'one', 'two-error': 'two', orphan: 'removed-config',
    }), state, '默认');
    expect(projected.map(pet => [pet.id, pet.action, pet.status])).toEqual([
      ['one', 'working', '工作中'], ['two', 'error', '出错了'], ['three', 'idle', '陪伴中'],
    ]);
  });
  it.each([
    [['working', 'error', 'completed'], 'working', '工作中'],
    [['error', 'completed'], 'error', '出错了'],
    [['completed'], 'success', '已完成'],
    [['idle', 'offline'], 'idle', '陪伴中'],
  ] as const)('prioritizes observable motion for %j without treating a connection failure as a task error', (statuses, action, status) => {
    const values = statuses.map((value, index) => [`session-${index}`, value] as [string, SessionObservation['status']]);
    const map = Object.fromEntries(values.map(([id]) => [id, 'one']));
    expect(projectHomePets(collection([config('one')], map), sessions(values), '默认')[0]).toMatchObject({ action, status });
  });
  it('removes an unbound pet immediately without altering its Agent or unread Sessions', () => {
    const state = sessions([['completed', 'completed']]);
    const source = collection([{ ...config('one'), pet: null }], { completed: 'one' });
    expect(projectHomePets(collection([config('one')], { completed: 'one' }), state, '团子')).toHaveLength(1);
    expect(projectHomePets(source, state, '团子')).toEqual([]);
    expect(projectHomePets({ ...source, records: [] }, state, '团子')).toEqual([]);
    expect(state.bubbles).toHaveLength(1);
    expect(source.records).toHaveLength(1);
  });
});
