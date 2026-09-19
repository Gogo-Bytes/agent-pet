import { describe, expect, it } from 'vitest';
import { createApplication } from './index.js';
import type { SessionObservation } from '@agent-pet/domain';

const observation: SessionObservation = {
  sessionId: 'demo-pi', provider: 'pi', status: 'working',
  agentName: '模拟 · 修复测试', observedAt: '2026-01-01T00:00:00Z',
};

describe('live session snapshots', () => {
  it('publishes observations and stops delivery after unsubscribe', () => {
    const app = createApplication([]);
    const counts: number[] = [];
    const unsubscribe = app.subscribe(state => counts.push(state.bubbles.length));
    app.observe(observation);
    unsubscribe();
    app.observe({ ...observation, sessionId: 'another' });
    expect(counts).toEqual([1]);
  });

  it('keeps working bubbles visible when clicked', async () => {
    const app = createApplication([]);
    app.observe(observation);
    await app.acknowledgeAndOpen({ provider: 'pi', sessionId: observation.sessionId });
    expect(app.snapshot().bubbles[0]?.status).toBe('working');
  });

  it('publishes acknowledgement before waiting for window activation', async () => {
    let countAtOpen = -1;
    const app = createApplication([{
      provider: 'pi',
      async start() { return { async stop() {} }; },
      async openSession() {
        countAtOpen = counts.at(-1) ?? -1;
        return { status: 'unsupported' };
      },
    }]);
    const counts: number[] = [];
    app.subscribe(state => counts.push(state.bubbles.length));
    app.observe({ ...observation, status: 'completed' });
    await app.acknowledgeAndOpen({ provider: 'pi', sessionId: observation.sessionId });
    expect(countAtOpen).toBe(0);
    expect(counts).toEqual([1, 0]);
  });

  it('rejects a mismatched provider without dismissing the bubble', async () => {
    const app = createApplication([]);
    app.observe({ ...observation, status: 'error' });
    expect(await app.acknowledgeAndOpen({ provider: 'codex', sessionId: observation.sessionId }))
      .toEqual({ status: 'not-found' });
    expect(app.snapshot().bubbles).toHaveLength(1);
  });
});
