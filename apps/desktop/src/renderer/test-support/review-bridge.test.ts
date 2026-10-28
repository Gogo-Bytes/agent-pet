import { expect, it } from 'vitest';
import { createReviewBridge } from './review-bridge.js';

it('offers an in-memory import preview, cancellation, one-use confirm and collection publication', async () => {
  const api = createReviewBridge('pet-import').petAssets!;
  const states: string[][] = [];
  const off = api.subscribe(state => states.push(state.records.map(asset => asset.id)));
  const first = await api.choose(); expect(first.ok).toBe(true);
  if (!first.ok) return;
  await api.cancel(first.preview.token);
  await expect(api.confirm(first.preview.token)).rejects.toThrow('重新选择');
  const next = await api.choose(); expect(next.ok).toBe(true);
  if (!next.ok) return;
  await api.confirm(next.preview.token);
  expect(states).toEqual([['starter', 'artist-pet']]);
  expect((await api.getState()).records.at(-1)?.id).toBe('artist-pet');
  await expect(api.confirm(next.preview.token)).rejects.toThrow('重新选择');
  expect(await api.choose()).toEqual({ ok: false, reason: 'duplicate' });
  off();
});
it('provides chooser and failed-install fixture states without real filesystem operations', async () => {
  expect(await createReviewBridge('pet-import-error').petAssets!.choose()).toEqual({ ok: false, reason: 'invalid-model' });
  const api = createReviewBridge('pet-import-residue').petAssets!;
  const next = await api.choose(); expect(next.ok).toBe(true);
  if (!next.ok) return;
  await expect(api.confirm(next.preview.token)).rejects.toThrow('残留已保留');
  expect((await api.getState()).records).toHaveLength(1);
});
