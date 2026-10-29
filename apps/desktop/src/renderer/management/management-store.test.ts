import { expect, it, vi } from 'vitest';
import type { ConfigurationsState } from '../../shared/configurations.js';
import { createManagementStore } from './management-store.js';
import { projectHomePets } from './home-projection.js';
import { configuration, managementBridge } from './test-management.js';
import { initialConnection } from './test-connection.js';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
it('keeps the latest configuration connection cue across late initial replies and discarded subscriptions', async () => {
  const record = { ...configuration('first'), connection: { ...initialConnection, status: 'connected' as const }, connectionCue: 'connected:first:old' };
  const test = managementBridge([record]);
  const old = test.configs();
  let finish!: (value: ConfigurationsState) => void;
  test.bridge.configurations.getState.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const store = createManagementStore(test.bridge);
  const off = store.subscribe(vi.fn()); await flush();
  const oldListener = test.bridge.configurations.subscribe.mock.calls[0]![0];
  const next = { ...old, revision: 2, records: [{ ...record, id: 'second', connectionCue: 'connected:second:new' }] };
  test.pushConfigs(next); finish(old); await flush();
  const pets = () => { const snapshot = store.getSnapshot(); return projectHomePets(snapshot.configurations!, snapshot.sessions, '团子'); };
  expect(pets().map(pet => [pet.id, pet.connectionCue])).toEqual([['second', 'connected:second:new']]);
  off();
  const offAgain = store.subscribe(vi.fn()); await flush();
  oldListener(old);
  expect(pets().map(pet => [pet.id, pet.connectionCue])).toEqual([['second', 'connected:second:new']]);
  test.pushConfigs({ ...next, records: [] });
  expect(pets()).toEqual([]); offAgain();
});
