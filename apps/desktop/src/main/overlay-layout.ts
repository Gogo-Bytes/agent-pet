export type Rect = { x: number; y: number; width: number; height: number };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function layoutOverlay(anchor: Rect, area: Rect) {
  const size = Math.min(Math.max(80, anchor.width), 600, area.width, area.height - 60);
  const pet = { x: clamp(anchor.x, area.x, area.x + area.width - size),
    y: clamp(anchor.y, area.y + 50, area.y + area.height - size - 50), width: size, height: size };
  const width = Math.min(300, area.width);
  const x = clamp(pet.x + (size - width) / 2, area.x, area.x + area.width - width);
  const above = pet.y - area.y - 12;
  const below = area.y + area.height - pet.y - size - 12;
  const onTop = above >= 72 || above >= below;
  const height = Math.max(0, Math.min(204, onTop ? above : below));
  const bubbles = { x, y: onTop ? pet.y - height - 12 : pet.y + size + 12, width, height };
  const toolbar = { x: clamp(pet.x + (size - 116) / 2, area.x, area.x + area.width - 116),
    y: onTop ? pet.y + size + 6 : pet.y - 44, width: 116, height: 38 };
  const left = Math.floor(Math.min(pet.x, bubbles.x, toolbar.x));
  const top = Math.floor(Math.min(pet.y, bubbles.y, toolbar.y));
  const right = Math.ceil(Math.max(pet.x + size, bubbles.x + width, toolbar.x + toolbar.width));
  const bottom = Math.ceil(Math.max(pet.y + size, bubbles.y + height, toolbar.y + toolbar.height));
  const local = (r: Rect) => ({ ...r, x: r.x - left, y: r.y - top });
  return { anchor: pet, bounds: { x: left, y: top, width: right - left, height: bottom - top },
    pet: local(pet), bubbles: local(bubbles), toolbar: local(toolbar) };
}
export type OverlayLayout = ReturnType<typeof layoutOverlay>;
