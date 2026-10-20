import { expect, it } from 'vitest';
import { normalRoundChecks } from './normal-review-checks.mjs';
const before = { responses: 0, taskResponses: 0, titleResponses: 0, rejected: 0, unexpected: 0 };
const check = (after, other = {}) => normalRoundChecks({ exitCode: 0, before, after: { ...before, ...after },
  connectedBefore: 0, connectedAfter: 1, ...other });
it('accepts one task plus optional native title, without conflating model traffic with connection', () => {
  expect(check({ responses: 2, taskResponses: 1, titleResponses: 1 })).toMatchObject({ passed: true, connected: true });
  expect(check({ responses: 1, taskResponses: 1 }).passed).toBe(true);
  expect(check({ responses: 2, taskResponses: 1, titleResponses: 1 }, { connectedAfter: 0 }))
    .toMatchObject({ passed: false, connected: false, taskRequests: 1, titleRequests: 1 });
});
it('still refuses duplicate tasks, extra titles, rejects, unexpected traffic or failed process', () => {
  for (const after of [{ responses: 2, taskResponses: 2 }, { responses: 3, taskResponses: 1, titleResponses: 2 },
    { responses: 1, taskResponses: 1, rejected: 1 }, { responses: 1, taskResponses: 1, unexpected: 1 }])
    expect(check(after).passed).toBe(false);
  expect(check({ responses: 1, taskResponses: 1 }, { exitCode: 1 }).passed).toBe(false);
});
it('compares each launch separately after receiver rotation', () => {
  expect(check({ responses: 4, taskResponses: 2, titleResponses: 2 }, {
    before: { ...before, responses: 2, taskResponses: 1, titleResponses: 1 }, connectedBefore: 3, connectedAfter: 4 }).passed).toBe(true);
});
