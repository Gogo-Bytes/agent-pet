import { describe, expect, it } from 'vitest';
import { parsePiBridgeMessage } from './protocol.js';

describe('pi bridge protocol', () => {
  it('accepts a minimal authenticated hello', () => {
    expect(parsePiBridgeMessage({
      type: 'hello', schemaVersion: 1, token: '0123456789abcdef', seq: 1,
      processInstanceId: 'process-1', providerSessionId: 'session-1',
      sessionName: 'Fix tests', projectName: 'agent-pet', status: 'idle',
      sentAt: '2026-01-01T00:00:00.000Z',
    })).toMatchObject({ ok: true, value: { type: 'hello', seq: 1 } });
  });

  it('rejects prompt/content fields and invalid statuses', () => {
    expect(parsePiBridgeMessage({
      type: 'lifecycle', schemaVersion: 1, token: '0123456789abcdef', seq: 2,
      processInstanceId: 'p', providerSessionId: 's', status: 'working',
      prompt: 'secret user prompt', sentAt: '2026-01-01T00:00:01.000Z',
    })).toEqual({ ok: false, reason: 'unknown-field:prompt' });
    expect(parsePiBridgeMessage({
      type: 'lifecycle', schemaVersion: 1, token: '0123456789abcdef', seq: 2,
      processInstanceId: 'p', providerSessionId: 's', status: 'banana',
      sentAt: '2026-01-01T00:00:01.000Z',
    })).toEqual({ ok: false, reason: 'invalid-status' });
  });

  it('accepts lifecycle, rename and heartbeat messages', () => {
    for (const message of [
      { type: 'lifecycle', status: 'working' },
      { type: 'session_info_changed', sessionName: 'Renamed' },
      { type: 'heartbeat' },
    ]) {
      expect(parsePiBridgeMessage({
        ...message, schemaVersion: 1, token: '0123456789abcdef', seq: 3,
        processInstanceId: 'p', providerSessionId: 's',
        sentAt: '2026-01-01T00:00:01.000Z',
      })).toMatchObject({ ok: true });
    }
  });
});

const fine = { type: 'hello', schemaVersion: 1, token: '0123456789abcdef', seq: 1,
  processInstanceId: 'p', providerSessionId: 's', status: 'working', sentAt: '2026-01-01T00:00:00Z',
  capabilities: { thinking: 'supported', retrying: 'unknown' }, facts: { activities: ['thinking'], waitingForInput: false } };
it('accepts bounded enum-only capabilities and companion facts on authenticated and managed paths', async () => {
  const { parsePiSessionMessage } = await import('./protocol.js');
  expect(parsePiBridgeMessage(fine).ok).toBe(true);
  const { token: _token, ...managed } = fine;
  expect(parsePiSessionMessage(managed).ok).toBe(true);
  expect(parsePiBridgeMessage({ ...fine, type: 'companion', status: undefined, capabilities: undefined }).ok).toBe(false);
  const { status: _status, capabilities: _cap, ...companion } = fine;
  expect(parsePiBridgeMessage({ ...companion, type: 'companion' }).ok).toBe(true);
});
it.each([
  { facts: { activities: ['future'], waitingForInput: false } },
  { facts: { activities: ['thinking', 'thinking'], waitingForInput: false } },
  { facts: { activities: [], waitingForInput: 'yes' } },
  { facts: { activities: [], waitingForInput: false, content: 'secret' } },
  { facts: { activities: [], waitingForInput: false, occurrence: { id: 'x', kind: 'tool_error', output: 'secret' } } },
  { facts: { activities: [], waitingForInput: false, occurrence: { id: 'x'.repeat(65), kind: 'cancelled' } } },
  { facts: { activities: [], waitingForInput: false, occurrence: { id: 'x', kind: 'terminal_error' } } },
  { facts: null }, { capabilities: [] }, { capabilities: { thinking: ['supported'] } },
  { capabilities: { future: 'supported' } }, { capabilities: { thinking: true } },
  { seq: Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1 }, { type: '__proto__' }, { type: 'constructor' },
])('rejects malformed or content-bearing fine observations %#', patch => {
  expect(parsePiBridgeMessage({ ...fine, ...patch }).ok).toBe(false);
});

it('ignores a late close from an older peer after a newer baseline and safely clears the current peer', async () => {
  const { PiBridgeSession } = await import('./index.js');
  const { createApplication } = await import('../../application/src/index.js');
  const app = createApplication([]), publish = app.observe;
  const old = new PiBridgeSession({ token: fine.token, publish, publishDisconnected: publish });
  const replacement = new PiBridgeSession({ token: fine.token, publish, publishDisconnected: publish });
  old.handle(fine);
  replacement.handle({ ...fine, seq: 2, facts: { activities: ['reading'], waitingForInput: false }, capabilities: { reading: 'supported' } });
  old.disconnected();
  const current = () => Object.values(app.snapshot().sessions)[0]!;
  expect(current()).toMatchObject({ connected: true, revision: 4, facts: { activities: ['reading'] } });
  replacement.disconnected();
  expect(current()).toMatchObject({ connected: false, revision: 5, facts: { activities: [], waitingForInput: false } });
  expect(app.snapshot().bubbles).toEqual([]);
});
