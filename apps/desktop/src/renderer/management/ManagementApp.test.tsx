// @vitest-environment jsdom
import { useEffect, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagementState } from '../../shared/preferences.js';
import type { PreflightState } from '../../shared/pi-preflight.js';
import { initialPreflight } from './test-preflight.js';
import { ManagementApp } from './ManagementApp.js';
import { configuration, managementBridge } from './test-management.js';
import { initialConnection } from './test-connection.js';

// Only Three/WebGL is substituted. Real page controls, dialogs, request owner and store execute.
vi.mock('./CompanionScene.js', () => ({ CompanionScene: ({ children, page, onClips }: {
  children: ReactNode; page: string; onClips: (clips: string[]) => void;
}) => { useEffect(() => onClips(['Idle', 'Work', 'Success', 'Error']), [onClips]);
  return <section aria-label="正式场景测试边界"><div hidden={page !== 'pets'}>{children}</div></section>; } }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => {});
});
for (const method of ['showModal', 'close'] as const) {
  if (!HTMLDialogElement.prototype[method]) Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, writable: true, value() {} });
}
if (!HTMLElement.prototype.scrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, writable: true, value() {} });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount(records = [configuration()], supported = false) {
  const test = managementBridge(records, supported);
  const view = render(<ManagementApp bridge={test.bridge} />);
  await act(async () => {});
  return { ...test, ...view, user: userEvent.setup() };
}
async function page(user: ReturnType<typeof userEvent.setup>, name: string) { await user.click(screen.getByRole('tab', { name })); }
async function category(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(screen.getByRole('navigation', { name: '设置分类' })).getByRole('button', { name: new RegExp(name) }));
}
const flush = async () => { await act(async () => {}); };

