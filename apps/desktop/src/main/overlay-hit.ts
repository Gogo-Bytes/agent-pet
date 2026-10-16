import { petControlsRect, type OverlayLayout, type Rect } from '../shared/overlay-layout.js';

/** Pet and toolbar can initiate hover; committed controls also join their small gap. */
export function overlayHit(layout: OverlayLayout, point: { x: number; y: number }, state: {
  interacting: boolean; controlsVisible: boolean; bubblesVisible: boolean; bubblesExpanded: boolean;
}): boolean {
  if (state.interacting) return true;
  const height = Math.min(layout.bubbles.height, state.bubblesExpanded ? layout.bubbles.height : 88);
  const bubble = { ...layout.bubbles, height,
    y: layout.bubbles.y < layout.pet.y ? layout.bubbles.y + layout.bubbles.height - height : layout.bubbles.y };
  const regions: Rect[] = [layout.pet, state.controlsVisible ? petControlsRect(layout) : layout.toolbar, ...(state.bubblesVisible ? [bubble] : [])];
  return regions.some(rect => point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height);
}
