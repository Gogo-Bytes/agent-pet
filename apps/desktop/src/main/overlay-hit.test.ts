import { expect, it } from 'vitest';
import { petControlsRect } from '../shared/overlay-layout.js';
import { layoutOverlay } from './overlay-layout.js';
import { overlayHit } from './overlay-hit.js';

it('allows direct pet and toolbar hover while passing through distant margins', () => {
  const layout = layoutOverlay({ x: 400, y: 400, width: 140, height: 140 }, { x: 0, y: 0, width: 1440, height: 900 });
  const state = { interacting: false, controlsVisible: false, bubblesVisible: false, bubblesExpanded: false };
  const center = (rect: typeof layout.pet) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  expect(overlayHit(layout, center(layout.pet), state)).toBe(true);
  expect(overlayHit(layout, center(layout.toolbar), state)).toBe(true);
  expect(overlayHit(layout, center(layout.toolbar), { ...state, controlsVisible: true })).toBe(true);
  expect(overlayHit(layout, center(layout.bubbles), state)).toBe(false);
  expect(overlayHit(layout, center(layout.bubbles), { ...state, bubblesVisible: true, bubblesExpanded: true })).toBe(true);
  expect(overlayHit(layout, { x: 0, y: 0 }, state)).toBe(false);
  expect(overlayHit(layout, { x: -100, y: -100 }, { ...state, interacting: true })).toBe(true);
});

it.each([80, 140, 600])('joins the gap only while controls are committed, above and below a %ipx pet', size => {
  for (const y of [-9999, 400]) {
    const layout = layoutOverlay({ x: 400, y, width: size, height: size }, { x: 0, y: 25, width: 1440, height: 875 });
    const state = { interacting: false, controlsVisible: false, bubblesVisible: false, bubblesExpanded: false };
    const gap = { x: layout.toolbar.x + layout.toolbar.width / 2,
      y: layout.toolbar.y < layout.pet.y
        ? (layout.toolbar.y + layout.toolbar.height + layout.pet.y) / 2
        : (layout.pet.y + layout.pet.height + layout.toolbar.y) / 2 };
    expect(overlayHit(layout, gap, state)).toBe(false);
    expect(overlayHit(layout, gap, { ...state, controlsVisible: true })).toBe(true);
    const group = petControlsRect(layout);
    expect(overlayHit(layout, { x: group.x - 1, y: gap.y }, { ...state, controlsVisible: true })).toBe(false);
    expect(overlayHit(layout, { x: group.x + group.width + 1, y: gap.y }, { ...state, controlsVisible: true })).toBe(false);
    expect(group.y).toBeGreaterThanOrEqual(0);
    expect(group.y + group.height).toBeLessThanOrEqual(layout.bounds.height);
    expect(overlayHit(layout, gap, state)).toBe(false);
  }
});
