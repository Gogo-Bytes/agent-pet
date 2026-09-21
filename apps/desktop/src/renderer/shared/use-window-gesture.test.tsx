// @vitest-environment jsdom
import '../test-support/dom-platform.js';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { useWindowGesture } from './use-window-gesture.js';
import { createPetBridgeDouble } from '../test-support/pet-bridge-double.js';
import type { PetBridge } from '../app/bridge/pet-store.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function Surface({ bridge, kind = 'moveWindowBy', click }: {
  bridge: PetBridge; kind?: 'moveWindowBy' | 'resizeWindowBy'; click?: () => void;
}) {
  const gesture = useWindowGesture(bridge, kind);
  return <button {...gesture.handlers} onClick={click} data-active={gesture.active}><span>surface</span><svg><path data-testid="resize-icon-path" d="M0 0L10 10" /></svg></button>;
}

it.each(['pointercancel', 'lostpointercapture', 'window blur', 'focus blur', 'unmount'])('releases exactly once on %s and ignores subsequent motion/up', async reason => {
  const user = userEvent.setup();
  const bridge = createPetBridgeDouble();
  const view = render(<StrictMode><Surface bridge={bridge.api} /></StrictMode>);
  const target = screen.getByText('surface'); // capture is on a nested actual target
  await user.pointer({ keys: '[MouseLeft>]', target, coords: { screenX: 200, screenY: 80 } });
  await user.pointer({ target, coords: { screenX: 212, screenY: 88 } });
  expect(bridge.api.moveWindowBy).toHaveBeenLastCalledWith({ x: 12, y: 8 });
  if (reason === 'unmount') view.unmount();
  else if (reason === 'window blur') act(() => window.dispatchEvent(new Event('blur')));
  else if (reason === 'focus blur') fireEvent.blur(screen.getByRole('button'));
  else fireEvent(target, new window.PointerEvent(reason, { bubbles: true, pointerId: 1 }));
  expect(bridge.api.interaction.mock.calls).toEqual([[true], [false]]);
  if (reason === 'unmount') {
    // A removed node cannot receive real pointer events; subsequent native
    // events go to the window, not user-event's detached selection target.
    fireEvent.pointerMove(window, { screenX: 230, screenY: 90, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
  } else {
    await user.pointer({ target, coords: { screenX: 230, screenY: 90 } });
    await user.pointer({ keys: '[/MouseLeft]', target });
  }
  view.unmount();
  expect(bridge.api.moveWindowBy).toHaveBeenCalledTimes(1);
  expect(bridge.api.interaction.mock.calls).toEqual([[true], [false]]);
  expect(target.hasPointerCapture(1)).toBe(false);
});

it.each(['blur', 'unmount'])('releases SVG-originated pointer capture on %s', async reason => {
  const user = userEvent.setup();
  const bridge = createPetBridgeDouble();
  try {
    const view = render(<Surface bridge={bridge.api} kind="resizeWindowBy" />);
    const target = screen.getByTestId('resize-icon-path');
    await user.pointer({ keys: '[MouseLeft>]', target, coords: { screenX: 100, screenY: 100 } });
    expect(target.hasPointerCapture(1)).toBe(true);
    if (reason === 'unmount') view.unmount();
    else act(() => window.dispatchEvent(new Event('blur')));
    expect(target.hasPointerCapture(1)).toBe(false);
    expect(bridge.api.interaction.mock.calls).toEqual([[true], [false]]);
    view.unmount();
    expect(bridge.api.interaction.mock.calls).toEqual([[true], [false]]);
  } finally { bridge.dispose(); }
});

it('sends incremental screen DIP deltas despite client-coordinate shifts, DPR and Main clamps; a new drag resets its origin', async () => {
  const user = userEvent.setup();
  const bridge = createPetBridgeDouble();
  vi.stubGlobal('devicePixelRatio', 2);
  render(<Surface bridge={bridge.api} />);
  const target = screen.getByText('surface');
  await user.pointer([
    { target, keys: '[MouseLeft>]', coords: { screenX: -100, screenY: 20, clientX: 5 } },
    { target, coords: { screenX: -150, screenY: 20, clientX: 60 } },
    { target, coords: { screenX: -147, screenY: 18, clientX: 60 } },
    { target, keys: '[/MouseLeft]' },
    { target, keys: '[MouseLeft>]', coords: { screenX: 400, screenY: 40 } },
    { target, coords: { screenX: 401, screenY: 42 } },
    { target, keys: '[/MouseLeft]' },
  ]);
  expect(bridge.api.moveWindowBy.mock.calls).toEqual([[{ x: -50, y: 0 }], [{ x: 3, y: -2 }], [{ x: 1, y: 2 }]]);
  vi.unstubAllGlobals();
});

it('keeps ordinary click/Enter/Space semantics, ignores secondary button, and resizes with library keyboard deltas', async () => {
  const user = userEvent.setup();
  const bridge = createPetBridgeDouble();
  const click = vi.fn();
  render(<Surface bridge={bridge.api} kind="resizeWindowBy" click={click} />);
  const button = screen.getByRole('button');
  await user.click(button);
  expect(click).toHaveBeenCalledTimes(1);
  expect(bridge.api.resizeWindowBy).not.toHaveBeenCalled();
  await user.keyboard('{Enter} ');
  expect(click).toHaveBeenCalledTimes(3);
  bridge.api.interaction.mockClear();
  await user.pointer([{ target: button, keys: '[MouseRight>]' }, { target: button, keys: '[/MouseRight]' }]);
  expect(bridge.api.interaction).not.toHaveBeenCalled();
  await user.keyboard('{ArrowRight}{ArrowUp}');
  expect(bridge.api.resizeWindowBy.mock.calls).toEqual([[{ x: 10, y: 0 }], [{ x: 0, y: -10 }]]);
  expect(bridge.api.interaction.mock.calls).toEqual([[true], [false], [true], [false]]);
});
