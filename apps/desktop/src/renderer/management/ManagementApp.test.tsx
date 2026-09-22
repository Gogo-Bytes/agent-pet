// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { initialPreflight, preflightBridge } from './test-preflight.js';
import type { PreflightState } from '../../shared/pi-preflight.js';
import { ManagementApp } from './ManagementApp.js';
import { defaultPreferences, type ManagementState, type PreferencePatch } from '../../shared/preferences.js';

// jsdom lacks browser pointer capture/geometry. Exercise the real Radix component,
// supplying only platform APIs; no Slider or IPC implementation is mocked out.
beforeEach(() => {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const captures = new WeakMap<Element, number>();
  vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(function (this: Element, id) { captures.set(this, id); });
  vi.spyOn(Element.prototype, 'hasPointerCapture').mockImplementation(function (this: Element, id) { return captures.get(this) === id; });
  vi.spyOn(Element.prototype, 'releasePointerCapture').mockImplementation(function (this: Element, id) {
    captures.delete(this);
    fireEvent.lostPointerCapture(this, { pointerId: id });
  });
});
// Define absent platform methods once so spies can be restored between tests.
for (const method of ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture'] as const) {
  if (!Element.prototype[method]) Object.defineProperty(Element.prototype, method, { configurable: true, writable: true, value: () => false });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function saved(size: number, preferenceError: string | null = null): ManagementState {
  return { preferences: { ...defaultPreferences, petSize: size }, preferenceError, login: { supported: false, enabled: false, error: null } };
}
function geometry(slider = screen.getByRole('slider')) {
  const root = slider.closest('.size-slider')!;
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 520, height: 32, right: 520, bottom: 32, x: 0, y: 0, toJSON: () => ({}) });
  return { slider, root };
}
function startDrag(size: number) {
  const controls = geometry();
  fireEvent.pointerDown(controls.slider, { pointerId: 1, button: 0 });
  fireEvent.pointerMove(controls.slider, { pointerId: 1, clientX: size - 80 });
  return controls;
}
function release(slider: Element = screen.getByRole('slider')) { fireEvent.pointerUp(slider, { pointerId: 1 }); }
function expectSize(size: number) { expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe(String(size)); }

function createBridge(supported = false) {
  let state: ManagementState = { preferences: { ...defaultPreferences }, preferenceError: null, login: { supported, enabled: false, error: null } };
  let listener: ((state: ManagementState) => void) | undefined;
  const off = vi.fn(() => { listener = undefined; });
  const bridge = {
    piPreflight: preflightBridge(),
    getState: vi.fn(async () => state),
    updatePreferences: vi.fn(async (patch: PreferencePatch) => { state = { ...state, preferences: { ...state.preferences, ...patch } }; return state; }),
    setLogin: vi.fn(async (enabled: boolean) => { state = { ...state, login: { ...state.login, enabled } }; return state; }),
    subscribe: vi.fn((callback: (state: ManagementState) => void) => { listener = callback; return off; }),
  };
  return { bridge, off, push: (value: ManagementState) => listener?.(value) };
}

