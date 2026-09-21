// Renderer-safe geometry contract. Main remains the authority for screen layout.
export type Rect = { x: number; y: number; width: number; height: number };
export type OverlayLayout = {
  anchor: Rect;
  bounds: Rect;
  pet: Rect;
  bubbles: Rect;
  toolbar: Rect;
};
