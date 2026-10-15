// Renderer-safe geometry contract. Main remains the authority for screen layout.
export type Rect = { x: number; y: number; width: number; height: number };
export type OverlayLayout = {
  anchor: Rect;
  bounds: Rect;
  pet: Rect;
  bubbles: Rect;
  toolbar: Rect;
};

/** Compact hover envelope joining the pet surface and its adjacent controls. */
export function petControlsRect(layout: Pick<OverlayLayout, 'pet' | 'toolbar'>): Rect {
  const x = Math.min(layout.pet.x, layout.toolbar.x);
  const y = Math.min(layout.pet.y, layout.toolbar.y);
  return { x, y,
    width: Math.max(layout.pet.x + layout.pet.width, layout.toolbar.x + layout.toolbar.width) - x,
    height: Math.max(layout.pet.y + layout.pet.height, layout.toolbar.y + layout.toolbar.height) - y };
}