describe('ManagementApp real DOM controls', () => {
  it('opens on honest P2a connection information with no installation actions or second Canvas', async () => {
    const { bridge } = createBridge();
    const view = render(<ManagementApp bridge={bridge} />);
    await act(async () => {});
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Agent 连接');
    expect(screen.getByText('P2a · 检测与只读预检')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '安装' })).toBeNull();
    expect(bridge.piPreflight.detect).not.toHaveBeenCalled(); expect(bridge.piPreflight.inspect).not.toHaveBeenCalled();
    expect(view.container.querySelector('canvas')).toBeNull();
    expect(bridge.updatePreferences).not.toHaveBeenCalled(); expect(bridge.setLogin).not.toHaveBeenCalled();
  });
  it.each(['detect', 'inspect'] as const)('retains pending %s completion across page navigation', async operation => {
    const { bridge } = createBridge();
    let finish!: (state: PreflightState) => void;
    bridge.piPreflight[operation].mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup();
    render(<ManagementApp bridge={bridge} />);
    await act(async () => {});
    await user.click(screen.getByRole('button', { name: operation === 'detect' ? '检测 / 重新扫描' : '检查所选目标（只读）' }));
    await user.click(screen.getByRole('button', { name: '宠物' }));
    expect(screen.queryByRole('region', { name: 'pi 只读预检' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Agent 连接' }));
    expect(screen.getByText('正在处理只读请求…')).toBeTruthy();
    await act(async () => finish({ ...initialPreflight, revision: 1, scan: 'complete',
      inspection: { target: initialPreflight.target, findings: ['existing-extension'] } }));
    expect(screen.getByText('已有 agent-pet.ts；所有权未知，不能覆盖或认定已安装。')).toBeTruthy();
    expect(screen.queryByText('正在处理只读请求…')).toBeNull();
    expect(bridge.piPreflight[operation]).toHaveBeenCalledOnce();
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
    startDrag(240); release();
    await act(async () => {});
    expect(bridge.updatePreferences).toHaveBeenLastCalledWith({ petSize: 240 });
    act(() => push({ preferences: { ...defaultPreferences, petSize: 280 }, preferenceError: null, login: { supported: false, enabled: false, error: null } }));
    expectSize(280);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    view.unmount(); expect(off).toHaveBeenCalledOnce();
  });
  it('previews real pointer moves without IPC and saves only on release without remount or geometry changes', async () => {
    const { bridge } = createBridge();
    let finish!: (value: ManagementState) => void;
    bridge.updatePreferences.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<ManagementApp bridge={bridge} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '宠物' }));
    const { slider, root } = startDrag(200);
    const status = document.querySelector('.size-status')!;
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 200 });
    expectSize(280);
    expect(screen.getByText('已确认尺寸：140 DIP')).toBeTruthy();
    expect(bridge.updatePreferences).not.toHaveBeenCalled();
    const children = root.parentElement!.childElementCount;
    release(slider);
    expect(bridge.updatePreferences).toHaveBeenCalledExactlyOnceWith({ petSize: 280 });
    expect(screen.getByRole('slider')).toBe(slider);
    expect(document.activeElement).toBe(slider);
    expect(slider.hasAttribute('data-disabled')).toBe(false);
    expect(document.querySelector('.size-status')!).toBe(status);
    expect(status.textContent).toBe('正在保存尺寸…');
    expect(root.parentElement!.childElementCount).toBe(children);
    await act(async () => finish(saved(280)));
    expectSize(280);
    expect(screen.getByRole('slider')).toBe(slider);
    expect(document.querySelector('.size-status')!).toBe(status);
    expect(root.parentElement!.childElementCount).toBe(children);
    expect(screen.getByText('已确认尺寸：280 DIP')).toBeTruthy();
    // jsdom has no layout: assert the explicit CSS geometry contract, not fake pixel rendering.
    const css = readFileSync('apps/desktop/src/renderer/management/management.css', 'utf8');
    expect(css).toMatch(/\.size-status \{ height: 48px; overflow: auto;/);
    expect(css).toMatch(/\.size-slider \{[^}]*width: 100%; height: 32px;/);
  });
  it.each(['success', 'failure', 'rejection'] as const)('keeps a newer unreleased draft when an older save ends in %s', async outcome => {
    const { bridge } = createBridge();
    let finish!: (value: ManagementState) => void;
    let reject!: (error: Error) => void;
    bridge.updatePreferences.mockImplementationOnce(() => new Promise((resolve, fail) => { finish = resolve; reject = fail; }));
    render(<ManagementApp bridge={bridge} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '宠物' }));
    const { slider } = startDrag(200); release(slider);
    startDrag(300);
    await act(async () => { if (outcome === 'rejection') reject(new Error('IPC')); else finish(saved(outcome === 'success' ? 200 : 140, outcome === 'failure' ? '保存失败' : null)); });
    expectSize(300);
    expect(screen.getByRole('slider')).toBe(slider);
    expect(slider.hasAttribute('data-disabled')).toBe(false);
    expect(bridge.updatePreferences).toHaveBeenCalledTimes(1);
    release(slider);
    await act(async () => {});
    expect(bridge.updatePreferences).toHaveBeenLastCalledWith({ petSize: 300 });
    expectSize(300);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('serializes only committed adjustments and keeps the latest release while IPC is pending', async () => {
    const { bridge } = createBridge();
    const pending: ((value: ManagementState) => void)[] = [];
    bridge.updatePreferences.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    render(<ManagementApp bridge={bridge} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '宠物' }));
    startDrag(200); release();
    startDrag(240); release();
    startDrag(280); release();
    expectSize(280);
    expect(bridge.updatePreferences).toHaveBeenCalledTimes(1);
    await act(async () => pending.shift()!(saved(200)));
    expectSize(280);
    expect(bridge.updatePreferences).toHaveBeenLastCalledWith({ petSize: 280 });
    await act(async () => pending.shift()!(saved(280)));
    expectSize(280);
    expect(bridge.updatePreferences).toHaveBeenCalledTimes(2);
  });
  it.each(['failure', 'rejection'] as const)('rolls back %s, discards queued commits and permits retry', async outcome => {
    const { bridge } = createBridge();
    let finish!: (value: ManagementState) => void;
    let reject!: (error: Error) => void;
    bridge.updatePreferences.mockImplementationOnce(() => new Promise((resolve, fail) => { finish = resolve; reject = fail; }));
    render(<ManagementApp bridge={bridge} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '宠物' }));
    const { slider, root } = startDrag(200); release();
    const status = root.parentElement!.querySelector('.size-status');
    const children = root.parentElement!.childElementCount;
    startDrag(300); release();
    await act(async () => { if (outcome === 'failure') finish(saved(140, '保存失败')); else reject(new Error('IPC')); });
    expectSize(140);
    expect(bridge.updatePreferences).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toMatch(/失败/);
    expect(screen.getByRole('alert')).toBe(status);
    expect(root.parentElement!.childElementCount).toBe(children);
    expect(screen.getByRole('slider')).toBe(slider);
    startDrag(220); release();
    await act(async () => {});
    expectSize(220);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('clears a persistence failure after an authoritative external recovery', async () => {
    const { bridge, push } = createBridge();
    bridge.updatePreferences.mockResolvedValueOnce(saved(140, '保存失败'));
    render(<ManagementApp bridge={bridge} />);
    await userEvent.click(screen.getByRole('button', { name: '宠物' }));
    startDrag(200); release();
    await act(async () => {});
    expect(screen.getByRole('alert').textContent).toBe('保存失败');
    act(() => push(saved(260)));
    expect(screen.queryByRole('alert')).toBeNull();
    expectSize(260);
  });
  it.each([1, 2])('ignores non-primary pointer button %s on the track', async button => {
    const { bridge } = createBridge();
    render(<ManagementApp bridge={bridge} />);
    await userEvent.click(screen.getByRole('button', { name: '宠物' }));
    const { root } = geometry();
    fireEvent.pointerDown(root, { pointerId: 1, button, clientX: 200 });
    fireEvent.pointerUp(root, { pointerId: 1, button, clientX: 200 });
    await act(async () => {});
    expectSize(140);
    expect(bridge.updatePreferences).not.toHaveBeenCalled();
  });
  it('stops failed queued commits when Main publishes the failure before its IPC reply', async () => {
    const { bridge, push } = createBridge();
    let finish!: (value: ManagementState) => void;
    bridge.updatePreferences.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<ManagementApp bridge={bridge} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '宠物' }));
    startDrag(200); release(); startDrag(300); release();
    act(() => push(saved(140, '保存失败')));
    await act(async () => finish(saved(140, '保存失败')));
    expectSize(140);
    expect(bridge.updatePreferences).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toBe('保存失败');
    startDrag(220); release();
    await act(async () => {});
    expectSize(220);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('preserves draft during a toolbar push and does not overwrite that push with an older reply', async () => {
    const { bridge, push } = createBridge();
    let finish!: (value: ManagementState) => void;
    bridge.updatePreferences.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<ManagementApp bridge={bridge} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '宠物' }));
    startDrag(200); release();
    const { slider } = startDrag(300);
    act(() => push(saved(260)));
    expectSize(300);
    expect(screen.getByText('已确认尺寸：260 DIP')).toBeTruthy();
    await act(async () => finish(saved(200)));
    expectSize(300);
    fireEvent.pointerCancel(slider, { pointerId: 1 });
    expectSize(260);
    expect(bridge.updatePreferences).toHaveBeenCalledTimes(1);
  });
  it.each(['pointerCancel', 'lostPointerCapture'] as const)('aborts %s without saving and resets cached geometry only after cancellation', async event => {
    const { bridge } = createBridge();
    render(<ManagementApp bridge={bridge} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '宠物' }));
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { slider } = startDrag(300);
    await act(async () => { fireEvent[event](slider, { pointerId: 1 }); });
    expectSize(140);
    expect(bridge.updatePreferences).not.toHaveBeenCalled();
    const next = screen.getByRole('slider');
    expect(next).not.toBe(slider);
    expect(document.activeElement).toBe(next);
    const { root } = geometry(next);
    vi.mocked(root.getBoundingClientRect).mockReturnValue({ left: 100, width: 260 } as DOMRect);
    fireEvent.pointerDown(next, { pointerId: 2 });
    fireEvent.pointerMove(next, { pointerId: 2, clientX: 230 });
    expectSize(340);
    fireEvent.pointerUp(next, { pointerId: 2 });
    await act(async () => {});
    expect(bridge.updatePreferences).toHaveBeenCalledExactlyOnceWith({ petSize: 340 });
  });
  it.each(['pointerCancel', 'lostPointerCapture'] as const)('cancels a newer draft via %s without losing an older pending commit', async event => {
    const { bridge } = createBridge();
    let finish!: (value: ManagementState) => void;
    bridge.updatePreferences.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<ManagementApp bridge={bridge} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '宠物' }));
    const { slider } = startDrag(200); release(); startDrag(300);
    fireEvent[event](slider, { pointerId: 1 });
    expectSize(200);
    await act(async () => finish(saved(200)));
    expectSize(200);
    expect(bridge.updatePreferences).toHaveBeenCalledExactlyOnceWith({ petSize: 200 });
  });
  it('keeps keyboard commits responsive and ordered while persistence is deferred', async () => {
    const { bridge } = createBridge();
    const pending: ((value: ManagementState) => void)[] = [];
    bridge.updatePreferences.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const user = userEvent.setup(); render(<ManagementApp bridge={bridge} />);
    await user.click(screen.getByRole('button', { name: '宠物' }));
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expectSize(142);
    expect(bridge.updatePreferences).toHaveBeenCalledExactlyOnceWith({ petSize: 141 });
    await act(async () => pending.shift()!(saved(141)));
    expectSize(142);
    expect(bridge.updatePreferences).toHaveBeenLastCalledWith({ petSize: 142 });
    await act(async () => pending.shift()!(saved(142)));
    expectSize(142);
    expect(document.activeElement).toBe(slider);
  });
  it('does not steal focus on cancellation after app blur', async () => {
    const { bridge } = createBridge();
    render(<ManagementApp bridge={bridge} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '宠物' }));
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const { slider } = startDrag(300);
    fireEvent.pointerCancel(slider, { pointerId: 1 });
    expect(document.activeElement).not.toBe(screen.getByRole('slider'));
    expect(bridge.updatePreferences).not.toHaveBeenCalled();
  });
  it('uses real Radix track click, unchanged release and keyboard commit ordering/bounds', async () => {
    const { bridge } = createBridge();
    const user = userEvent.setup();
    render(<ManagementApp bridge={bridge} />);
    await user.click(screen.getByRole('button', { name: '宠物' }));
    const { root, slider } = geometry();
    fireEvent.pointerDown(slider, { pointerId: 1 }); release(slider);
    expect(bridge.updatePreferences).not.toHaveBeenCalled();
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 160 });
    expectSize(240);
    expect(bridge.updatePreferences).not.toHaveBeenCalled();
    release(root);
    await act(async () => {});
    expect(bridge.updatePreferences).toHaveBeenLastCalledWith({ petSize: 240 });
    expect(document.activeElement).toBe(slider);
    for (const [key, value] of [['ArrowRight', 241], ['PageUp', 251], ['Home', 80], ['End', 600], ['ArrowLeft', 599]] as const) {
      await user.keyboard(`{${key}}`);
      expectSize(value);
      expect(bridge.updatePreferences).toHaveBeenLastCalledWith({ petSize: value });
    }
    expect(slider.getAttribute('aria-valuemin')).toBe('80');
    expect(slider.getAttribute('aria-valuemax')).toBe('600');
    expect(slider.getAttribute('aria-describedby')).toBe('pet-size-help');
  });
  it('retains committed saves across navigation but cancels an unreleased draft without stealing focus', async () => {
    const { bridge } = createBridge();
    let finish!: (value: ManagementState) => void;
    bridge.updatePreferences.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup(); render(<ManagementApp bridge={bridge} />);
    await user.click(screen.getByRole('button', { name: '宠物' }));
    startDrag(200); release(); startDrag(300);
    const settings = screen.getByRole('button', { name: '设置' });
    await user.click(settings);
    expect(document.activeElement).toBe(settings);
    await act(async () => finish(saved(200)));
    await user.click(screen.getByRole('button', { name: '宠物' }));
    expectSize(200);
    expect(bridge.updatePreferences).toHaveBeenCalledTimes(1);
  });
  it('drops queued commits and subscription after unmount', async () => {
    const { bridge, off } = createBridge();
    let finish!: (value: ManagementState) => void;
    bridge.updatePreferences.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<ManagementApp bridge={bridge} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '宠物' }));
    startDrag(200); release(); startDrag(300); release();
    view.unmount();
    await act(async () => finish(saved(200)));
    expect(bridge.updatePreferences).toHaveBeenCalledTimes(1);
    expect(off).toHaveBeenCalledOnce();
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
