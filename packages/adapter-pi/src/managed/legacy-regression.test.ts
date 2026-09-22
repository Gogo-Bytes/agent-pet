import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { SessionObservation } from '@agent-pet/domain';
import { PiBridgeSession } from '../index.js';
import { parsePiBridgeMessage, parsePiSessionMessage } from '../protocol.js';
import { baseline, lifecycle } from './test-helpers.js';

test('legacy token-per-event IDs, hello replacement, metadata and lifecycle semantics remain unchanged', () => {
  const output: SessionObservation[] = []; const connections: string[] = [];
  const token = 'legacy-synthetic-token'; const session = new PiBridgeSession({ token, publish: o => output.push(o), connectionChanged: s => connections.push(s) });
  session.handle({ ...baseline(), token: 'wrong-synthetic-token' }); expect(output).toHaveLength(0);
  session.handle({ ...baseline(), token });
  session.handle({ ...lifecycle(2), status: 'completed', workId: 'work', token });
  session.handle({ ...lifecycle(2), status: 'error', token });
  session.handle({ ...baseline(3), providerSessionId: 'replacement', token });
  session.disconnected(); session.disconnected();
  expect(output.map(o => o.sessionId)).toEqual(['pi:process:session', 'pi:process:session', 'pi:process:replacement']);
  expect(output.map(o => o.status)).toEqual(['idle', 'completed', 'idle']);
  expect(output[1]).toMatchObject({ agentName: 'synthetic-name', projectName: 'synthetic-project', workId: 'work', revision: 2 });
  expect(connections).toEqual(['connected', 'connected', 'disconnected']);
  expect(parsePiBridgeMessage(baseline()).ok).toBe(false);
  expect(parsePiSessionMessage({ ...baseline(), token }).ok).toBe(false);
});
test('Main retains explicit development bridge and has no managed service or installation activation', async () => {
  const main = await readFile('apps/desktop/src/main/index.ts', 'utf8');
  expect(main).toContain('PiBridgeAdapter');
  expect(main).not.toMatch(/createManagedPiService|openManagedCore|adapter-pi\/managed/);
  const extension = await readFile('integrations/pi-extension/index.ts', 'utf8');
  expect(extension).toContain('AGENT_PET_PI_ENDPOINT'); expect(extension).toContain('AGENT_PET_PI_TOKEN');
  expect(extension).not.toMatch(/connectManagedPiClient|connectManagedCore/);
});
