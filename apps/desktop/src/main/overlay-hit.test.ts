import { expect, it } from 'vitest';
import { layoutOverlay } from './overlay-layout.js';
import { overlayHit } from './overlay-hit.js';

it('passes through transparent margins and hidden toolbar, retaining only committed controls and drag capture', () => {
  const layout = layoutOverlay({ x: 400, y: 400, width: 140, height: 140 }, { x: 0, y: 0, width: 1440, height: 900 });
  const state = { interacting: false, controlsVisible: false, bubblesVisible: false, bubblesExpanded: false };
  const center = (rect: typeof layout.pet) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  expect(overlayHit(layout, center(layout.pet), state)).toBe(true);
  expect(overlayHit(layout, center(layout.toolbar), state)).toBe(false);
  expect(overlayHit(layout, center(layout.toolbar), { ...state, controlsVisible: true })).toBe(true);
  expect(overlayHit(layout, center(layout.bubbles), state)).toBe(false);
  expect(overlayHit(layout, center(layout.bubbles), { ...state, bubblesVisible: true, bubblesExpanded: true })).toBe(true);
  expect(overlayHit(layout, { x: 0, y: 0 }, state)).toBe(false);
  expect(overlayHit(layout, { x: -100, y: -100 }, { ...state, interacting: true })).toBe(true);
});
