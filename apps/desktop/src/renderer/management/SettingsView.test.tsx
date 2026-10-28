// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPreferences, type ManagementState } from '../../shared/preferences.js';
import { SettingsView } from './SettingsView.js';

const state: ManagementState = {
  preferences: { ...defaultPreferences }, preferenceError: null,
  login: { supported: false, enabled: false, error: null },
};
function props() {
  return { visible: true, state, busy: false, onChange: vi.fn(), onLogin: vi.fn(), onReset: vi.fn(async () => {}), onOpenProject: vi.fn() };
}
// Native dialog is used in Electron; jsdom needs only the missing platform methods.
for (const method of ['showModal', 'close'] as const) {
  if (!HTMLDialogElement.prototype[method]) Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, writable: true, value: () => {} });
}
beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('formal preference controls', () => {
  it('shows named setting categories without decorative numbering', async () => {
    render(<SettingsView {...props()} />);
    const nav = screen.getByRole('navigation', { name: '设置分类' });
    expect(within(nav).getAllByRole('button')).toHaveLength(5);
    expect(nav.textContent).not.toMatch(/0[1-5]/);
    await userEvent.click(within(nav).getByRole('button', { name: /关于/ }));
    expect(nav.textContent).not.toMatch(/0[1-5]/);
    expect(screen.getByRole('article', { name: '关于 Agent Pet' })).toBeTruthy();
  });
  it('submits render presets and keyboard choices through the typed preference owner', async () => {
    const input = props();
    render(<SettingsView {...input} />);
    await userEvent.click(screen.getByRole('button', { name: /省电/ }));
    expect(input.onChange).toHaveBeenCalledWith({ fps: 30, resolution: 75 });
    await userEvent.click(screen.getByText('精细调整'));
    const sixty = screen.getByRole('radio', { name: '60 FPS' });
    sixty.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(input.onChange).toHaveBeenCalledWith({ fps: 120 });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '120 FPS' }));
  });
  it('keeps at least one entry and reports unsupported login without invoking OS changes', async () => {
    const input = props();
    input.state = { ...state, preferences: { ...defaultPreferences, dock: false } };
    render(<SettingsView {...input} />);
    await userEvent.click(screen.getByRole('button', { name: /软件/ }));
    expect(screen.getByRole('switch', { name: '菜单栏图标' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('switch', { name: 'Dock 图标' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('switch', { name: '登录时启动' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/开发模式不会将 Electron/)).toBeTruthy();
    expect(input.onLogin).not.toHaveBeenCalled();
  });
  it('maps accepted percentage size to persisted pixels and honors the visibility dependency', async () => {
    const input = props();
    input.state = { ...state, preferences: { ...defaultPreferences, petVisible: false } };
    render(<SettingsView {...input} />);
    await userEvent.click(screen.getByRole('button', { name: /宠物/ }));
    const slider = screen.getByRole('slider', { name: '宠物大小' });
    expect((slider as HTMLInputElement).value).toBe('100');
    fireEvent.change(slider, { target: { value: '110' } });
    fireEvent.change(slider, { target: { value: '120' } });
    expect(input.onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    expect(input.onChange).toHaveBeenCalledWith({ petSize: 168 });
    expect(screen.queryByRole('switch', { name: 'Agent 未启动时显示' })).toBeNull();
    expect(screen.getByRole('switch', { name: '显示桌面宠物' })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: '显示宠物名称' })).toBeNull();
  });
  it('retains reminder choices while bubbles are off and offers the actual enabling operation', async () => {
    const input = props();
    input.state = { ...state, preferences: { ...defaultPreferences, bubbles: false, completed: false } };
    render(<SettingsView {...input} />);
    await userEvent.click(screen.getByRole('button', { name: /提醒/ }));
    expect(screen.getByText('下面的提醒暂不显示，选择会保留。')).toBeTruthy();
    expect(screen.getByRole('switch', { name: '任务完成' }).getAttribute('aria-checked')).toBe('false');
    await userEvent.click(screen.getByRole('button', { name: '开启气泡' }));
    expect(input.onChange).toHaveBeenCalledWith({ bubbles: true });
  });
  it('cancels the reset without changes, traps focus, and restores the triggering control', async () => {
    const input = props();
    render(<SettingsView {...input} />);
    const trigger = screen.getByRole('button', { name: '恢复默认' });
    await userEvent.click(trigger);
    const confirm = screen.getByRole('button', { name: '确认恢复' });
    confirm.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '取消' }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(input.onReset).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it('waits for the real reset and keeps a rejected reset recoverable without a success notice', async () => {
    const input = props();
    input.onReset.mockRejectedValueOnce(new Error('disk full'));
    render(<SettingsView {...input} />);
    await userEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    await userEvent.click(screen.getByRole('button', { name: '确认恢复' }));
    expect(screen.getByRole('alert').textContent).toContain('恢复默认失败');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByText('所有偏好已恢复默认。')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '确认恢复' }));
    expect(input.onReset).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('所有偏好已恢复默认。');
  });
  it('reflects authoritative failure and busy state instead of claiming a requested toggle succeeded', async () => {
    const input = props();
    const view = render(<SettingsView {...input} />);
    const pause = screen.getByRole('switch', { name: '隐藏时暂停渲染' });
    await userEvent.click(pause);
    expect(input.onChange).toHaveBeenCalledWith({ pauseHidden: false });
    expect(pause.getAttribute('aria-checked')).toBe('true');
    view.rerender(<SettingsView {...input} busy state={{ ...state, preferenceError: '保存失败' }} />);
    expect(pause.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('保存失败');
  });
  it('opens the project through the typed host callback and closes an open dialog when hidden', async () => {
    const input = props();
    const view = render(<SettingsView {...input} />);
    await userEvent.click(screen.getByRole('button', { name: /关于/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Gogo-Bytes / agent-pet' }));
    expect(input.onOpenProject).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    act(() => view.rerender(<SettingsView {...input} visible={false} />));
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  });
});
