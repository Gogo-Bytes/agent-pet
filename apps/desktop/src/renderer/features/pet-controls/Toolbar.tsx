import { Eye, EyeOff, MoveDiagonal2 } from 'lucide-react';
import type { OverlayLayout } from '../../../shared/overlay-layout.js';
import type { PetBridge } from '../../app/bridge/pet-store.js';
import { rectStyle } from '../../shared/rect-style.js';
import { useWindowGesture } from '../../shared/use-window-gesture.js';
import { GlassSurface } from '../../shared/ui/GlassSurface.js';
import { IconButton } from '../../shared/ui/IconButton.js';
import { Tooltip } from '../../shared/ui/Tooltip.js';
import styles from './Toolbar.module.css';

export function Toolbar({ bridge, layout, hidden, onToggle }: {
  bridge: PetBridge; layout: OverlayLayout | null; hidden: boolean; onToggle: () => void;
}) {
  const resize = useWindowGesture(bridge, 'resizeWindowBy');
  const label = hidden ? '显示气泡' : '隐藏气泡';
  return <GlassSurface className={`pet-toolbar ${styles.toolbar}`} style={rectStyle(layout?.toolbar)}>
    <Tooltip label={label} rect={layout?.pet}>
      <IconButton className="bubble-toggle" aria-label={label} onClick={onToggle}>
        {hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </IconButton>
    </Tooltip>
    <Tooltip label="调整大小（方向键）" rect={layout?.pet}>
      <IconButton className={`resize-handle ${styles.resize}`} aria-label="调整宠物窗口大小" {...resize.handlers}>
        <MoveDiagonal2 aria-hidden="true" />
      </IconButton>
    </Tooltip>
  </GlassSurface>;
}
