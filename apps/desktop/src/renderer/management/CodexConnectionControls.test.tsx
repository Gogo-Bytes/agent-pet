// @vitest-environment jsdom
import { type ReactNode } from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CodexConnectionState } from '../../shared/codex-connection.js';
import type { AgentConfiguration } from '../../shared/configurations.js';
import { ManagementApp } from './ManagementApp.js';
import { managementBridge, configuration } from './test-management.js';
import type { HomePet } from './CompanionScene.js';
vi.mock('./CompanionScene.js', () => ({ CompanionScene: ({ children, pets, page }: { children: ReactNode; pets: HomePet[]; page: string }) => <section aria-label="正式场景测试边界"><div hidden={page !== 'pets'}>{children}</div><div hidden={page !== 'home'}>{pets.map(pet => <span key={pet.id} data-pet={pet.id}>{pet.configuration}：{pet.status}</span>)}</div></section> }));
for (const method of ['showModal', 'close'] as const) if (!HTMLDialogElement.prototype[method])
  Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, writable: true, value() {} });
if (!HTMLElement.prototype.scrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, writable: true, value() {} });
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const initial: CodexConnectionState = { revision: 0, status: 'not-configured', configured: false, busy: false,
  observedSessions: 0, canConfigure: true, canResume: false, preview: null, notice: 'none' };
const preview = { id: 'codex-plan', executable: '/synthetic/codex', path: '/synthetic/.codex/hooks.json', canApply: true, exists: true, events: ['SessionStart','Stop'] };
async function mount(patch: Partial<CodexConnectionState> = {}) {
  const record: AgentConfiguration = { ...configuration('codex-one'), provider: 'codex', name: '我的 Codex', codex: { ...initial, ...patch } };
  const test = managementBridge([record]); const user = userEvent.setup();
  const update = (patch: Partial<CodexConnectionState>) => { const next = { ...test.configs(), revision: test.configs().revision + 1,
    records: test.configs().records.map(r => ({ ...r, codex: { ...r.codex!, ...patch } })) }; test.pushConfigs(next); return next; };
  test.bridge.configurations.preview.mockImplementation(async () => update({ preview }));
  test.bridge.configurations.cancel.mockImplementation(async () => update({ preview: null }));
  test.bridge.configurations.confirm.mockImplementation(async () => update({ preview: null, configured: true, canConfigure: false, status: 'waiting' }));
  test.bridge.configurations.disable.mockImplementation(async () => update({ status: 'disabled', canResume: true, observedSessions: 0 }));
  const view = render(<ManagementApp bridge={test.bridge} />); await act(async () => {});
  await user.click(screen.getByRole('tab', { name: '连接' })); return { ...test, ...view, update, user };
}
it('uses an exact additive preview, cancels and confirms without inventing an online pet', async () => {
  const test = await mount();
  await test.user.click(screen.getByRole('button', { name: '设置连接' }));
  let dialog = screen.getByRole('dialog', { name: '连接 Codex CLI' });
  expect(dialog.textContent).toContain('/synthetic/.codex/hooks.json'); expect(dialog.textContent).toContain('只追加 10 条通知');
  expect(test.bridge.configurations.confirm).not.toHaveBeenCalled();
  await test.user.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  await test.user.click(screen.getByRole('button', { name: '设置连接' })); dialog = screen.getByRole('dialog');
  await test.user.click(within(dialog).getByRole('button', { name: '确认并设置连接' }));
  expect(test.bridge.configurations.confirm).toHaveBeenCalledExactlyOnceWith('codex-one', 'codex-plan');
  expect(screen.getByRole('heading', { name: '等待首次任务' })).toBeTruthy();
  await test.user.click(screen.getByRole('tab', { name: '首页' }));
  expect(test.container.querySelector('[data-pet="codex-one"]')).toBeNull();
  await act(async () => { test.update({ status: 'observing', observedSessions: 1 }); });
  expect(test.container.querySelector('[data-pet="codex-one"]')).toBeTruthy();
});
it('blocks confirmation for invalid files and exposes reversible pause/resume/removal', async () => {
  const test = await mount();
  test.bridge.configurations.preview.mockImplementationOnce(async () => test.update({ preview: { ...preview, canApply: false } }));
  await test.user.click(screen.getByRole('button', { name: '设置连接' }));
  const dialog = screen.getByRole('dialog');
  expect((within(dialog).getByRole('button', { name: '确认并设置连接' }) as HTMLButtonElement).disabled).toBe(true);
  await test.user.click(within(dialog).getByRole('button', { name: '关闭连接预览' }));
  await act(async () => { test.update({ status: 'observing', configured: true, canConfigure: false, observedSessions: 1 }); });
  await test.user.click(screen.getByText('更多操作'));
  await test.user.click(screen.getByRole('button', { name: '暂停连接' }));
  expect(screen.getByRole('button', { name: '继续连接' })).toBeTruthy();
  await test.user.click(screen.getByRole('button', { name: '继续连接' }));
  expect(test.bridge.configurations.resume).toHaveBeenCalledExactlyOnceWith('codex-one');
  await test.user.click(screen.getByRole('button', { name: '移除连接' }));
  expect(screen.getByRole('dialog', { name: '移除此连接？' }).textContent).toContain('保留其他 hooks');
  await test.user.click(screen.getByRole('button', { name: '取消移除' }));
  expect(test.bridge.configurations.remove).not.toHaveBeenCalled();
});

it('does not send stale cancellation for a configured record after successful removal', async () => {
  const test = await mount({ status: 'observing', configured: true, canConfigure: false, observedSessions: 1 });
  await test.user.click(screen.getByText('更多操作'));
  await test.user.click(screen.getByRole('button', { name: '移除连接' }));
  await test.user.click(screen.getByRole('button', { name: '确认移除' }));
  expect(test.bridge.configurations.remove).toHaveBeenCalledExactlyOnceWith('codex-one');
  expect(test.bridge.configurations.cancel).not.toHaveBeenCalled();
});
