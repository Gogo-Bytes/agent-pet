import { describe, expect, it, vi } from 'vitest';
import type { SessionObservationAdapter } from '@agent-pet/adapter-core';
import { createApplication } from './index.js';

const adapter = (
  openSession: NonNullable<SessionObservationAdapter['openSession']>,
): SessionObservationAdapter => ({
  provider: 'pi',
  start: vi.fn(),
  openSession,
});

describe('application session orchestration', () => {
  it('projects adapter observations into the domain state', () => {
    const app = createApplication([adapter(vi.fn())]);

    app.observe({
      sessionId: 'session-1',
      provider: 'pi',
      status: 'working',
      agentName: 'pi',
      observedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(app.snapshot().bubbles).toEqual([
      { sessionId: 'session-1', name: 'pi', status: 'working', unread: false },
    ]);
  });

  it('acknowledges before opening a completed session', async () => {
    const openSession = vi.fn().mockResolvedValue({ status: 'success' });
    const app = createApplication([adapter(openSession)]);

    app.observe({
      sessionId: 'session-1',
      provider: 'pi',
      status: 'completed',
      agentName: 'pi',
      observedAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await app.acknowledgeAndOpen({ provider: 'pi', sessionId: 'session-1' });

    expect(result).toEqual({ status: 'success' });
    expect(openSession).toHaveBeenCalledWith({ provider: 'pi', sessionId: 'session-1' });
    expect(app.snapshot().bubbles).toEqual([]);
  });

  it('returns unsupported without resurrecting an acknowledged bubble', async () => {
    const app = createApplication([adapter(vi.fn())]);

    app.observe({
      sessionId: 'session-1',
      provider: 'pi',
      status: 'error',
      agentName: 'pi',
      observedAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await app.acknowledgeAndOpen({ provider: 'pi', sessionId: 'session-1' });

    expect(result).toEqual({ status: 'unsupported' });
    expect(app.snapshot().bubbles).toEqual([]);
  });
});
