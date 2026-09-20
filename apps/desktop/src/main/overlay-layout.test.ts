import { expect, it } from 'vitest';
import { layoutOverlay } from './overlay-layout.js';

for (const area of [{ x: 0, y: 25, width: 1440, height: 875 }, { x: -1280, y: -200, width: 1280, height: 900 }]) {
  for (const [x, y] of [[-9999,-9999],[9999,9999],[200,400]]) {
    it(`keeps pet and auxiliary regions inside ${area.x} display at ${x},${y}`, () => {
      const result = layoutOverlay({ x: x!, y: y!, width: 140, height: 140 }, area);
      expect(result.bounds.x).toBeGreaterThanOrEqual(area.x);
      expect(result.bounds.y).toBeGreaterThanOrEqual(area.y);
      expect(result.bounds.x + result.bounds.width).toBeLessThanOrEqual(area.x + area.width);
      expect(result.bounds.y + result.bounds.height).toBeLessThanOrEqual(area.y + area.height);
      const { pet, bubbles, toolbar } = result;
      for (const rect of [bubbles, toolbar]) {
        expect(rect.y + rect.height <= pet.y || rect.y >= pet.y + pet.height).toBe(true);
      }
    });
  }
}
