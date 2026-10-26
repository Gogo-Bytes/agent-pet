// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PetAssetsApi, PetImportInspection, PetImportPreview } from '../../shared/pet-assets.js';
import { PetImportControl } from './PetImportControl.js';

afterEach(cleanup);
const preview: PetImportPreview = { token: 'preview-token', manifest: { id: 'artist-pet', version: '1', model: 'pet.glb', license: 'CC0' }, modelBytes: 4096, avatar: 'fallback', avatarFile: null };
function fixture() {
  const api = {
    getState: vi.fn(), getModel: vi.fn(), getAvatar: vi.fn(), remove: vi.fn(), subscribe: vi.fn(),
    choose: vi.fn(async (): Promise<PetImportInspection> => ({ ok: true, preview })),
    confirm: vi.fn(async () => ({ version: 1 as const, records: [{ id: 'artist-pet', manifest: preview.manifest, source: 'imported' as const, importedAt: 'now' }] })),
    cancel: vi.fn(async () => {}),
  } satisfies PetAssetsApi;
  const imported = vi.fn();
  return { api, imported };
}
it('requires confirmation, selects the imported asset and prevents duplicate confirms', async () => {
  const f = fixture(); render(<PetImportControl api={f.api} disabled={false} onImported={f.imported} />);
  fireEvent.click(screen.getByRole('button', { name: '添加宠物' }));
  await screen.findByRole('region', { name: '导入预览' });
  expect(f.api.confirm).not.toHaveBeenCalled();
  const confirm = screen.getByRole('button', { name: '确认导入' });
  fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(() => expect(f.imported).toHaveBeenCalledWith('artist-pet'));
  expect(f.api.confirm).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('region', { name: '导入预览' })).toBeNull();
});
it('cancels explicit previews and previews abandoned by closing the drawer', async () => {
  const f = fixture(); const view = render(<PetImportControl api={f.api} disabled={false} onImported={f.imported} />);
  fireEvent.click(screen.getByRole('button', { name: '添加宠物' }));
  fireEvent.click(await screen.findByRole('button', { name: '取消导入' }));
  await waitFor(() => expect(f.api.cancel).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: '添加宠物' }));
  await screen.findByRole('region', { name: '导入预览' });
  view.unmount();
  expect(f.api.cancel).toHaveBeenCalledTimes(2);
  expect(f.api.confirm).not.toHaveBeenCalled();
});
it('cancels a picker response arriving after unmount', async () => {
  const f = fixture(); let finish!: (result: PetImportInspection) => void;
  f.api.choose.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<PetImportControl api={f.api} disabled={false} onImported={f.imported} />);
  fireEvent.click(screen.getByRole('button', { name: '添加宠物' })); view.unmount();
  await act(async () => { finish({ ok: true, preview }); });
  expect(f.api.cancel).toHaveBeenCalledWith(preview.token);
  expect(f.imported).not.toHaveBeenCalled();
});
it('shows failure without claiming import success and requires a fresh preview', async () => {
  const f = fixture(); f.api.confirm.mockRejectedValueOnce(new Error('已有文件或本次残留已保留'));
  render(<PetImportControl api={f.api} disabled={false} onImported={f.imported} />);
  fireEvent.click(screen.getByRole('button', { name: '添加宠物' }));
  fireEvent.click(await screen.findByRole('button', { name: '确认导入' }));
  expect((await screen.findByRole('alert')).textContent).toContain('残留已保留');
  expect(f.imported).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '确认导入' })).toBeNull();
});
