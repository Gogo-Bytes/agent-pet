// @vitest-environment jsdom
import '../../test-support/dom-platform.js';
import { StrictMode, useState, useSyncExternalStore } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { BubbleStack } from './BubbleStack.js';
import { createPetBridgeDouble } from '../../test-support/pet-bridge-double.js';
import { baselineLayout, piObservation } from '../../test-support/pi-fixtures.js';
import { createPetStore, type PetStore } from '../../app/bridge/pet-store.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function Harness({ store }: { store: PetStore }) {
  const { sessions, layout } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [hidden, setHidden] = useState(false);
  return <><button onClick={() => setHidden(value => !value)}>toggle</button>
    <BubbleStack bridge={store.bridge} state={sessions} layout={layout} hidden={hidden}
      onOpen={async session => { await store.bridge.acknowledgeAndOpen(session); }} />
  </>;
}
async function mount(bridge = createPetBridgeDouble({ observations: [piObservation()] })) {
  const view = render(<StrictMode><Harness store={createPetStore(bridge.api)} /></StrictMode>);
  await act(async () => {});
  return { bridge, ...view };
}
function deferred() {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it('does not reveal before presence acknowledgement, nor expand before geometry acknowledgement', async () => {
  const user = userEvent.setup();
  const bridge = createPetBridgeDouble({ observations: [piObservation()] });
  const presence = deferred();
  bridge.api.bubblesVisible.mockImplementation(value => value ? presence.promise : Promise.resolve());
  const { container } = await mount(bridge);
  expect(screen.queryByRole('group')).toBeNull();
  await act(async () => presence.resolve());
  const deck = screen.getByRole('group');
  const layer = container.querySelector<HTMLElement>('.bubble-layer')!;
  expect(layer.style.height).toBe('88px');
  const expansion = deferred();
  bridge.api.bubblesExpanded.mockImplementation(value => value ? expansion.promise : Promise.resolve());
  await user.hover(deck);
  expect(deck.classList.contains('is-expanded')).toBe(false);
  expect(layer.style.height).toBe('88px');
  await act(async () => expansion.resolve());
  expect(deck.classList.contains('is-expanded')).toBe(true);
  expect(layer.style.height).toBe('204px');
  // Atomic collapse before Main is told to shrink, no visible exiting nodes.
  const heightsAtRelease: string[] = [];
  bridge.api.bubblesExpanded.mockImplementation(async value => {
    if (!value) heightsAtRelease.push(layer.style.height);
  });
  await user.unhover(deck);
  expect(deck.classList.contains('is-expanded')).toBe(false);
  expect(heightsAtRelease).toEqual(['88px']);
  const hiddenAtFailureRelease: boolean[] = [];
  bridge.api.bubblesExpanded.mockImplementation(value => value ? Promise.reject(Error('IPC unavailable')) : Promise.resolve());
  bridge.api.bubblesVisible.mockImplementation(async value => {
    if (!value) hiddenAtFailureRelease.push(layer.hidden);
  });
  await user.hover(deck);
  expect(screen.queryByRole('group')).toBeNull();
  expect(hiddenAtFailureRelease).toEqual([true]);
});

it('ignores stale expand/show acknowledgements through rapid leave/hide/show and fails closed on IPC rejection', async () => {
  const user = userEvent.setup();
  const { bridge } = await mount();
  const deck = screen.getByRole('group');
  const expansion = deferred();
  bridge.api.bubblesExpanded.mockImplementation(value => value ? expansion.promise : Promise.resolve());
  await user.hover(deck);
  await user.unhover(deck);
  await act(async () => expansion.resolve());
  expect(deck.classList.contains('is-expanded')).toBe(false);
  await user.click(screen.getByText('toggle'));
  const oldShow = deferred();
  bridge.api.bubblesVisible.mockImplementation(value => value ? oldShow.promise : Promise.resolve());
  await user.click(screen.getByText('toggle'));
  await user.click(screen.getByText('toggle'));
  await act(async () => oldShow.resolve());
  expect(screen.queryByRole('group')).toBeNull();
  const newShow = deferred();
  bridge.api.bubblesVisible.mockImplementation(value => value ? newShow.promise : Promise.resolve());
  await user.click(screen.getByText('toggle'));
  await act(async () => newShow.reject());
  expect(screen.queryByRole('group')).toBeNull();
  expect(bridge.api.bubblesVisible).toHaveBeenLastCalledWith(false);
});

it('removes the last acknowledged node before releasing its native region; new working sessions respect hidden preference', async () => {
  const user = userEvent.setup();
  const bridge = createPetBridgeDouble({ observations: [piObservation({ status: 'completed' })] });
  const { container, unmount } = await mount(bridge);
  const nodesAtRelease: Array<Element | null> = [];
  bridge.api.bubblesVisible.mockImplementation(async value => {
    if (!value) nodesAtRelease.push(container.querySelector('.session-bubble'));
  });
  await user.click(screen.getByRole('button', { name: /已完成/ }));
  expect(container.querySelector('.session-bubble')).toBeNull();
  expect(nodesAtRelease.length).toBeGreaterThan(0);
  expect(nodesAtRelease.every(node => node === null)).toBe(true);
  expect(bridge.api.bubblesVisible).toHaveBeenLastCalledWith(false);
  bridge.api.bubblesVisible.mockResolvedValue();
  await act(async () => bridge.observe(piObservation({ sessionId: 'new', agentName: '新会话' })));
  expect(screen.getByRole('button', { name: '新会话 正在工作' })).toBeTruthy();
  await user.click(screen.getByText('toggle'));
  await act(async () => bridge.observe(piObservation({ sessionId: 'another' })));
  expect(screen.queryByRole('group')).toBeNull();
  unmount();
  expect(bridge.api.bubblesVisible).toHaveBeenLastCalledWith(false);
  expect(bridge.api.bubblesExpanded).toHaveBeenLastCalledWith(false);
});

it('starts empty without intercepting bubbles and clips the collapsed strip to Main geometry on either side', async () => {
  const bridge = createPetBridgeDouble();
  const { container } = await mount(bridge);
  expect(screen.queryByRole('group')).toBeNull();
  expect(bridge.api.bubblesVisible).toHaveBeenLastCalledWith(false);
  await act(async () => bridge.observe(piObservation()));
  const layer = container.querySelector<HTMLElement>('.bubble-layer')!;
  let layout = baselineLayout();
  expect(layer.style.top).toBe(`${layout.bubbles.y + layout.bubbles.height - 88}px`);
  layout = baselineLayout('top-left', 80);
  act(() => bridge.publishLayout(layout));
  expect(layer.style.top).toBe(`${layout.bubbles.y}px`);
  expect(layer.style.height).toBe('88px');
});

it('uses real Motion bounded opacity, disables it for reduced motion and reacts to preference changes', async () => {
  const media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, 'matches', { configurable: true, value: true });
  vi.stubGlobal('matchMedia', () => media);
  const { container } = await mount();
  const deck = screen.getByRole('group');
  expect(deck.getAttribute('data-motion')).toBe('reduced');
  expect(container.querySelector<HTMLElement>('.session-bubble')!.style.opacity).toBe('1');
  act(() => {
    Object.defineProperty(media, 'matches', { configurable: true, value: false });
    media.dispatchEvent(new Event('change'));
  });
  expect(deck.getAttribute('data-motion')).toBe('opacity');
  expect(deck.style.transform).toBe('');
  act(() => {
    Object.defineProperty(media, 'matches', { configurable: true, value: true });
    media.dispatchEvent(new Event('change'));
  });
  await waitFor(() => expect(deck.style.opacity).toBe('1'));
  await waitFor(() => expect(container.querySelector<HTMLElement>('.session-bubble')!.style.opacity).toBe('1'));
  vi.unstubAllGlobals();
});

it('runs actual opacity state transitions without changing the Main-sized clipping rectangle or retaining exits', async () => {
  const user = userEvent.setup();
  const { container } = await mount();
  const deck = screen.getByRole('group');
  const layer = container.querySelector<HTMLElement>('.bubble-layer')!;
  await waitFor(() => expect(deck.style.opacity).toBe('1'));
  await user.hover(deck);
  await waitFor(() => expect(Number(deck.style.opacity)).toBeLessThan(1));
  expect(layer.style.height).toBe('204px');
  expect(deck.style.transform).toBe('');
  await waitFor(() => expect(deck.style.opacity).toBe('1'));
  await user.unhover(deck);
  expect(layer.style.height).toBe('88px');
  await waitFor(() => expect(Number(deck.style.opacity)).toBeLessThan(1));
  await user.click(screen.getByText('toggle'));
  expect(screen.queryByRole('group')).toBeNull();
  expect(layer.hidden).toBe(true);
});
