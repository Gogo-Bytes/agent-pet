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
