import { projectPetPresentation, petActionCatalog } from '@agent-pet/pet-runtime';
import type { SessionState } from '@agent-pet/domain';
import { configurationOnline, type ConfigurationsState } from '../../shared/configurations.js';
import type { HomePet } from './CompanionScene.js';
export const providerLabels = { pi: 'pi', codex: 'Codex', claude: 'Claude Code', opencode: 'OpenCode', gemini: 'Gemini CLI', cursor: 'Cursor' };
export function projectHomePets(configurations: ConfigurationsState, sessions: SessionState, defaultName: string): HomePet[] {
  return configurations.records.filter(record => configurationOnline(record) && record.pet).map(record => {
    if (record.provider === 'claude' && record.claude?.scope !== 'task-events') return { connectionCue: record.connectionCue, id: record.id, assetId: record.pet?.assetId ?? 'starter', agent: providerLabels.claude, name: record.pet?.name ?? defaultName, configuration: record.name, action: 'presence', restAction: 'presence', status: '陪伴中 · 任务状态暂不可用' };
    const bubbles = sessions.bubbles.filter(bubble => configurations.sessionConfigurations[bubble.sessionId] === record.id);
    const records = Object.fromEntries(Object.entries(sessions.sessions).filter(([id]) => configurations.sessionConfigurations[id] === record.id));
    const presentation = projectPetPresentation({ sessions: records, bubbles });
    const action = presentation.action;
    const recent = Object.values(records).find(session => session.connected !== false && session.facts?.recentActivity &&
      session.capabilities?.[session.facts.recentActivity.kind] === 'supported' && session.facts.recentActivity.kind === action)?.facts?.recentActivity;
    const recentLabels: Partial<Record<typeof action, string>> = { reading: '刚刚读取了文件', writing: '刚刚修改了文件', searching: '刚刚查找了文件', executing: '刚刚运行了命令' };
    const status = recent && recentLabels[action] ? recentLabels[action]! : action === 'idle' ? '陪伴中' : action === 'working' ? '工作中' : action === 'error' ? record.provider === 'claude' ? '回答出错了' : '出错了' : action === 'success' ? '已完成' : petActionCatalog[action].label;
    return { connectionCue: record.connectionCue, id: record.id, assetId: record.pet?.assetId ?? 'starter', agent: providerLabels[record.provider], name: record.pet?.name ?? defaultName, configuration: record.name, action, status, replay: presentation.replay, restAction: presentation.restAction };
  });
}
