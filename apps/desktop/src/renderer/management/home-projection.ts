import type { SessionState } from '@agent-pet/domain';
import type { ConfigurationsState } from '../../shared/configurations.js';
import type { HomePet } from './CompanionScene.js';
export const providerLabels = { pi: 'pi', codex: 'Codex', claude: 'Claude Code', opencode: 'OpenCode', gemini: 'Gemini CLI', cursor: 'Cursor' };
export function projectHomePets(configurations: ConfigurationsState, sessions: SessionState, defaultName: string): HomePet[] {
  return configurations.records.filter(record => record.connection?.status === 'connected').map(record => {
    const bubbles = sessions.bubbles.filter(bubble => configurations.sessionConfigurations[bubble.sessionId] === record.id);
    const action = bubbles.some(bubble => bubble.status === 'working') ? 'Work' : bubbles.some(bubble => bubble.status === 'error-unread') ? 'Error' : bubbles.some(bubble => bubble.status === 'completed-unread') ? 'Success' : 'Idle';
    const status = action === 'Work' ? '工作中' : action === 'Error' ? '出错了' : action === 'Success' ? '已完成' : '陪伴中';
    return { id: record.id, agent: providerLabels[record.provider], name: record.pet?.name ?? defaultName, configuration: record.name, action, status };
  });
}
