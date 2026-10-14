import net from 'node:net';
import { once } from 'node:events';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { PiBridgeAdapter } from '@agent-pet/adapter-pi';
import { createApplication } from '@agent-pet/application';
import { Configurations } from './configurations.js';
import type { PiBridgeConfig } from './pi-config.js';
import { projectHomePets } from '../renderer/management/home-projection.js';

it('keeps home pets online for remaining peers and isolates configuration departure with real receivers', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pet-config-peers-')));
  const directory = join(root, 'data'); await mkdir(directory, { mode: 0o700 });
  const adapter = new PiBridgeAdapter(), start = vi.spyOn(adapter, 'start');
  const app = createApplication([adapter]);
  const collection = new Configurations({ directory, adapter: () => adapter, publish: app.observe });
  const peers: net.Socket[] = [], ids: string[] = [], configs: PiBridgeConfig[] = [];
  const pets = () => projectHomePets(collection.snapshot(), app.snapshot(), '小伙伴');
  async function connect(config: PiBridgeConfig, processInstanceId: string) {
    const socket = net.connect(config.endpoint); peers.push(socket); socket.on('error', () => {});
    await once(socket, 'connect');
    let seq = 0;
    function send(status: 'idle' | 'working' | 'completed') {
      socket.write(JSON.stringify({ type: seq ? 'lifecycle' : 'hello', schemaVersion: 1, token: config.token,
        seq: ++seq, processInstanceId, providerSessionId: 'same-session', status, sentAt: '2026-10-14T00:00:00Z' }) + '\n');
    }
    send('idle'); return { socket, send };
  }
  async function disconnect(socket: net.Socket) { const closed = once(socket, 'close'); socket.end(); await closed; }
  try {
    for (const name of ['first', 'second']) {
      const target = join(root, name); await mkdir(target, { mode: 0o700 });
      const id = (await collection.create({ name, provider: 'pi', targetPath: target })).records.at(-1)!.id;
      ids.push(id);
      const plan = (await collection.preview(id)).records.find(record => record.id === id)!.connection!.preview!;
      expect(plan.action).toBe('create');
      await collection.confirm(id, plan.id);
      configs.push(start.mock.calls.at(-1)![0] as PiBridgeConfig);
    }
    expect(pets()).toEqual([]); // A listening/deployed receiver does not prove Agent online.
    const first = await connect(configs[0]!, 'same-process');
    const second = await connect(configs[0]!, 'second-process');
    const other = await connect(configs[1]!, 'same-process');
    await vi.waitFor(() => expect(Object.keys(app.snapshot().sessions)).toHaveLength(3));
    expect(pets().map(pet => pet.id)).toEqual(ids);
    first.send('completed'); second.send('working'); other.send('working');
    await vi.waitFor(() => expect(app.snapshot().bubbles).toHaveLength(3));
    await disconnect(first.socket);
    second.send('completed');
    await vi.waitFor(() => expect(app.snapshot().sessions[`${ids[0]}:pi:second-process:same-session`]?.status).toBe('completed'));
    expect(pets().map(pet => [pet.id, pet.action])).toEqual([[ids[0], 'Success'], [ids[1], 'Work']]);
    await disconnect(second.socket);
    await vi.waitFor(() => expect(pets().map(pet => pet.id)).toEqual([ids[1]]));
    expect(app.snapshot().bubbles.filter(bubble => bubble.status === 'error-unread')).toEqual([]);
    expect(app.snapshot().bubbles).toHaveLength(3); // Offline does not acknowledge or rewrite task results.
    expect((await collection.remove(ids[0]!)).notice).toBe('none');
    expect(pets().map(pet => pet.id)).toEqual([ids[1]]);
    other.send('completed');
    await vi.waitFor(() => expect(pets()[0]?.action).toBe('Success'));
    expect(collection.snapshot().sessionConfigurations).toEqual({ [`${ids[1]}:pi:same-process:same-session`]: ids[1] });
    await disconnect(other.socket);
    await vi.waitFor(() => expect(pets()).toEqual([]));
  } finally {
    for (const socket of peers) socket.destroy();
    await collection.stop();
    // Every runtime here was created by this test's consented deployment, after all receivers stopped.
    for (const config of configs) await rm(dirname(config.endpoint), { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  }
});
