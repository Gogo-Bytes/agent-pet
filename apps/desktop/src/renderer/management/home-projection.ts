import { projectPetPresentation, petActionCatalog } from '@agent-pet/pet-runtime';
import type { SessionState } from '@agent-pet/domain';
import { configurationOnline, type ConfigurationsState } from '../../shared/configurations.js';
import type { HomePet } from './CompanionScene.js';
export const providerLabels = { pi: 'pi', codex: 'Codex', claude: 'Claude Code', opencode: 'OpenCode', gemini: 'Gemini CLI', cursor: 'Cursor' };
export function projectHomePets(configurations: ConfigurationsState, sessions: SessionState, defaultName: string): HomePet[] {
  return configurations.records.filter(configurationOnline).map(record => {
    if (record.provider === 'claude') return { id: record.id, agent: providerLabels.claude, name: record.pet?.name ?? defaultName, configuration: record.name, action: 'presence', restAction: 'presence', status: '陪伴中 · 任务状态暂不可用' };
    const bubbles = sessions.bubbles.filter(bubble => configurations.sessionConfigurations[bubble.sessionId] === record.id);
    const records = Object.fromEntries(Object.entries(sessions.sessions).filter(([id]) => configurations.sessionConfigurations[id] === record.id));
    const presentation = projectPetPresentation({ sessions: records, bubbles });
    const action = presentation.action;
    const status = action === 'idle' ? '陪伴中' : action === 'working' ? '工作中' : action === 'error' ? '出错了' : action === 'success' ? '已完成' : petActionCatalog[action].label;
    return { id: record.id, agent: providerLabels[record.provider], name: record.pet?.name ?? defaultName, configuration: record.name, action, status, replay: presentation.replay, restAction: presentation.restAction };
  });
}
