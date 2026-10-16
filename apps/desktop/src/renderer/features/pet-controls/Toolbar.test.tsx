// @vitest-environment jsdom
import '../../test-support/dom-platform.js';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Toolbar } from './Toolbar.js';
import { createPetBridgeDouble } from '../../test-support/pet-bridge-double.js';
import { baselineLayout } from '../../test-support/pi-fixtures.js';
afterEach(cleanup);

it('waits for Main before revealing controls and ignores a late acknowledgement after leave', async () => {
  const bridge = createPetBridgeDouble();
  let acknowledge!: () => void;
  bridge.api.controlsVisible.mockImplementation(visible => visible ? new Promise<void>(resolve => { acknowledge = resolve; }) : Promise.resolve());
  const frame = (engaged: boolean) => <Toolbar bridge={bridge.api} layout={baselineLayout()} engaged={engaged} hidden={false} onToggle={() => {}} />;
  const { rerender, unmount } = render(frame(true));
  const toolbar = screen.getByRole('toolbar');
  expect(toolbar.getAttribute('data-visible')).toBe('false');
  rerender(frame(false));
  await waitFor(() => expect(bridge.api.controlsVisible).toHaveBeenLastCalledWith(false));
  await act(async () => acknowledge());
  expect(toolbar.getAttribute('data-visible')).toBe('false');
  unmount();
  expect(bridge.api.controlsVisible).toHaveBeenLastCalledWith(false);
});

it('fails closed if Main rejects visibility and can recover on the next engagement', async () => {
  const bridge = createPetBridgeDouble();
  bridge.api.controlsVisible.mockRejectedValueOnce(Error('IPC unavailable'));
  const frame = (engaged: boolean) => <Toolbar bridge={bridge.api} layout={baselineLayout()} engaged={engaged} hidden={false} onToggle={() => {}} />;
  const { rerender } = render(frame(true));
  await act(async () => {});
  expect(screen.getByRole('toolbar').getAttribute('data-visible')).toBe('false');
  expect(bridge.api.controlsVisible).toHaveBeenLastCalledWith(false);
  rerender(frame(false));
  await waitFor(() => expect(bridge.api.controlsVisible.mock.calls.filter(([visible]) => !visible).length).toBeGreaterThan(1));
  rerender(frame(true));
  await waitFor(() => expect(screen.getByRole('toolbar').getAttribute('data-visible')).toBe('true'));
});

it('releases stale button focus on window blur and supports keyboard re-entry', async () => {
  const bridge = createPetBridgeDouble();
  render(<Toolbar bridge={bridge.api} layout={baselineLayout()} engaged={false} hidden={false} onToggle={() => {}} />);
  const toolbar = screen.getByRole('toolbar');
  const button = screen.getByRole('button', { name: '隐藏气泡' });
  act(() => button.focus());
  await waitFor(() => expect(toolbar.getAttribute('data-visible')).toBe('true'));
  fireEvent.pointerLeave(toolbar);
  fireEvent.blur(window);
  await waitFor(() => expect(toolbar.getAttribute('data-visible')).toBe('false'));
  expect(bridge.api.controlsVisible).toHaveBeenLastCalledWith(false);
  act(() => { button.blur(); button.focus(); });
  await waitFor(() => expect(toolbar.getAttribute('data-visible')).toBe('true'));
});

it('does not revive stale model engagement when the hidden page returns', async () => {
  const bridge = createPetBridgeDouble();
  const frame = (pageVisible: boolean, engaged = true) => <Toolbar pageVisible={pageVisible} bridge={bridge.api} layout={baselineLayout()} engaged={engaged} hidden={false} onToggle={() => {}} />;
  const { rerender } = render(frame(true));
  const toolbar = screen.getByRole('toolbar');
  await waitFor(() => expect(toolbar.getAttribute('data-visible')).toBe('true'));
  rerender(frame(false));
  await waitFor(() => expect(bridge.api.controlsVisible).toHaveBeenLastCalledWith(false));
  rerender(frame(true));
  expect(toolbar.getAttribute('data-visible')).toBe('false');
  rerender(frame(true, false));
  rerender(frame(true, true));
  await waitFor(() => expect(toolbar.getAttribute('data-visible')).toBe('true'));
});
