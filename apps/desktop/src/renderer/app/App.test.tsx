// @vitest-environment jsdom
import '../test-support/dom-platform.js';
import { Children, StrictMode, isValidElement, useEffect, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { configure, getConfig } from '@testing-library/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenSessionResult } from '@agent-pet/adapter-core';
import { App } from './App.js';
import { createPetStore } from './bridge/pet-store.js';
import { createPetBridgeDouble } from '../test-support/pet-bridge-double.js';
import { baselineLayout, piBaselineObservations, piObservation } from '../test-support/pi-fixtures.js';
import { defaultPreferences } from '../../shared/preferences.js';
import { PetModel } from '../features/pet/PetModel.js';

// Only the WebGL boundary is substituted; PetCanvas, native DOM gestures,
// Suspense/error isolation and the Application/bridge remain real.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, frameloop }: { children: ReactNode; frameloop: string }) => <div data-frameloop={frameloop}>
    <canvas />{Children.toArray(children).filter(child => isValidElement(child) && typeof child.type !== 'string')}
  </div>,
}));
vi.mock('../shared/PreferenceRenderLoop.js', () => ({ PreferenceRenderLoop: ({ active }: { active: boolean }) => <span data-loop-active={String(active)} /> }));
vi.mock('@react-three/drei', () => ({ Bounds: ({ children }: { children: ReactNode }) => children }));
vi.mock('../features/pet/PetModel.js', () => ({ PetModel: vi.fn(() => null) }));
const asyncWrapper = getConfig().asyncWrapper;
afterEach(() => { cleanup(); configure({ asyncWrapper }); vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.mocked(PetModel).mockImplementation(() => <></>); });
function timerUser() {
  vi.useFakeTimers();
  // RTL's default asyncWrapper advances zero-time timers only for Jest. With
  // Vitest, drain React work through act rather than leave that timer pending.
  configure({ asyncWrapper: async callback => {
    let result: Awaited<ReturnType<typeof callback>>;
    await act(async () => { result = await callback(); });
    return result!;
  } });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

function ReadyNotice({ onReady }: { onReady: (message: string) => void }) {
  useEffect(() => { onReady(''); }, [onReady]);
  return null;
}

async function mount(options: Parameters<typeof createPetBridgeDouble>[0] = {}) {
  const bridge = createPetBridgeDouble(options);
  const store = createPetStore(bridge.api);
  const view = render(<StrictMode><App store={store} /></StrictMode>);
  await act(async () => {});
  return { bridge, store, ...view };
}

describe('App session interactions', () => {
  it('passes the routed connection cue through store and PetCanvas without replacing business motion', async () => {
    const { bridge } = await mount({ observations: [piObservation()] });
    const receive = bridge.api.subscribeSnapshot.mock.calls.at(-1)![0];
    const snapshot = { ...bridge.snapshot(), connectionCue: 'connected:app:1' };
    act(() => receive(snapshot));
    expect(vi.mocked(PetModel).mock.calls.at(-1)![0]).toMatchObject({ connectionCue: snapshot.connectionCue, motion: 'working' });
  });
  it('waits for first preferences and bound model bytes before passing the connection cue to PetModel', async () => {
    const fixture = createPetBridgeDouble();
    fixture.api.requestSnapshot.mockResolvedValue();
    let finish!: (value: { bytes: Uint8Array; animations: { connected: string } }) => void;
    const bridge = { ...fixture.api, getAsset: vi.fn(() => new Promise<{ bytes: Uint8Array; animations: { connected: string } }>(resolve => { finish = resolve; })) };
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:connected-bound'), revokeObjectURL: vi.fn() });
    try {
      render(<App store={createPetStore(bridge)} />); await act(async () => {});
      const snapshot = { ...fixture.snapshot(), connectionCue: 'connected:bound:1' };
      // Main sends snapshot first, preferences in a separate IPC callback.
      await act(async () => { fixture.api.subscribeSnapshot.mock.calls.at(-1)![0](snapshot); });
      expect(vi.mocked(PetModel).mock.calls.at(-1)![0].connectionCue).toBeUndefined();
      expect(bridge.getAsset).not.toHaveBeenCalled();
      await act(async () => { fixture.publishPreferences({ ...defaultPreferences, petAssetId: 'artist-pet' }); });
      expect(vi.mocked(PetModel).mock.calls.at(-1)![0].connectionCue).toBeUndefined();
      await act(async () => finish({ bytes: new Uint8Array([1]), animations: { connected: 'Greeting' } }));
      expect(vi.mocked(PetModel).mock.calls.at(-1)![0]).toMatchObject({ connectionCue: snapshot.connectionCue, modelUrl: 'blob:connected-bound' });
    } finally { cleanup(); vi.unstubAllGlobals(); }
  });
  it('releases the connection cue when first preferences confirm the bundled starter', async () => {
    const bridge = createPetBridgeDouble();
    bridge.api.requestSnapshot.mockResolvedValue();
    const { unmount } = render(<App store={createPetStore(bridge.api)} />);
    const snapshot = { ...bridge.snapshot(), connectionCue: 'connected:confirmed-starter' };
    await act(async () => { bridge.api.subscribeSnapshot.mock.calls.at(-1)![0](snapshot); });
    expect(vi.mocked(PetModel).mock.calls.at(-1)![0].connectionCue).toBeUndefined();
    await act(async () => { bridge.publishPreferences({ ...defaultPreferences }); });
    expect(vi.mocked(PetModel).mock.calls.at(-1)![0]).toMatchObject({ connectionCue: 'connected:confirmed-starter', modelUrl: undefined });
    expect(bridge.api.getAsset).not.toHaveBeenCalled();
    unmount();
    const calls = vi.mocked(PetModel).mock.calls.length;
    act(() => { bridge.publishPreferences({ ...defaultPreferences, petAssetId: 'after-unmount' }); });
    expect(vi.mocked(PetModel)).toHaveBeenCalledTimes(calls);
  });
  it.each(['missing', 'rejected'] as const)('keeps starter fallback without claiming a connection playback when the bound asset is %s', async outcome => {
    const fixture = createPetBridgeDouble();
    fixture.api.requestSnapshot.mockResolvedValue();
    if (outcome === 'rejected') fixture.api.getAsset.mockRejectedValue(Error('unreadable'));
    render(<App store={createPetStore(fixture.api)} />);
    const snapshot = { ...fixture.snapshot(), connectionCue: `connected:unreadable:${outcome}` };
    await act(async () => { fixture.api.subscribeSnapshot.mock.calls.at(-1)![0](snapshot); });
    await act(async () => { fixture.publishPreferences({ ...defaultPreferences, petAssetId: 'unreadable-pet' }); });
    expect(fixture.api.getAsset).toHaveBeenCalledWith('unreadable-pet');
    expect(vi.mocked(PetModel).mock.calls.at(-1)![0]).toMatchObject({ connectionCue: undefined, modelUrl: undefined, motion: 'idle' });
  });
  it.each(['release', 'pointercancel', 'lostpointercapture', 'blur', 'unmount'])('passes actual drag direction without replacing business presentation and clears on %s', async ending => {
    const user = userEvent.setup();
    const { container, unmount, bridge } = await mount({ observations: [piObservation()] });
    const target = container.querySelector('canvas')!;
    const model = () => vi.mocked(PetModel).mock.calls.at(-1)![0];
    await user.pointer({ target, keys: '[MouseLeft>]', coords: { screenX: 200, screenY: 200 } });
    expect(model().dragDirection).toBeNull();
    for (const [screenX, screenY, direction] of [[220, 200, 'right'], [210, 200, 'left'], [210, 180, 'up'], [210, 190, 'down']] as const) {
      await user.pointer({ target, coords: { screenX, screenY } });
      expect(model().dragDirection).toBe(direction);
      expect(model().motion).toBe('working');
    }
    if (ending === 'unmount') { unmount(); expect(container.querySelector('canvas')).toBeNull(); }
    else {
      if (ending === 'blur') act(() => window.dispatchEvent(new Event('blur')));
      else if (ending === 'release') await user.pointer({ target, keys: '[/MouseLeft]' });
      else fireEvent(target, new window.PointerEvent(ending, { bubbles: true, pointerId: 1 }));
      expect(model().dragDirection).toBeNull();
      await user.pointer({ target, keys: '[/MouseLeft]' });
    }
    expect(bridge.api.interaction.mock.calls).toEqual([[true], [false]]);
  });
  it('keeps controls visible across a slow pet-to-toolbar handoff inside the shared hover envelope', async () => {
    const user = userEvent.setup();
    const { bridge, container } = await mount();
    const toolbar = screen.getByRole('toolbar', { name: '桌宠快捷操作' });
    const group = container.querySelector<HTMLElement>('[data-pet-controls-region]')!;
    expect(toolbar.getAttribute('data-visible')).toBe('false');
    await user.hover(container.querySelector('canvas')!);
    expect(toolbar.getAttribute('data-visible')).toBe('true');
    await user.hover(group); // the empty connecting area, outside the mesh and buttons
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
    expect(toolbar.getAttribute('data-visible')).toBe('true');
    await user.hover(toolbar);
    expect(toolbar.getAttribute('data-visible')).toBe('true');
    await user.unhover(toolbar);
    await waitFor(() => expect(toolbar.getAttribute('data-visible')).toBe('false'));
    expect(bridge.api.controlsVisible).toHaveBeenLastCalledWith(false);
    // Hovering the compact region also reveals controls without a model event.
    await user.hover(group);
    await waitFor(() => expect(toolbar.getAttribute('data-visible')).toBe('true'));
    // Toolbar envelope does not supply model-hit or selection animation input.
    expect(vi.mocked(PetModel).mock.calls.at(-1)![0]).toMatchObject({ motion: 'idle', interactionActive: true });
    expect(vi.mocked(PetModel).mock.calls.at(-1)![0].onHover).toBeUndefined();
    act(() => window.dispatchEvent(new Event('blur')));
    await waitFor(() => expect(toolbar.getAttribute('data-visible')).toBe('false'));
    await user.unhover(group);
    await user.hover(group);
    await waitFor(() => expect(toolbar.getAttribute('data-visible')).toBe('true'));
  });
  it('does not render the standalone desktop pet name even with legacy names enabled', async () => {
    await mount();
    expect(screen.queryByText(defaultPreferences.petName)).toBeNull();
  });

  it('renders the bundled starter pet without any connected sessions', async () => {
    await mount();
    expect(vi.mocked(PetModel).mock.calls.some(([props]) => props?.modelUrl === undefined)).toBe(true);
  });

  it('confirms only the clicked completed/error bubble, retains working and shows explicit unsupported outcome', async () => {
    const user = userEvent.setup();
    const { bridge } = await mount({ observations: [
      piObservation({ sessionId: 'work', agentName: '工作会话', status: 'working' }),
      piObservation({ sessionId: 'done', agentName: '完成会话', status: 'completed' }),
      piObservation({ sessionId: 'error', agentName: '错误会话', status: 'error' }),
    ] });
    await user.click(screen.getByRole('button', { name: '完成会话 已完成' }));
    expect(screen.queryByRole('button', { name: '完成会话 已完成' })).toBeNull();
    expect(screen.getByRole('button', { name: '错误会话 发生错误' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '错误会话 发生错误' }));
    expect(screen.queryByRole('button', { name: '错误会话 发生错误' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '工作会话 正在工作' }));
    expect(screen.getByRole('button', { name: '工作会话 正在工作' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('暂不支持跳转原会话');
    expect(bridge.api.acknowledgeAndOpen).toHaveBeenLastCalledWith({ provider: 'pi', sessionId: 'work' });
  });

  it('retains keyed DOM and keyboard focus across rename, reorder and status changes', async () => {
    const user = userEvent.setup();
    const { bridge } = await mount({ observations: [
      piObservation({ sessionId: 'target', agentName: '旧名字', status: 'working' }),
      piObservation({ sessionId: 'other', agentName: '其它会话', status: 'working' }),
    ] });
    await user.tab();
    await user.tab();
    const button = screen.getByRole('button', { name: '旧名字 正在工作' });
    expect(document.activeElement).toBe(button);
    act(() => bridge.observe(piObservation({ sessionId: 'target', agentName: '新名字', status: 'working', revision: 2 })));
    expect(screen.getByRole('button', { name: '新名字 正在工作' })).toBe(button);
    expect(document.activeElement).toBe(button);
    act(() => bridge.observe(piObservation({ sessionId: 'target', agentName: '新名字', status: 'completed', revision: 3 })));
    expect(screen.getByRole('button', { name: '新名字 已完成' })).toBe(button);
    expect(document.activeElement).toBe(button);
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('button', { name: '新名字 已完成' })).toBeNull();
  });

  it('expands on pointer/focus and collapses only after both leave; hides bubbles without hiding canvas', async () => {
    const user = userEvent.setup();
    const { bridge, container } = await mount({ observations: piBaselineObservations() });
    const deck = screen.getByRole('group');
    expect(deck.classList.contains('is-expanded')).toBe(false);
    expect(container.querySelectorAll('[data-stacked-hidden="true"]')).toHaveLength(2);
    await user.hover(deck);
    expect(deck.classList.contains('is-expanded')).toBe(true);
    expect(bridge.api.bubblesExpanded).toHaveBeenLastCalledWith(true);
    await user.unhover(deck);
    expect(deck.classList.contains('is-expanded')).toBe(false);
    await user.tab();
    expect(deck.classList.contains('is-expanded')).toBe(true);
    await user.hover(deck);
    await user.unhover(deck);
    expect(deck.classList.contains('is-expanded')).toBe(true);
    await user.click(screen.getByRole('button', { name: '隐藏气泡' }));
    expect(screen.queryByRole('group')).toBeNull();
    expect(container.querySelector('canvas')?.hidden).toBe(false);
    expect(bridge.api.bubblesVisible).toHaveBeenLastCalledWith(false);
    expect(deck.classList.contains('is-expanded')).toBe(false);
    await user.click(screen.getByRole('button', { name: '显示气泡' }));
    expect(screen.getByRole('group')).toBe(deck);
    expect(bridge.api.bubblesVisible).toHaveBeenLastCalledWith(true);
  });

  it('retains screen-coordinate move/resize commands and releases interaction on pointer up and unmount', async () => {
    const user = userEvent.setup();
    const { bridge, container, unmount } = await mount();
    const canvas = container.querySelector('canvas')!;
    const resize = screen.getByRole('button', { name: '调整宠物窗口大小' });
    await user.pointer([
      { keys: '[MouseLeft>]', target: canvas, coords: { screenX: 100, screenY: 200 } },
      { target: canvas, coords: { screenX: 112, screenY: 195 } },
      { keys: '[/MouseLeft]', target: canvas },
    ]);
    expect(bridge.api.moveWindowBy).toHaveBeenLastCalledWith({ x: 12, y: -5 });
    expect(bridge.api.interaction).toHaveBeenLastCalledWith(false);
    expect(container.querySelector('.pet-canvas--dragging')).toBeNull();
    await user.pointer([
      { keys: '[MouseLeft>]', target: resize, coords: { screenX: 112, screenY: 195 } },
      { target: resize, coords: { screenX: 125, screenY: 207 } },
    ]);
    expect(bridge.api.resizeWindowBy).toHaveBeenLastCalledWith({ x: 13, y: 12 });
    expect(bridge.api.interaction).toHaveBeenLastCalledWith(true);
    unmount();
    expect(bridge.api.interaction).toHaveBeenLastCalledWith(false);
  });

  it('applies Main layout without replacing the canvas', async () => {
    const { bridge, container } = await mount();
    const originalCanvas = container.querySelector('canvas');
    const layout = baselineLayout('top-left', 80);
    act(() => bridge.publishLayout(layout));
    const surface = container.querySelector<HTMLElement>('.pet-canvas')!;
    expect(surface.style.width).toBe('80px');
    expect(surface.style.left).toBe(`${layout.pet.x}px`);
    expect(container.querySelector('.bubble-layer')?.getAttribute('data-side')).toBe('below');
    expect(container.querySelector('canvas')).toBe(originalCanvas);
  });
});

describe('App lifecycle and notices', () => {
  it('keeps bubbles and controls usable while the local GLB suspends, then clears loading notice', async () => {
    let resolve!: () => void;
    let loaded = false;
    const pending = new Promise<void>(done => { resolve = () => { loaded = true; done(); }; });
    vi.mocked(PetModel).mockImplementation(({ onReady }) => {
      if (!loaded) throw pending;
      return <ReadyNotice onReady={onReady} />;
    });
    const { container } = await mount({ observations: [piObservation()] });
    expect(screen.getByRole('status').textContent).toContain('正在加载');
    expect(screen.getByRole('button', { name: '隐藏气泡' })).toBeTruthy();
    expect(screen.getByRole('group')).toBeTruthy();
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    await act(async () => { resolve(); await pending; });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('isolates model load errors without removing working bubbles or the toolbar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(PetModel).mockImplementation(() => { throw Error('GLB unavailable'); });
    const user = userEvent.setup();
    await mount({ observations: [piObservation({ agentName: '继续工作' })] });
    expect(screen.getByRole('status').textContent).toBe('内置宠物加载失败，请重新打开窗口。');
    await user.click(screen.getByRole('button', { name: '继续工作 正在工作' }));
    expect(screen.getByRole('button', { name: '继续工作 正在工作' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '隐藏气泡' }));
    expect(screen.getByRole('button', { name: '显示气泡' })).toBeTruthy();
  });

  it('pauses the preference render loop while hidden and resumes it, retaining one visibility subscription through StrictMode', async () => {
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { container, unmount } = await mount();
    const loop = () => container.querySelector('[data-loop-active]')?.getAttribute('data-loop-active');
    expect(loop()).toBe('true');
    act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    expect(loop()).toBe('false');
    act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    expect(loop()).toBe('true');
    const count = (calls: typeof add.mock.calls) => calls.filter(([event]) => event === 'visibilitychange').length;
    expect(count(add.mock.calls) - count(remove.mock.calls)).toBe(1);
    unmount();
    expect(count(add.mock.calls)).toBe(count(remove.mock.calls));
  });

  it('applies bubble and reminder dependencies without acknowledging suppressed results', async () => {
    const { bridge } = await mount({ observations: piBaselineObservations() });
    act(() => bridge.publishPreferences({ ...defaultPreferences, bubbles: false, completed: false }));
    await act(async () => {});
    expect(screen.queryByRole('group')).toBeNull();
    expect(bridge.api.acknowledgeAndOpen).not.toHaveBeenCalled();
    act(() => bridge.publishPreferences({ ...defaultPreferences, completed: false, error: false, petName: '小团子' }));
    await act(async () => {});
    expect(screen.queryByRole('button', { name: /已完成|发生错误/ })).toBeNull();
    expect(screen.queryByText('小团子')).toBeNull();
    expect(bridge.snapshot().bubbles).toHaveLength(5);
  });
  it('subscribes before the initial request, keeps one StrictMode listener pair, and cleans up on unmount', async () => {
    const { bridge, unmount, container } = await mount();
    expect(bridge.api.requestSnapshot).toHaveBeenCalledTimes(1);
    expect(bridge.api.subscribeSnapshot.mock.invocationCallOrder[0]).toBeLessThan(bridge.api.requestSnapshot.mock.invocationCallOrder[0]!);
    expect(bridge.api.subscribeLayout.mock.invocationCallOrder[0]).toBeLessThan(bridge.api.requestSnapshot.mock.invocationCallOrder[0]!);
    expect(bridge.listenerCounts()).toEqual({ snapshot: 1, layout: 1 });
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    unmount();
    expect(bridge.listenerCounts()).toEqual({ snapshot: 0, layout: 0 });
  });

  it('resets the 3500ms notice timer for repeated results, expires, and clears it on unmount', async () => {
    const user = timerUser();
    const { unmount } = await mount({ observations: [piObservation({ agentName: '会话', status: 'working' })] });
    const button = screen.getByRole('button', { name: '会话 正在工作' });
    await user.click(button);
    act(() => vi.advanceTimersByTime(2000));
    await user.click(button);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('status').textContent).toBe('暂不支持跳转原会话');
    act(() => vi.advanceTimersByTime(1499));
    expect(screen.getByRole('status').textContent).not.toBe('');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status').textContent).toBe('');
    await user.click(button);
    unmount();
    // Motion may leave its final scheduler tick; it must not retain a loop.
    act(() => vi.advanceTimersByTime(20));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['not-found', '找不到对应 Session。'],
    ['permission-denied', '没有打开窗口的权限。'],
    ['success', ''],
  ] as const)('shows the %s result', async (status, message) => {
    const user = userEvent.setup();
    await mount({ observations: [piObservation()], openSession: async () => ({ status }) });
    await user.click(screen.getAllByRole('button')[0]!);
    expect(screen.getByRole('status').textContent).toBe(message);
  });

  it('reports open failures without resurrecting confirmed bubbles', async () => {
    const user = userEvent.setup();
    await mount({ observations: [piObservation({ status: 'completed' })], openSession: async () => { throw Error('offline'); } });
    await user.click(screen.getAllByRole('button')[0]!);
    expect(screen.queryByRole('button', { name: /已完成/ })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('暂时无法打开原会话窗口');
  });

  it('keeps the latest click outcome when older requests resolve later', async () => {
    const user = userEvent.setup();
    const results: Array<(result: OpenSessionResult) => void> = [];
    await mount({ observations: [piObservation()], openSession: () => new Promise(resolve => results.push(resolve)) });
    const button = screen.getAllByRole('button')[0]!;
    await user.click(button);
    await user.click(button);
    await act(async () => results[1]!({ status: 'permission-denied' }));
    expect(screen.getByRole('status').textContent).toBe('没有打开窗口的权限。');
    await act(async () => results[0]!({ status: 'success' }));
    expect(screen.getByRole('status').textContent).toBe('没有打开窗口的权限。');
  });

  it('renders initial request failures without removing the toolbar or canvas', async () => {
    const bridge = createPetBridgeDouble();
    bridge.api.requestSnapshot.mockRejectedValue(Error('offline'));
    const { container } = render(<StrictMode><App store={createPetStore(bridge.api)} /></StrictMode>);
    await act(async () => {});
    expect(screen.getByRole('status').textContent).toBe('无法获取 Session 状态，请重新打开窗口。');
    expect(screen.getByRole('button', { name: '隐藏气泡' })).toBeTruthy();
    expect(container.querySelector('canvas')).toBeTruthy();
  });

  it('ignores an open result after unmount, without creating a timer', async () => {
    const user = timerUser();
    let resolve!: (result: OpenSessionResult) => void;
    const { unmount } = await mount({ observations: [piObservation()], openSession: () => new Promise(done => { resolve = done; }) });
    await user.click(screen.getAllByRole('button')[0]!);
    unmount();
    await act(async () => resolve({ status: 'unsupported' }));
    // Motion may leave its final scheduler tick; it must not retain a loop.
    act(() => vi.advanceTimersByTime(20));
    expect(vi.getTimerCount()).toBe(0);
  });
});
