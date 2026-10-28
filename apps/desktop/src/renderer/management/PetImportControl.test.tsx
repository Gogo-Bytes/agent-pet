// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PetAssetsApi, PetImportInspection, PetImportPreview } from '../../shared/pet-assets.js';
import { PetImportControl } from './PetImportControl.js';

beforeEach(() => {
  for (const method of ['showModal', 'close'] as const) {
    if (!HTMLDialogElement.prototype[method]) Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, writable: true, value() {} });
  }
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const preview: PetImportPreview = { token: 'preview-token', manifest: { id: 'artist-pet', version: '1', model: 'pet.glb', license: 'CC0' }, modelBytes: 4096, avatar: 'fallback', avatarFile: null };
function fixture() {
  const api = {
    getState: vi.fn(), getModel: vi.fn(), getAvatar: vi.fn(), remove: vi.fn(), subscribe: vi.fn(),
    choose: vi.fn(async (): Promise<PetImportInspection> => ({ ok: true, preview })),
    confirm: vi.fn(async () => ({ version: 1 as const, records: [{ id: 'artist-pet', manifest: preview.manifest, source: 'imported' as const, importedAt: 'now' }] })),
    cancel: vi.fn(async () => {}),
  } satisfies PetAssetsApi;
  return { api, imported: vi.fn() };
}
async function mount(f = fixture()) {
  function Harness() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>添加宠物</button>
      {open && <PetImportControl api={f.api} disabled={false} onImported={f.imported} onClose={() => setOpen(false)} />}</>;
  }
  const view = render(<Harness />); const user = userEvent.setup();
  const opener = screen.getByRole('button', { name: '添加宠物' }); await user.click(opener);
  return { ...f, ...view, user, opener };
}
async function choose(f: Awaited<ReturnType<typeof mount>>) {
  await f.user.click(screen.getByRole('button', { name: '选择文件夹' }));
  await screen.findByRole('region', { name: '导入预览' });
}
it('opens an empty modal, focuses the folder chooser and only invokes the native picker explicitly', async () => {
  const f = await mount();
  expect(screen.getByRole('dialog', { name: '导入宠物' }).hasAttribute('open')).toBe(true);
  expect(f.api.choose).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '选择文件夹' }));
  expect(screen.queryByRole('button', { name: '确认导入' })).toBeNull();
  await choose(f);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '确认导入' }));
  expect(screen.getByText('pet.glb · 4 KB')).toBeTruthy();
  expect(screen.getByText('CC0')).toBeTruthy();
});
it('requires confirmation, selects the installed asset exactly once, closes and restores focus', async () => {
  const f = await mount(); await choose(f);
  expect(f.api.confirm).not.toHaveBeenCalled();
  const confirm = screen.getByRole('button', { name: '确认导入' });
  fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(() => expect(f.imported).toHaveBeenCalledWith('artist-pet'));
  expect(f.api.confirm).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(f.opener);
});
it.each(['cancel', 'close', 'escape', 'backdrop'] as const)('releases the preview on %s and restores its opener', async method => {
  const f = await mount(); await choose(f);
  const dialog = screen.getByRole('dialog');
  if (method === 'cancel') await f.user.click(screen.getByRole('button', { name: '取消' }));
  else if (method === 'close') await f.user.click(screen.getByRole('button', { name: '关闭导入弹窗' }));
  else if (method === 'escape') fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
  else fireEvent.click(dialog);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(f.api.cancel).toHaveBeenCalledWith(preview.token);
  expect(f.api.confirm).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(f.opener);
});
it('releases the old preview before reselecting and never confirms a cancelled native picker', async () => {
  const f = await mount(); await choose(f);
  f.api.choose.mockResolvedValueOnce({ ok: false, reason: 'cancelled' });
  await f.user.click(screen.getByRole('button', { name: '重新选择' }));
  expect(f.api.cancel).toHaveBeenCalledWith(preview.token);
  expect(f.api.cancel.mock.invocationCallOrder[0]).toBeLessThan(f.api.choose.mock.invocationCallOrder[1]!);
  expect(screen.queryByRole('region', { name: '导入预览' })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '选择文件夹' }));
  expect(f.api.confirm).not.toHaveBeenCalled();
});
it('releases a late picker response after closing and does not overwrite a reopened dialog', async () => {
  const f = fixture(); let finish!: (result: PetImportInspection) => void;
  f.api.choose.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = await mount(f);
  await view.user.click(screen.getByRole('button', { name: '选择文件夹' }));
  expect(screen.getByRole('status').textContent).toContain('正在读取');
  await view.user.click(screen.getByRole('button', { name: '取消' }));
  await view.user.click(view.opener);
  await act(async () => { finish({ ok: true, preview }); });
  expect(f.api.cancel).toHaveBeenCalledWith(preview.token);
  expect(screen.queryByRole('region', { name: '导入预览' })).toBeNull();
  expect(screen.getByRole('button', { name: '选择文件夹' }).hasAttribute('disabled')).toBe(false);
  expect(f.imported).not.toHaveBeenCalled();
});
it('releases previews on unmount (page change) and ignores late confirmation selection', async () => {
  const f = await mount(); await choose(f);
  let finish!: (state: Awaited<ReturnType<typeof f.api.confirm>>) => void;
  const installed = await f.api.confirm(); f.api.confirm.mockClear();
  f.api.confirm.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await f.user.click(screen.getByRole('button', { name: '确认导入' }));
  expect(screen.getByRole('button', { name: '取消' }).hasAttribute('disabled')).toBe(true);
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  f.unmount();
  await act(async () => { finish(installed); });
  expect(f.api.cancel).toHaveBeenCalledWith(preview.token);
  expect(f.imported).not.toHaveBeenCalled();
});
it('keeps a cancellation failure visible and allows cancellation to be retried', async () => {
  const f = await mount(); await choose(f);
  f.api.cancel.mockRejectedValueOnce(new Error('isolated IPC failure'));
  await f.user.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByRole('alert').textContent).toContain('取消未确认');
  expect(screen.getByRole('dialog')).toBeTruthy();
  await f.user.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(f.opener);
});
it('reports chooser errors inside the modal and allows retry', async () => {
  const f = fixture(); f.api.choose.mockResolvedValueOnce({ ok: false, reason: 'duplicate' });
  const view = await mount(f);
  await view.user.click(screen.getByRole('button', { name: '选择文件夹' }));
  expect(screen.getByRole('alert').textContent).toContain('已在收藏');
  await choose(view);
  expect(screen.queryByRole('alert')).toBeNull();
});
it('keeps failed-install residue disclosure in the modal and requires a new preview', async () => {
  const f = fixture(); f.api.confirm.mockRejectedValueOnce(new Error('已有文件或本次残留已保留'));
  const view = await mount(f); await choose(view);
  await view.user.click(screen.getByRole('button', { name: '确认导入' }));
  expect((await screen.findByRole('alert')).textContent).toContain('残留已保留');
  expect(f.imported).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '确认导入' })).toBeNull();
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '选择文件夹' }));
});