describe('ManagementApp formal four-page interface', () => {
  it('edits the pet name at its outside heading with validation, failure recovery, Enter and Escape', async () => {
    const test = await mount(); await page(test.user, '宠物');
    const heading = screen.getByRole('heading', { name: '团子' });
    const trigger = within(heading).getByRole('button', { name: '修改宠物名称' });
    await test.user.click(trigger);
    let input = screen.getByRole('textbox', { name: '宠物名称' });
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('maxlength')).toBe('40');
    await test.user.clear(input);
    expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(true);
    await test.user.type(input, '  新名字  ');
    test.bridge.updatePreferences.mockRejectedValueOnce(new Error('isolated failure'));
    await test.user.click(screen.getByRole('button', { name: '保存' }));
    expect((screen.getByRole('textbox', { name: '宠物名称' }) as HTMLInputElement).value).toBe('  新名字  ');
    expect(screen.getByRole('alert').textContent).toContain('请求失败');
    await test.user.type(input, '{Enter}');
    expect(test.bridge.updatePreferences).toHaveBeenLastCalledWith({ petName: '新名字' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '修改宠物名称' })));
    await test.user.click(screen.getByRole('button', { name: '修改宠物名称' }));
    input = screen.getByRole('textbox', { name: '宠物名称' });
    await test.user.clear(input); await test.user.type(input, '取消的名称{Escape}');
    expect(screen.getByRole('heading', { name: '新名字' })).toBeTruthy();
    expect(test.bridge.updatePreferences).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '修改宠物名称' })));
    await test.user.click(screen.getByRole('button', { name: '打开宠物收藏' }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: '修改宠物名称' })).toBeNull();
  });
  it.each(['button', 'escape', 'backdrop'] as const)('keeps the glass collection modal until its %s exit completes, then restores focus', async method => {
    const test = await mount(); await page(test.user, '宠物');
    const opener = screen.getByRole('button', { name: '打开宠物收藏' });
    await test.user.click(opener);
    const dialog = screen.getByRole('dialog', { name: '宠物收藏' });
    expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: '搜索宠物' }));
    const panel = dialog.querySelector('.glass-drawer-panel')!;
    expect(panel.classList.contains('glass-panel')).toBe(true);
    if (method === 'button') await test.user.click(within(dialog).getByRole('button', { name: '关闭弹窗' }));
    else if (method === 'escape') fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
    else fireEvent.click(dialog);
    expect(dialog.getAttribute('data-closing')).toBe('true');
    expect(dialog.hasAttribute('open')).toBe(true);
    const end = new Event('animationend', { bubbles: true });
    Object.defineProperty(end, 'animationName', { value: 'glass-drawer-out' });
    fireEvent(panel, end);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
  it('closes collection immediately with reduced motion and falls back when animationend is lost', async () => {
    const test = await mount(); await page(test.user, '宠物');
    act(() => test.pushState({ ...test.state(), preferences: { ...test.state().preferences, reduced: true } }));
    await test.user.click(screen.getByRole('button', { name: '打开宠物收藏' }));
    await test.user.click(screen.getByRole('button', { name: '关闭弹窗' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => test.pushState({ ...test.state(), preferences: { ...test.state().preferences, reduced: false } }));
    await test.user.click(screen.getByRole('button', { name: '打开宠物收藏' }));
    await test.user.click(screen.getByRole('button', { name: '关闭弹窗' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '打开宠物收藏' }));
  });
  it('distinguishes persisted disablement after restart, resumes only explicitly and retains failure reasons', async () => {
    const record = { ...configuration(), connection: { ...initialConnection, canConfigure: false, canResume: true, canRemove: true,
      deployedPath: '/isolated/project-one/extensions/agent-pet.ts', status: 'disconnected' as const,
      saved: 'disabled' as const, notice: 'resume-required' as const } };
    const test = await mount([record]); await page(test.user, '连接');
    expect(screen.getByRole('heading', { name: '已暂停' })).toBeTruthy();
    await test.user.click(screen.getByText('更多操作', { exact: true }));
    await test.user.click(screen.getByRole('button', { name: '检查位置' }));
    expect(test.bridge.configurations.inspect).toHaveBeenCalledExactlyOnceWith(record.id);
    expect(screen.getByRole('heading', { name: '已暂停' })).toBeTruthy();
    expect(screen.queryByText(/尚未读取目标|仅点击恢复才校验/)).toBeNull();
    expect(test.bridge.configurations.resume).not.toHaveBeenCalled();
    await test.user.click(screen.getByRole('button', { name: '继续连接' }));
    expect(test.bridge.configurations.resume).toHaveBeenCalledExactlyOnceWith(record.id);
    await act(async () => test.pushConfigs({ ...test.configs(), records: [{ ...record, connection: { ...record.connection,
      saved: 'ready', notice: 'none', status: 'configured-waiting', receiving: 'active', canResume: false } }] }));
    expect(screen.queryByText(/已保存停用/)).toBeNull();
    await act(async () => test.pushConfigs({ ...test.configs(), records: [{ ...record, connection: { ...record.connection,
      notice: 'resume-refused', status: 'failed' } }] }));
    expect(screen.getByRole('alert').textContent).toContain('暂时无法重新连接');
    await test.user.click(screen.getByText('查看详细原因'));
    expect(screen.getByText(/恢复被拒绝：原运行目录或扩展已缺失/)).toBeTruthy();
    expect(screen.queryByText(/已保存停用/)).toBeNull();
  });
  it('leads with reconnect rather than an unchecked location and never resumes on page open', async () => {
    const record = { ...configuration(), name: 'pi 默认配置', availability: 'unchecked' as const,
      connection: { ...initialConnection, canConfigure: false, canResume: true, canRemove: true,
        deployedPath: '/isolated/project-one/extensions/agent-pet.ts', saved: 'ready' as const,
        status: 'disconnected' as const, notice: 'resume-required' as const } };
    const test = await mount([record]); await page(test.user, '连接');
    expect(screen.getByRole('heading', { name: '等待重新连接' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新连接' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '暂停连接' })).toBeNull();
    expect(test.container.querySelector('.cfg-more-options')?.hasAttribute('open')).toBe(false);
    expect(test.container.querySelector('.cfg-index-state')).toBeNull();
    // jsdom's role queries do not model the hidden body of native details.
    expect(screen.getByRole('button', { name: '更换位置' }).closest('details')?.open).toBe(false);
    await test.user.click(screen.getByText('更多操作', { exact: true }));
    expect(screen.getByRole('button', { name: '更换位置' }).hasAttribute('disabled')).toBe(true);
    expect(test.bridge.configurations.resume).not.toHaveBeenCalled();
    expect(test.bridge.configurations.inspect).not.toHaveBeenCalled();
    await test.user.click(screen.getByRole('button', { name: '重新连接' }));
    expect(test.bridge.configurations.resume).toHaveBeenCalledExactlyOnceWith(record.id);
  });
  it('shows actual connection, loading guidance and uncertain errors independently of location availability', async () => {
    const record = { ...configuration(), connection: { ...initialConnection, canConfigure: false, canRemove: true,
      status: 'configured-waiting' as const, receiving: 'active' as const, saved: 'ready' as const } };
    const test = await mount([record]); await page(test.user, '连接');
    expect(screen.getByRole('heading', { name: '等待 pi' })).toBeTruthy();
    expect(screen.getByText(/如果它已经在运行，请在空闲时输入 \/reload/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '暂停连接' }).closest('details')?.open).toBe(false);
    await test.user.click(screen.getByText('更多操作', { exact: true }));
    await test.user.click(screen.getByRole('button', { name: '暂停连接' }));
    expect(test.bridge.configurations.disable).toHaveBeenCalledExactlyOnceWith(record.id);
    act(() => test.pushConfigs({ ...test.configs(), records: [{ ...record, connection: { ...record.connection, status: 'connected' } }] }));
    expect(screen.getByRole('heading', { name: '已连接' })).toBeTruthy();
    act(() => test.pushConfigs({ ...test.configs(), records: [{ ...record, connection: { ...record.connection,
      status: 'connected', receiving: 'unknown', notice: 'stop-failed' } }] }));
    expect(screen.queryByRole('heading', { name: '已连接' })).toBeNull();
    expect(screen.getByRole('heading', { name: '连接需要处理' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('未能确认连接是否暂停');
    expect(screen.getByRole('button', { name: '尝试暂停连接' })).toBeTruthy();
  });
  it('keeps a separate write confirmation and blocks same-name files after the copy change', async () => {
    const preview = { id: 'review-plan', path: '/isolated/project-one/extensions/agent-pet.ts',
      target: { path: '/isolated/project-one', source: 'chosen' as const }, action: 'create' as const, findings: [], createDirectories: [] };
    const record = { ...configuration(), connection: { ...initialConnection, preview } };
    const test = await mount([record]); await page(test.user, '连接');
    const review = screen.getByRole('region', { name: '连接设置预览' });
    expect(review.textContent).toContain(preview.path);
    expect(review.textContent).toContain('不覆盖文件或改动 pi 设置');
    expect(test.bridge.configurations.confirm).not.toHaveBeenCalled();
    await test.user.click(within(review).getByRole('button', { name: '确认并连接' }));
    expect(test.bridge.configurations.confirm).toHaveBeenCalledExactlyOnceWith(record.id, preview.id);
    act(() => test.pushConfigs({ ...test.configs(), records: [{ ...record, connection: { ...record.connection,
      preview: { ...preview, action: 'blocked', findings: ['existing-extension'] } } }] }));
    expect(screen.getByRole('heading', { name: '已有同名文件' })).toBeTruthy();
    expect(screen.getByText('原文件会保留，请先确认它的来源。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '确认并连接' })).toBeNull();
    await test.user.click(screen.getByRole('button', { name: '返回详情' }));
    expect(test.bridge.configurations.cancel).toHaveBeenCalledExactlyOnceWith(record.id);
    expect(test.bridge.configurations.confirm).toHaveBeenCalledTimes(1);
  });
  it('gives a real recovery route after receiver start failure and scopes stale-preview wording to this attempt', async () => {
    const record = { ...configuration(), connection: { ...initialConnection, status: 'failed' as const,
      canConfigure: false, canResume: false, canRemove: true, receiving: 'stopped' as const, notice: 'start-failed' as const,
      deployedPath: '/isolated/project-one/extensions/agent-pet.ts' } };
    const test = await mount([record]); await page(test.user, '连接');
    expect(screen.getByRole('alert').textContent).toContain('重新打开 Agent Pet 后重试，或移除此连接');
    expect(screen.queryByRole('button', { name: '重新连接' })).toBeNull();
    expect(screen.getByRole('button', { name: '移除连接' })).toBeTruthy();
    act(() => test.pushConfigs({ ...test.configs(), records: [{ ...record, connection: { ...record.connection,
      status: 'connected', receiving: 'active', saved: 'ready', notice: 'invalid-plan' } }] }));
    expect(screen.getByRole('heading', { name: '已连接' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('本次没有添加新的连接文件');
  });
  it('keeps page navigation accessible with native controls and omits duplicate HTML controls', async () => {
    const test = managementBridge(undefined, false, true);
    render(<ManagementApp bridge={test.bridge} />);
    await act(async () => {});
    expect(screen.queryByRole('group', { name: '窗口操作' })).toBeNull();
    const user = userEvent.setup();
    await page(user, '设置');
    expect(screen.getByRole('navigation', { name: '设置分类' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Agent Pet/ }));
    expect(screen.getByRole('tab', { name: '首页' }).getAttribute('aria-selected')).toBe('true');
    expect(test.bridge.windowAction).not.toHaveBeenCalled();
  });
  it('places usable window controls in the shared titlebar and reports host failures', async () => {
    const test = await mount();
    const controls = screen.getByRole('group', { name: '窗口操作' });
    await test.user.click(within(controls).getByRole('button', { name: '最小化窗口' }));
    await test.user.click(within(controls).getByRole('button', { name: '最大化或还原窗口' }));
    expect(test.bridge.windowAction.mock.calls).toEqual([['minimize'], ['toggle-maximize']]);
    test.bridge.windowAction.mockRejectedValueOnce(new Error('IPC failed'));
    await test.user.click(within(controls).getByRole('button', { name: '关闭窗口' }));
    expect(screen.getByRole('alert').textContent).toContain('窗口操作失败');
  });
  it('keeps four page owners and one shared state subscription, with honest empty and real asset collection states', async () => {
    const test = await mount([]);
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['首页', '宠物', '连接', '设置']);
    expect(screen.getByRole('tab', { name: '首页' }).getAttribute('aria-selected')).toBe('true');
    await page(test.user, '连接');
    expect(screen.getByRole('heading', { name: '从第一个连接开始' })).toBeTruthy();
    await page(test.user, '宠物');
    await test.user.click(screen.getByRole('button', { name: '打开宠物收藏' }));
    expect(screen.getByRole('dialog', { name: '宠物收藏' })).toBeTruthy();
    expect(screen.getByText(/导入文件夹需包含 pet.json 和 pet.glb/)).toBeTruthy();
    await test.user.click(screen.getByRole('button', { name: '关闭弹窗' }));
    await page(test.user, '设置');
    expect(screen.getByRole('heading', { name: '场景渲染' })).toBeTruthy();
    expect(test.bridge.getState).toHaveBeenCalledOnce();
    expect(test.bridge.configurations.getState).toHaveBeenCalledOnce();
    expect(test.bridge.getSessions).toHaveBeenCalledOnce();
    expect(test.listenerCounts()).toEqual([1, 1, 1]);
    expect(test.bridge.piPreflight.detect).not.toHaveBeenCalled();
    expect(test.bridge.updatePreferences).not.toHaveBeenCalled();
  });
  it('reports an initial state read failure and recovers through an explicit retry', async () => {
    const test = managementBridge(); test.bridge.getState.mockRejectedValueOnce(Error('IPC failure'));
    render(<ManagementApp bridge={test.bridge} />); await flush();
    expect(screen.getByRole('alert').textContent).toContain('无法读取应用状态');
    await userEvent.click(screen.getByRole('button', { name: '重新读取' })); await flush();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(test.bridge.getState).toHaveBeenCalledTimes(2);
  });
  it('does not replace a newer authoritative push with a late initial reply', async () => {
    const test = managementBridge(); let finish!: (value: ManagementState) => void;
    test.bridge.getState.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<ManagementApp bridge={test.bridge} />); await flush();
    const old = test.state();
    act(() => test.pushState({ ...old, preferences: { ...old.preferences, petName: '新名称', pauseHidden: false } }));
    await act(async () => finish(old));
    const user = userEvent.setup(); await page(user, '宠物');
    expect(screen.getByRole('heading', { name: '新名称' })).toBeTruthy();
    await page(user, '设置');
    expect(screen.getByRole('switch', { name: '隐藏时暂停渲染' }).getAttribute('aria-checked')).toBe('false');
  });
  it('retains confirmed settings after persistence failure and recovers from an external push', async () => {
    const test = await mount(); await page(test.user, '设置');
    test.bridge.updatePreferences.mockResolvedValueOnce({ ...test.state(), preferenceError: '偏好保存失败，未应用更改' });
    await test.user.click(screen.getByRole('switch', { name: '隐藏时暂停渲染' }));
    expect(screen.getByRole('alert').textContent).toContain('未应用更改');
    expect(screen.getByRole('switch', { name: '隐藏时暂停渲染' }).getAttribute('aria-checked')).toBe('true');
    act(() => test.pushState({ ...test.state(), preferenceError: null, preferences: { ...test.state().preferences, pauseHidden: false } }));
    await page(test.user, '首页'); await page(test.user, '设置');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('switch', { name: '隐藏时暂停渲染' }).getAttribute('aria-checked')).toBe('false');
  });
  it('continues a committed setting save across navigation and prevents a second simultaneous action', async () => {
    const test = await mount(); await page(test.user, '设置');
    let finish!: (state: ManagementState) => void;
    test.bridge.updatePreferences.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await test.user.click(screen.getByRole('switch', { name: '隐藏时暂停渲染' }));
    expect(screen.getByRole('switch', { name: '隐藏时暂停渲染' }).hasAttribute('disabled')).toBe(true);
    await page(test.user, '宠物'); await page(test.user, '连接');
    const next = { ...test.state(), preferences: { ...test.state().preferences, pauseHidden: false } };
    await act(async () => { test.pushState(next); finish(next); });
    await page(test.user, '设置');
    expect(screen.getByRole('switch', { name: '隐藏时暂停渲染' }).getAttribute('aria-checked')).toBe('false');
    expect(test.bridge.updatePreferences).toHaveBeenCalledExactlyOnceWith({ pauseHidden: false });
  });
  it('resets preferences while retaining configuration identities, bindings and pet name', async () => {
    const test = await mount(); await page(test.user, '设置');
    const original = test.configs();
    await test.user.click(screen.getByRole('button', { name: '恢复默认' }));
    await test.user.click(screen.getByRole('button', { name: '确认恢复' })); await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(test.bridge.updatePreferences.mock.calls[0]?.[0]).not.toHaveProperty('petName');
    expect(test.bridge.updatePreferences.mock.calls[0]?.[0]).not.toHaveProperty('schemaVersion');
    expect(test.configs()).toBe(original);
    expect(test.state().preferences.petName).toBe('团子');
    expect(test.bridge.configurations.remove).not.toHaveBeenCalled();
  });
  it('keeps failed reset reviewable in its dialog and allows cancel with no configuration changes', async () => {
    const test = await mount(); await page(test.user, '设置');
    test.bridge.updatePreferences.mockRejectedValueOnce(Error('disk full'));
    await test.user.click(screen.getByRole('button', { name: '恢复默认' }));
    const dialog = screen.getByRole('dialog');
    await test.user.click(within(dialog).getByRole('button', { name: '确认恢复' }));
    expect(within(dialog).getByRole('alert').textContent).toContain('恢复默认失败');
    await test.user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(test.bridge.configurations.remove).not.toHaveBeenCalled();
  });
  it('uses explicit login opt-in and reports returned OS failure without optimistic success', async () => {
    const test = await mount(undefined, true); await page(test.user, '设置'); await category(test.user, '软件');
    test.bridge.setLogin.mockResolvedValueOnce({ ...test.state(), login: { supported: true, enabled: false, error: '系统未应用登录项更改' } });
    await test.user.click(screen.getByRole('switch', { name: '登录时启动' }));
    expect(test.bridge.setLogin).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.getByRole('alert').textContent).toContain('系统未应用');
    expect(screen.getByRole('switch', { name: '登录时启动' }).getAttribute('aria-checked')).toBe('false');
  });
  it('renames the selected independent configuration with Enter, validates blank names and cancels with Escape', async () => {
    const test = await mount([configuration('one'), configuration('two')]); await page(test.user, '连接');
    await test.user.click(screen.getByRole('button', { name: /配置 two pi/ }));
    await test.user.click(screen.getByRole('button', { name: '重命名' }));
    const input = screen.getByRole('textbox', { name: '配置名称' });
    expect(input.getAttribute('maxlength')).toBe('40');
    await test.user.clear(input); await test.user.type(input, '   ');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(true);
    await test.user.keyboard('{Escape}');
    expect(test.bridge.configurations.rename).not.toHaveBeenCalled();
    await test.user.click(screen.getByRole('button', { name: '重命名' }));
    await test.user.clear(screen.getByRole('textbox', { name: '配置名称' }));
    await test.user.type(screen.getByRole('textbox', { name: '配置名称' }), '项目二{Enter}');
    expect(test.bridge.configurations.rename).toHaveBeenCalledExactlyOnceWith('two', '项目二');
    expect(screen.getByRole('heading', { name: '项目二' })).toBeTruthy();
    expect(test.configs().records[0]?.name).toBe('配置 one');
  });
  it('removes invalid leading whitespace from a pasted absolute path before requesting Main approval', async () => {
    const test = await mount([]); await page(test.user, '连接');
    await test.user.click(screen.getByRole('button', { name: '手动添加' }));
    const dialog = screen.getByRole('dialog', { name: '手动添加' });
    const path = '/isolated/Claude folder ';
    test.bridge.locations.authorize.mockImplementationOnce(async value => {
      if (value !== path) throw new Error('Invalid absolute path');
      return value;
    });
    await test.user.type(within(dialog).getByRole('textbox', { name: '配置文件夹' }), `  ${path}`);
    await test.user.click(within(dialog).getByRole('button', { name: '验证配置' }));
    expect(test.bridge.locations.authorize).toHaveBeenCalledExactlyOnceWith(path);
    expect(within(dialog).getByRole('combobox', { name: 'Agent 类型' })).toBeTruthy();
    expect(within(dialog).getByText(path, { exact: true, normalizer: value => value })).toBeTruthy();
    expect(test.bridge.configurations.create).not.toHaveBeenCalled();
  });
  it('explains an incomplete path without requesting access or reporting a permissions failure', async () => {
    const test = await mount([]); await page(test.user, '连接');
    await test.user.click(screen.getByRole('button', { name: '手动添加' }));
    const dialog = screen.getByRole('dialog', { name: '手动添加' });
    await test.user.type(within(dialog).getByRole('textbox', { name: '配置文件夹' }), '~/.claude');
    await test.user.click(within(dialog).getByRole('button', { name: '验证配置' }));
    expect(within(dialog).getByRole('alert').textContent).toContain('以 / 开头');
    expect(test.bridge.locations.authorize).not.toHaveBeenCalled();
  });
  it('blocks a duplicate manual configuration and returns to the same path selection for recovery', async () => {
    const test = await mount(); await page(test.user, '连接');
    test.bridge.locations.choose.mockResolvedValueOnce('/isolated/project-one');
    await test.user.click(screen.getByRole('button', { name: '手动添加' }));
    const dialog = screen.getByRole('dialog', { name: '手动添加' });
    await test.user.click(within(dialog).getByRole('button', { name: '选择位置' }));
    await test.user.click(within(dialog).getByRole('button', { name: '验证配置' }));
    await test.user.selectOptions(within(dialog).getByRole('combobox', { name: 'Agent 类型' }), 'pi');
    expect(within(dialog).getByRole('alert').textContent).toContain('已添加');
    expect(within(dialog).getByRole('button', { name: '下一步' }).hasAttribute('disabled')).toBe(true);
    await test.user.click(within(dialog).getByRole('button', { name: '上一步' }));
    expect((within(dialog).getByRole('textbox', { name: '配置文件夹' }) as HTMLInputElement).value).toBe('/isolated/project-one');
    expect(test.bridge.configurations.create).not.toHaveBeenCalled();
  });
  it('saves an explicitly selected unsupported type as metadata and never presents it as online', async () => {
    const test = await mount([]); await page(test.user, '连接');
    await test.user.click(screen.getByRole('button', { name: '手动添加' }));
    let dialog = screen.getByRole('dialog', { name: '手动添加' });
    await test.user.click(within(dialog).getByRole('button', { name: '选择位置' }));
    await test.user.click(within(dialog).getByRole('button', { name: '验证配置' }));
    await test.user.selectOptions(within(dialog).getByRole('combobox', { name: 'Agent 类型' }), 'gemini');
    expect(within(dialog).getByRole('status').textContent).toContain('暂时还不能连接');
    await test.user.click(within(dialog).getByRole('button', { name: '下一步' }));
    await test.user.clear(within(dialog).getByRole('textbox', { name: '配置名称' }));
    await test.user.type(within(dialog).getByRole('textbox', { name: '配置名称' }), '工作 Gemini');
    await test.user.click(within(dialog).getByRole('button', { name: '添加配置' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(test.bridge.configurations.create).toHaveBeenCalledExactlyOnceWith({ name: '工作 Gemini', provider: 'gemini', targetPath: '/isolated/new-project' });
    expect(screen.getByRole('heading', { name: '暂不支持连接' })).toBeTruthy();
    expect(test.bridge.configurations.confirm).not.toHaveBeenCalled();
  });
  it('discards a manual verification response after cancellation and opens a clean wizard on retry', async () => {
    const test = await mount([]); await page(test.user, '连接');
    await test.user.click(screen.getByRole('button', { name: '手动添加' }));
    const dialog = screen.getByRole('dialog', { name: '手动添加' });
    await test.user.click(within(dialog).getByRole('button', { name: '选择位置' }));
    await test.user.click(within(dialog).getByRole('button', { name: '验证配置' }));
    await test.user.selectOptions(within(dialog).getByRole('combobox', { name: 'Agent 类型' }), 'pi');
    let finish!: (value: { target: typeof initialPreflight.target; findings: [] }) => void;
    test.bridge.locations.inspect.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await test.user.click(within(dialog).getByRole('button', { name: '重新检查' }));
    expect(within(dialog).getByRole('status').textContent).toContain('正在识别并验证');
    await test.user.click(within(dialog).getByRole('button', { name: '关闭手动配置' }));
    await act(async () => finish({ target: initialPreflight.target, findings: [] }));
    expect(test.bridge.configurations.create).not.toHaveBeenCalled();
    await test.user.click(screen.getByRole('button', { name: '手动添加' }));
    expect(screen.getByRole('heading', { name: '选择你的配置位置' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: '配置文件夹' }) as HTMLInputElement).value).toBe('');
  });
  it('discovers a verified Codex CLI and routes one-click setup through the Codex preview', async () => {
    const test = await mount([]); await page(test.user, '连接');
    test.bridge.configurations.detectCodex.mockResolvedValueOnce({
      installations: [{ id: 'codex-standalone', entryPath: '/isolated/.codex/packages/standalone/current/bin/codex', executable: '/isolated/.codex/packages/standalone/releases/0.163.0-aarch64-apple-darwin/bin/codex', kind: 'standalone', version: null, compatibility: 'verified' }],
      targetPath: '/isolated/.codex', scan: 'complete', notice: 'none',
    });
    await test.user.click(screen.getByRole('button', { name: '自动扫描' }));
    expect(screen.getByRole('heading', { name: 'Codex CLI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '一键配置' })).toBeTruthy();
    await test.user.click(screen.getByRole('button', { name: '一键配置' }));
    expect(screen.getByRole('dialog', { name: '连接 Codex CLI' })).toBeTruthy();
    await test.user.click(screen.getByRole('button', { name: '检查并预览' }));
    expect(test.bridge.configurations.prepareDetectedCodex).toHaveBeenCalledExactlyOnceWith('codex-standalone', expect.any(String));
    expect(test.bridge.configurations.prepareDetectedClaude).not.toHaveBeenCalled();
  });
  it('reports limited discovery without implying the entire machine has been scanned', async () => {
    const test = await mount([]); await page(test.user, '连接');
    test.bridge.piPreflight.detect.mockResolvedValueOnce({ ...initialPreflight, scan: 'limited', installations: [] });
    await test.user.click(screen.getByRole('button', { name: '自动扫描' }));
    expect(screen.getByText('扫描范围受限，结果可能不完整。可以重新扫描或手动选择配置位置。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新扫描' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '手动添加' })).toBeTruthy();
  });
  it('groups pi installations sharing a default and prepares configuration without the manual wizard', async () => {
    const test = await mount([]); await page(test.user, '连接');
    const installs = ['node22', 'node24'].map(id => ({ id, path: `/synthetic/${id}/bin/pi`, version: '0.85.1', compatibility: 'verified-0.85.1' as const }));
    test.bridge.piPreflight.detect.mockResolvedValueOnce({ ...initialPreflight, scan: 'complete', installations: installs });
    const record = { ...configuration('default', initialPreflight.automaticTarget!.path), name: 'pi 默认配置', connection: { ...initialConnection,
      preview: { id: 'automatic-preview', path: `${initialPreflight.automaticTarget!.path}/extensions/agent-pet.ts`, target: { ...initialPreflight.automaticTarget!, source: 'chosen' as const }, action: 'create' as const, findings: [], createDirectories: [] } } };
    test.bridge.configurations.prepareDetected.mockImplementationOnce(async () => {
      const next = { ...test.configs(), records: [record] }; test.pushConfigs(next); return { state: next, configurationId: record.id };
    });
    await test.user.click(screen.getByRole('button', { name: '自动扫描' }));
    expect(screen.getAllByRole('button', { name: '一键配置' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /选择配置位置/ })).toBeNull();
    expect(screen.getByText('2 处安装 · 共用此配置')).toBeTruthy();
    expect(screen.getByText('查找本机的 pi、Claude Code 和 Codex。')).toBeTruthy();
    const disclosure = screen.getByText('程序安装详情').closest('summary')!;
    expect(disclosure.parentElement?.hasAttribute('open')).toBe(false);
    await test.user.click(disclosure);
    expect(disclosure.parentElement?.hasAttribute('open')).toBe(true);
    expect(screen.getByRole('list', { name: '检测到的程序安装' }).textContent).toContain('/synthetic/node24/bin/pi');
    await test.user.click(disclosure);
    expect(disclosure.parentElement?.hasAttribute('open')).toBe(false);
    expect(test.bridge.configurations.prepareDetected).not.toHaveBeenCalled();
    await test.user.click(screen.getByRole('button', { name: '一键配置' }));
    expect(test.bridge.configurations.prepareDetected).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '连接 pi' }).textContent).toContain(initialPreflight.automaticTarget!.path);
    await test.user.click(screen.getByRole('button', { name: '检查并预览' }));
    expect(test.bridge.configurations.prepareDetected).toHaveBeenCalledExactlyOnceWith('node22', expect.any(String));
    expect(test.bridge.locations.choose).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('region', { name: '连接设置预览' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: '确认连接设置' })));
    expect(test.bridge.configurations.confirm).not.toHaveBeenCalled();
    let finishCancel!: () => void;
    test.bridge.configurations.cancel.mockImplementationOnce(async () => {
      test.pushConfigs({ ...test.configs(), revision: test.configs().revision + 1, records: test.configs().records.map(value => ({ ...value,
        connection: value.connection ? { ...value.connection, preview: null } : null })) });
      await new Promise<void>(resolve => { finishCancel = resolve; });
      return test.configs();
    });
    await test.user.click(screen.getByRole('button', { name: '取消' }));
    expect(test.bridge.configurations.cancel).toHaveBeenCalledExactlyOnceWith('default');
    // Main can push cleared preview before the invoke reply; wait through a frame
    // with the return button disabled, then release the reply.
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
    expect(screen.getByRole('button', { name: '设置连接' }).hasAttribute('disabled')).toBe(true);
    await act(async () => finishCancel());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '设置连接' })));
  });
  it('cancels consent without calling Main, recovers errors and opens existing configuration without duplicates', async () => {
    const existing = configuration('saved', initialPreflight.automaticTarget!.path);
    const test = await mount([]); await page(test.user, '连接');
    const installation = { id: 'auto-pi', path: '/synthetic/bin/pi', compatibility: 'verified-0.85.1' as const, version: '0.85.1' };
    test.bridge.piPreflight.detect.mockResolvedValueOnce({ ...initialPreflight, scan: 'complete', installations: [installation] });
    await test.user.click(screen.getByRole('button', { name: '自动扫描' }));
    await test.user.click(screen.getByRole('button', { name: '一键配置' }));
    await test.user.click(screen.getByRole('button', { name: '取消' }));
    expect(test.bridge.configurations.prepareDetected).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '一键配置' }).hasAttribute('disabled')).toBe(false);
    test.bridge.configurations.prepareDetected.mockRejectedValueOnce(new Error('fixture denied'));
    await test.user.click(screen.getByRole('button', { name: '一键配置' }));
    await test.user.click(screen.getByRole('button', { name: '检查并预览' }));
    expect(screen.getAllByRole('alert').some(value => value.textContent?.includes('检查未完成'))).toBe(true);
    await test.user.click(screen.getByRole('button', { name: '取消' }));
    act(() => test.pushConfigs({ ...test.configs(), records: [existing] }));
    expect(screen.getByText('查找本机的 pi、Claude Code 和 Codex。')).toBeTruthy();
    expect(screen.queryByText(/一键配置会先检查/)).toBeNull();
    await test.user.click(screen.getByRole('button', { name: '查看配置' }));
    expect(screen.getByRole('heading', { name: existing.name })).toBeTruthy();
    expect(test.bridge.configurations.prepareDetected).toHaveBeenCalledTimes(1);
    expect(test.bridge.configurations.create).not.toHaveBeenCalled();
  });
  it('immediately releases buttons on cancel even if IPC never settles and ignores its late preview', async () => {
    const test = await mount([]); await page(test.user, '连接');
    test.bridge.piPreflight.detect.mockResolvedValueOnce({ ...initialPreflight, scan: 'complete', installations: [
      { id: 'auto-pi', path: '/synthetic/bin/pi', compatibility: 'verified-0.85.1', version: '0.85.1' },
    ] });
    let finish!: (result: { state: ReturnType<typeof test.configs>; configurationId: string }) => void;
    test.bridge.configurations.prepareDetected.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await test.user.click(screen.getByRole('button', { name: '自动扫描' }));
    const opener = screen.getByRole('button', { name: '一键配置' });
    await test.user.click(opener);
    await test.user.click(screen.getByRole('button', { name: '检查并预览' }));
    expect(opener.hasAttribute('disabled')).toBe(true);
    const requestId = test.bridge.configurations.prepareDetected.mock.calls[0]![1];
    await test.user.click(screen.getByRole('button', { name: '取消检查' }));
    await waitFor(() => expect(opener.hasAttribute('disabled')).toBe(false));
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(test.bridge.configurations.cancelDetected).toHaveBeenCalledExactlyOnceWith(requestId);
    await test.user.click(screen.getByRole('button', { name: '我的连接' }));
    await act(async () => finish({ state: test.configs(), configurationId: 'late-preview' }));
    expect(screen.getByRole('heading', { name: '我的连接 00' })).toBeTruthy();
    expect(test.bridge.configurations.confirm).not.toHaveBeenCalled();
  });
  it('keeps unsupported installation results honest and preserves the manual fallback', async () => {
    const test = await mount([]); await page(test.user, '连接');
    test.bridge.piPreflight.detect.mockResolvedValueOnce({ ...initialPreflight, scan: 'complete', installations: [
      { id: 'unsupported', path: '/synthetic/bin/pi', compatibility: 'unverified', version: '0.85.2' },
    ] });
    await test.user.click(screen.getByRole('button', { name: '自动扫描' }));
    expect(screen.queryByRole('button', { name: '一键配置' })).toBeNull();
    expect(screen.getByText('此版本暂不支持一键配置，兼容性尚未验证。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '手动添加' })).toBeTruthy();
    expect(test.bridge.configurations.prepareDetected).not.toHaveBeenCalled();
  });
  it('keeps pending discovery alive across page navigation and discards an explicitly canceled scan reply', async () => {
    const test = await mount(); await page(test.user, '连接');
    let finish!: (state: PreflightState) => void;
    test.bridge.piPreflight.detect.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await test.user.click(screen.getByRole('button', { name: '自动扫描' }));
    await page(test.user, '宠物'); await page(test.user, '连接');
    expect(screen.getByText('正在查找安装')).toBeTruthy();
    await act(async () => finish({ ...initialPreflight, scan: 'complete', installations: [] }));
    expect(screen.getByRole('heading', { name: '未找到安装' })).toBeTruthy();
    test.bridge.piPreflight.detect.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await test.user.click(screen.getByRole('button', { name: '重新扫描' }));
    await test.user.click(screen.getByRole('button', { name: '取消扫描' }));
    expect(test.bridge.configurations.cancelClaudeScan).toHaveBeenCalledExactlyOnceWith(expect.any(String));
    await act(async () => finish({ ...initialPreflight, scan: 'complete', installations: [] }));
    expect(screen.getByRole('heading', { name: /我的连接/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '未找到安装' })).toBeNull();
  });
  it('dismisses removal without a write, restores focus and only removes the explicitly confirmed configuration', async () => {
    const test = await mount([configuration('one'), configuration('two')]); await page(test.user, '连接');
    await test.user.click(screen.getByText('更多操作', { exact: true }));
    const opener = screen.getByRole('button', { name: '移除连接' });
    for (const dismissal of ['cancel', 'escape', 'backdrop']) {
      await test.user.click(opener);
      const dialog = screen.getByRole('dialog', { name: '移除此连接？' });
      expect(within(dialog).getByText('不会删除 Agent 程序或你的文件。')).toBeTruthy();
      expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '取消' }));
      expect(test.bridge.configurations.remove).not.toHaveBeenCalled();
      if (dismissal === 'cancel') await test.user.click(within(dialog).getByRole('button', { name: '取消' }));
      else if (dismissal === 'escape') fireEvent(dialog, new Event('cancel', { cancelable: true }));
      else await test.user.click(dialog);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(opener);
      expect(test.configs().records.map(record => record.id)).toEqual(['one', 'two']);
    }
    await test.user.click(opener);
    await test.user.click(screen.getByRole('button', { name: '确认移除' }));
    expect(test.bridge.configurations.remove).toHaveBeenCalledExactlyOnceWith('one');
    expect(test.configs().records.map(record => record.id)).toEqual(['two']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(test.bridge.piConnection.remove).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: /我的连接/ })));
  });
  it('keeps pending removal modal and preserves a failed result for retry or cancellation', async () => {
    const record = { ...configuration(), connection: { ...initialConnection, canRemove: true, deployedPath: '/isolated/project-one/extensions/agent-pet.ts' } };
    const test = await mount([record]); await page(test.user, '连接');
    await test.user.click(screen.getByText('更多操作', { exact: true }));
    await test.user.click(screen.getByRole('button', { name: '移除连接' }));
    const dialog = screen.getByRole('dialog', { name: '移除此连接？' });
    await test.user.click(within(dialog).getByText('会移除什么？'));
    expect(dialog.textContent).toContain(record.connection.deployedPath);
    expect(dialog.textContent).toContain('被修改过或不能确认来源的文件会保留');
    let finish!: () => void;
    test.bridge.configurations.remove.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => { finish = resolve; });
      return { ...test.configs(), notice: 'retained' as const };
    });
    await test.user.click(within(dialog).getByRole('button', { name: '确认移除' }));
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog', { name: '移除此连接？' })).toBe(dialog);
    expect(within(dialog).getByRole('button', { name: '取消' }).hasAttribute('disabled')).toBe(true);
    await act(async () => finish());
    expect(within(dialog).getByRole('alert').textContent).toContain('连接还没有移除');
    expect(test.configs().records).toEqual([record]);
    expect(within(dialog).getByRole('button', { name: '确认移除' }).hasAttribute('disabled')).toBe(false);
    await test.user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(test.bridge.configurations.remove).toHaveBeenCalledExactlyOnceWith(record.id);
  });
  it('closes manual configuration on navigation and releases all subscriptions without accepting late callbacks', async () => {
    const test = await mount(); await page(test.user, '连接');
    await test.user.click(screen.getByRole('button', { name: '手动添加' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    // This direct event models Main/page lifecycle; browser-native modality blocks pointer navigation while open.
    fireEvent.click(screen.getByRole('tab', { name: '设置' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    test.unmount();
    expect(test.listenerCounts()).toEqual([0, 0, 0]);
    expect(test.offState).toHaveBeenCalledOnce(); expect(test.offConfigs).toHaveBeenCalledOnce(); expect(test.offSessions).toHaveBeenCalledOnce();
    act(() => test.pushState(test.state()));
  });
});
