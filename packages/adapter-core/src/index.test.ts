import { expect, it } from 'vitest';
import { createSessionId } from './index.js';

it('creates an adapter-scoped identity for the same provider session in two runs', () => {
  expect(createSessionId({
    provider: 'pi', processInstanceId: 'process-a', providerSessionId: 'session-1',
  })).toBe('pi:process-a:session-1');
  expect(createSessionId({
    provider: 'pi', processInstanceId: 'process-b', providerSessionId: 'session-1',
  })).not.toBe(createSessionId({
    provider: 'pi', processInstanceId: 'process-a', providerSessionId: 'session-1',
  }));
});
