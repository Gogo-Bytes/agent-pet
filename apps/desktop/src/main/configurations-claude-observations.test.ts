import './test-support/mock-volume-queries.js';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { applyObservation, createSessionState, type SessionObservation } from '@agent-pet/domain';
import { projectHomePets } from '../renderer/management/home-projection.js';
import { Configurations } from './configurations.js';
import * as native from '../../../../integrations/claude-hooks/native-presence.js';

vi.mock('../../../../integrations/claude-hooks/native-presence.js', async original => ({ ...await original<typeof import('../../../../integrations/claude-hooks/native-presence.js')>() }));
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.restoreAllMocks(); });

it('maps verified Claude callbacks through configuration identity, Application state, Home and retirement', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'pet-claude-observations-'))); fs.chmodSync(root, 0o700);
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = join(root, 'data'); fs.mkdirSync(directory, { mode: 0o700 });
  const servers: Parameters<typeof native.startClaudeNativePresenceServer>[0][] = [];
  vi.spyOn(native, 'startClaudeNativePresenceServer').mockImplementation(async options => {
    servers.push(options);
    return { url: 'http://127.0.0.1:12345/claude-native-presence', stop: async () => { options.onRetire?.('opaque-run'); options.onChange({ observedRuns: 0, launchers: 0 }); } };
  });
  let sessions = createSessionState(); const published: SessionObservation[] = [];
  const start = vi.fn();
  const collection = new Configurations({ directory, adapter: () => ({ start }),
    publish: observation => { published.push(observation); sessions = applyObservation(sessions, observation); },
    claude: { nodeExecutable: process.execPath, runAsNode: false, chooseExecutable: async () => '/owned/claude.exe', inspectExecutable: value => value,
      runtimeAssets: async () => ({ hook: '', launcher: '', nativeHook: '// explicit fixture; never executed' }),
      normal: { probePath: '/owned/probe', observerExecutable: process.execPath } } });
  cleanups.push(() => collection.stop());
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const targetPath = join(root, `claude-${i}`); fs.mkdirSync(targetPath, { mode: 0o700 });
    const state = await collection.create({ provider: 'claude', name: `Claude ${i}`, targetPath });
    const id = state.records.at(-1)!.id; ids.push(id);
    await collection.bindPet(id, { assetId: 'starter', name: '团子' });
    const preview = (await collection.preview(id)).records.at(-1)!.claude!.preview!;
    expect((await collection.confirm(id, preview.id)).records.at(-1)!.claude).toMatchObject({ status: 'waiting', scope: 'task-events' });
    const server = servers[i]!;
    server.onFact?.({ runId: 'opaque-run', fact: { kind: 'session-started', source: 'startup', providerSessionId: 'private-same-session' } });
    server.onChange({ observedRuns: 1, launchers: 1 });
    server.onFact?.({ runId: 'opaque-run', fact: { kind: 'turn-submitted', providerSessionId: 'private-same-session', promptId: 'private-prompt' } });
    server.onFact?.({ runId: 'opaque-run', fact: { kind: 'tool-succeeded', providerSessionId: 'private-same-session', promptId: 'private-prompt', toolCallId: 'private-tool', activity: 'reading' } });
  }
  expect(Object.keys(sessions.sessions)).toHaveLength(2);
  expect(Object.values(collection.snapshot().sessionConfigurations)).toEqual(ids);
  expect(projectHomePets(collection.snapshot(), sessions, '团子').map(pet => [pet.id, pet.action, pet.status])).toEqual(ids.map(id => [id, 'reading', '刚刚读取了文件']));
  expect(sessions.bubbles).toEqual([]); expect(JSON.stringify(published)).not.toMatch(/private-same-session|private-prompt|private-tool/);
  await collection.rename(ids[0]!, '新名字');
  servers[0]!.onFact?.({ runId: 'opaque-run', fact: { kind: 'turn-failed', providerSessionId: 'private-same-session', promptId: 'private-prompt', failure: 'unknown' } });
  expect(sessions.bubbles[0]?.name).toBe('新名字');
  expect(projectHomePets(collection.snapshot(), sessions, '团子')[0]).toMatchObject({ configuration: '新名字', action: 'error', status: '回答出错了' });
  await collection.disable(ids[0]!);
  expect(projectHomePets(collection.snapshot(), sessions, '团子').map(pet => pet.id)).toEqual([ids[1]]);
  expect(Object.values(sessions.sessions).filter(session => session.connected)).toHaveLength(1);
  expect(sessions.bubbles[0]?.status).toBe('error-unread');
  const length = published.length;
  servers[0]!.onFact?.({ runId: 'opaque-run', fact: { kind: 'turn-submitted', providerSessionId: 'private-same-session', promptId: 'late' } });
  expect(published).toHaveLength(length);
  expect(start).not.toHaveBeenCalled();
  await collection.stop(); expect(Object.values(sessions.sessions).every(session => session.connected === false)).toBe(true);
});
