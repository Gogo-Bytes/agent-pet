// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { configure, getConfig } from '@testing-library/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenSessionResult } from '@agent-pet/adapter-core';
import { App } from './App.js';
import { createPetStore } from './bridge/pet-store.js';
import { createPetBridgeDouble } from '../test-support/pet-bridge-double.js';
import { baselineLayout, piBaselineObservations, piObservation } from '../test-support/pi-fixtures.js';
import { createPetScene } from '../features/pet/pet-scene.js';

vi.mock('../features/pet/pet-scene.js', () => ({ createPetScene: vi.fn(() => vi.fn()) }));
const asyncWrapper = getConfig().asyncWrapper;
afterEach(() => { cleanup(); configure({ asyncWrapper }); vi.useRealTimers(); vi.clearAllMocks(); });
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

async function mount(options: Parameters<typeof createPetBridgeDouble>[0] = {}) {
  const bridge = createPetBridgeDouble(options);
  const store = createPetStore(bridge.api);
  const view = render(<StrictMode><App store={store} /></StrictMode>);
  await act(async () => {});
  return { bridge, store, ...view };
}

describe('App session interactions', () => {
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
    // jsdom has no native pointer capture; only that platform API is substituted.
    for (const element of [canvas, resize]) {
      const captured = new Set<number>();
      Object.assign(element, {
        setPointerCapture: (id: number) => captured.add(id),
        hasPointerCapture: (id: number) => captured.has(id),
        releasePointerCapture: (id: number) => captured.delete(id),
      });
    }
    await user.pointer([
      { keys: '[MouseLeft>]', target: canvas, coords: { screenX: 100, screenY: 200 } },
      { target: canvas, coords: { screenX: 112, screenY: 195 } },
      { keys: '[/MouseLeft]', target: canvas },
    ]);
    expect(bridge.api.moveWindowBy).toHaveBeenLastCalledWith({ x: 12, y: -5 });
    expect(bridge.api.interaction).toHaveBeenLastCalledWith(false);
    expect(canvas.classList.contains('pet-canvas--dragging')).toBe(false);
    await user.pointer([
      { keys: '[MouseLeft>]', target: resize, coords: { screenX: 112, screenY: 195 } },
      { target: resize, coords: { screenX: 125, screenY: 207 } },
    ]);
    expect(bridge.api.resizeWindowBy).toHaveBeenLastCalledWith({ x: 13, y: 12 });
    expect(bridge.api.interaction).toHaveBeenLastCalledWith(true);
    unmount();
    expect(bridge.api.interaction).toHaveBeenLastCalledWith(false);
  });

  it('applies Main layout without recreating the scene', async () => {
    const { bridge, container } = await mount();
    const sceneCount = vi.mocked(createPetScene).mock.calls.length;
    const layout = baselineLayout('top-left', 80);
    act(() => bridge.publishLayout(layout));
    const canvas = container.querySelector('canvas')!;
    expect(canvas.style.width).toBe('80px');
    expect(canvas.style.left).toBe(`${layout.pet.x}px`);
    expect(container.querySelector('.bubble-layer')?.getAttribute('data-side')).toBe('below');
    expect(createPetScene).toHaveBeenCalledTimes(sceneCount);
  });
});

describe('App lifecycle and notices', () => {
  it('subscribes before the initial request, keeps one StrictMode listener pair, and cleans up every scene', async () => {
    const { bridge, unmount, container } = await mount();
    expect(bridge.api.requestSnapshot).toHaveBeenCalledTimes(1);
    expect(bridge.api.subscribeSnapshot.mock.invocationCallOrder[0]).toBeLessThan(bridge.api.requestSnapshot.mock.invocationCallOrder[0]!);
    expect(bridge.api.subscribeLayout.mock.invocationCallOrder[0]).toBeLessThan(bridge.api.requestSnapshot.mock.invocationCallOrder[0]!);
    expect(bridge.listenerCounts()).toEqual({ snapshot: 1, layout: 1 });
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    const scenes = vi.mocked(createPetScene).mock.results;
    expect(scenes).toHaveLength(2);
    expect(scenes[0]!.value).toHaveBeenCalledTimes(1);
    expect(scenes[1]!.value).not.toHaveBeenCalled();
    unmount();
    expect(scenes[1]!.value).toHaveBeenCalledTimes(1);
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
    expect(vi.getTimerCount()).toBe(0);
  });
});
