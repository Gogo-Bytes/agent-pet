// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManagementApp } from './ManagementApp.js';
import { defaultPreferences, type ManagementState, type PreferencePatch } from '../../shared/preferences.js';

afterEach(cleanup);
function createBridge(supported = false) {
  let state: ManagementState = { preferences: { ...defaultPreferences }, preferenceError: null, login: { supported, enabled: false, error: null } };
  let listener: ((state: ManagementState) => void) | undefined;
  const off = vi.fn(() => { listener = undefined; });
  const bridge = {
    getState: vi.fn(async () => state),
    updatePreferences: vi.fn(async (patch: PreferencePatch) => { state = { ...state, preferences: { ...state.preferences, ...patch } }; return state; }),
    setLogin: vi.fn(async (enabled: boolean) => { state = { ...state, login: { ...state.login, enabled } }; return state; }),
    subscribe: vi.fn((callback: (state: ManagementState) => void) => { listener = callback; return off; }),
  };
  return { bridge, off, push: (value: ManagementState) => listener?.(value) };
}

describe('ManagementApp real DOM controls', () => {
  it('opens on honest P1 connection information with no unavailable actions or second Canvas', async () => {
    const { bridge } = createBridge();
    const view = render(<ManagementApp bridge={bridge} />);
    await act(async () => {});
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Agent 连接');
    expect(screen.getByText('一键接入尚未实现 · P2 计划')).toBeTruthy();
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Agent 连接', '宠物', '设置']);
    expect(view.container.querySelector('canvas')).toBeNull();
    expect(bridge.updatePreferences).not.toHaveBeenCalled(); expect(bridge.setLogin).not.toHaveBeenCalled();
  });
  it('navigates by keyboard, persists visibility/size from DOM events and receives toolbar/tray changes', async () => {
    const user = userEvent.setup();
    const { bridge, off, push } = createBridge();
    const view = render(<ManagementApp bridge={bridge} />);
    await act(async () => {});
    await user.tab(); await user.tab(); await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('宠物');
    await user.click(screen.getByRole('checkbox', { name: '显示宠物' }));
    expect(bridge.updatePreferences).toHaveBeenLastCalledWith({ petVisible: false });
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    fireEvent.change(screen.getByRole('slider', { name: '宠物大小' }), { target: { value: '240' } });
    await act(async () => {});
    expect(bridge.updatePreferences).toHaveBeenLastCalledWith({ petSize: 240 });
    act(() => push({ preferences: { ...defaultPreferences, petSize: 280 }, preferenceError: null, login: { supported: false, enabled: false, error: null } }));
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('280');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    view.unmount(); expect(off).toHaveBeenCalledOnce();
  });
  it('does not enable login in dev and does not invoke OS state changes on render', async () => {
    const { bridge } = createBridge();
    render(<ManagementApp bridge={bridge} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '设置' }));
    expect((screen.getByRole('checkbox', { name: '登录时启动 Agent Pet' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/开发模式不会将 Electron/)).toBeTruthy();
    expect(bridge.setLogin).not.toHaveBeenCalled();
  });
  it('lets supported users opt in explicitly and shows truthful returned OS failure', async () => {
    const { bridge } = createBridge(true);
    bridge.setLogin.mockResolvedValueOnce({ preferences: defaultPreferences, preferenceError: null, login: { supported: true, enabled: false, error: '系统未应用登录项更改' } });
    const user = userEvent.setup(); render(<ManagementApp bridge={bridge} />);
    await user.click(screen.getByRole('button', { name: '设置' }));
    await user.click(screen.getByRole('checkbox', { name: '登录时启动 Agent Pet' }));
    expect(bridge.setLogin).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.getByRole('alert').textContent).toBe('系统未应用登录项更改');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });
  it('reports persistence errors, keeps confirmed values and handles rejected IPC without optimistic success', async () => {
    const { bridge } = createBridge();
    bridge.updatePreferences.mockResolvedValueOnce({ preferences: defaultPreferences, preferenceError: '偏好保存失败，未应用更改', login: { supported: false, enabled: false, error: null } });
    const user = userEvent.setup(); render(<ManagementApp bridge={bridge} />);
    await user.click(screen.getByRole('button', { name: '宠物' }));
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('alert').textContent).toContain('未应用更改');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    bridge.updatePreferences.mockRejectedValueOnce(new Error('IPC unavailable'));
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByText('操作失败，未确认更改。请重试。')).toBeTruthy();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });
});
