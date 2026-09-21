import { Eye, EyeOff, MoveDiagonal2 } from 'lucide-react';
import type { Rect } from '../../../shared/overlay-layout.js';
import type { PetBridge } from '../../app/bridge/pet-store.js';
import { rectStyle } from '../../shared/rect-style.js';
import { useWindowGesture } from '../../shared/use-window-gesture.js';

export function Toolbar({ bridge, rect, hidden, onToggle }: {
  bridge: PetBridge; rect: Rect | undefined; hidden: boolean; onToggle: () => void;
}) {
  const resize = useWindowGesture(bridge, 'resizeWindowBy');
  const label = hidden ? '显示气泡' : '隐藏气泡';
  return <div className="pet-toolbar" style={rectStyle(rect)}>
    <button className="bubble-toggle" type="button" title={label} aria-label={label} onClick={onToggle}>
      {hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </button>
    <button className="resize-handle" type="button" title="调整宠物窗口大小" aria-label="调整宠物窗口大小" {...resize.handlers}>
      <MoveDiagonal2 aria-hidden="true" />
    </button>
  </div>;
}
