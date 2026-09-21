import type { CSSProperties } from 'react';
import type { Rect } from '../../shared/overlay-layout.js';

export function rectStyle(rect: Rect | undefined): CSSProperties {
  return rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : {};
}
