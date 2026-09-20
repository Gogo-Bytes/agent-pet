import { describe, expect, it } from 'vitest';
import { PiBridgeSession } from './index.js';

const token = '0123456789abcdef';
const hello = {
  type: 'hello' as const, schemaVersion: 1 as const, token, seq: 1,
  processInstanceId: 'process-1', providerSessionId: 'session-1',
  sessionName: 'Fix tests', projectName: 'agent-pet', status: 'idle' as const,
  sentAt: '2026-01-01T00:00:00.000Z',
};

describe('pi bridge session', () => {
  it('normalizes hello and lifecycle events without forwarding content', () => {
    const observations: unknown[] = [];
    const session = new PiBridgeSession({ token, publish: event => observations.push(event) });
    session.handle(hello);
    const { sessionName, projectName, ...lifecycleBase } = hello;
    session.handle({ ...lifecycleBase, type: 'lifecycle', seq: 2, status: 'working', workId: 'work-1' });
    session.handle({ ...lifecycleBase, type: 'lifecycle', seq: 3, status: 'completed', workId: 'work-1' });

    expect(observations).toEqual([
      expect.objectContaining({ sessionId: 'pi:process-1:session-1', status: 'idle', agentName: 'Fix tests' }),
      expect.objectContaining({ sessionId: 'pi:process-1:session-1', status: 'working', workId: 'work-1' }),
      expect.objectContaining({ sessionId: 'pi:process-1:session-1', status: 'completed', workId: 'work-1' }),
    ]);
    expect(JSON.stringify(observations)).not.toContain('prompt');
  });

  it('rejects wrong tokens and duplicate sequence numbers', () => {
    const observations: unknown[] = [];
    const session = new PiBridgeSession({ token, publish: event => observations.push(event) });
    session.handle({ ...hello, token: 'wrong-token-000000' });
    session.handle(hello);
    session.handle(hello);
    expect(observations).toHaveLength(1);
  });
});
