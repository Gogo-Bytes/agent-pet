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
    const label = presentation.replay && presentation.restAction !== 'idle' ? presentation.restAction : action;
    const status = label === 'idle' ? '陪伴中' : label === 'working' ? '工作中' : label === 'error' ? record.provider === 'claude' ? '回答出错了' : '出错了' : label === 'success' ? '已完成' : petActionCatalog[label].label;
    return { connectionCue: record.connectionCue, id: record.id, assetId: record.pet?.assetId ?? 'starter', agent: providerLabels[record.provider], name: record.pet?.name ?? defaultName, configuration: record.name, action, status, replay: presentation.replay, restAction: presentation.restAction };
  });
}
