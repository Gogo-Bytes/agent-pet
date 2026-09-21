import type { SessionObservation } from '@agent-pet/domain';
import { layoutOverlay } from '../../main/overlay-layout.js';

// Fixed IDs/times; each call returns fresh data. No user sessions or pi settings.
export function piObservation(overrides: Partial<SessionObservation> = {}): SessionObservation {
  return {
    provider: 'pi', sessionId: 'pi:baseline:working', providerSessionId: 'working',
    processInstanceId: 'baseline', workId: 'turn-1', revision: 1,
    agentName: '实现 Renderer 基线', projectName: 'agent-pet', status: 'working',
    observedAt: '2026-01-01T00:00:00.000Z', ...overrides,
  };
}

export function piBaselineObservations(): SessionObservation[] {
  return [
    piObservation(),
    piObservation({ sessionId: 'pi:baseline:completed', providerSessionId: 'completed',
      agentName: '已完成 · 检查类型', status: 'completed' }),
    piObservation({ sessionId: 'pi:baseline:error', providerSessionId: 'error',
      agentName: '失败 · 运行测试', status: 'error' }),
    piObservation({ sessionId: 'pi:baseline:long', providerSessionId: 'long',
      agentName: '很长的会话名称 / Renderer migration baseline / 不应撑开气泡宽度', status: 'working' }),
    piObservation({ sessionId: 'pi:baseline:fallback', providerSessionId: 'fallback',
      agentName: '', projectName: '项目名称回退', status: 'completed' }),
    piObservation({ sessionId: 'pi:baseline:idle', providerSessionId: 'idle',
      agentName: '空闲（不显示气泡）', status: 'idle' }),
  ];
}

export function baselineLayout(position: 'center' | 'top-left' | 'bottom-right' = 'center', size = 140) {
  const area = { x: 0, y: 25, width: 1440, height: 875 };
  const point = { center: { x: 650, y: 400 }, 'top-left': { x: -9999, y: -9999 },
    'bottom-right': { x: 9999, y: 9999 } }[position];
  return layoutOverlay({ ...point, width: size, height: size }, area);
}
