import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Eye, EyeOff, MoveDiagonal2 } from 'lucide-react';
import type { OverlayLayout, Rect } from '../../../shared/overlay-layout.js';
import type { PetBridge } from '../../app/bridge/pet-store.js';
import { rectStyle } from '../../shared/rect-style.js';
import { useWindowGesture } from '../../shared/use-window-gesture.js';
import { GlassToolbar, GlassAction } from '../../shared/ui/Glass.js';
import { Tooltip } from '../../shared/ui/Tooltip.js';
import styles from './Toolbar.module.css';

export function Toolbar({ bridge, layout, engaged, hidden, onToggle, pageVisible = true, rect }: {
  rect?: Rect | undefined; pageVisible?: boolean; bridge: PetBridge; layout: OverlayLayout | null; engaged: boolean; hidden: boolean; onToggle: () => void;
}) {
  const resize = useWindowGesture(bridge, 'resizeWindowBy');
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [linger, setLinger] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const element = useRef<HTMLDivElement>(null);
  const [suspended, setSuspended] = useState(false);
  useEffect(() => {
    const release = () => { setSuspended(true); setHovered(false); setFocused(false); setLinger(false); };
    window.addEventListener('blur', release);
    return () => { window.removeEventListener('blur', release); };
  }, []);
  useEffect(() => { setSuspended(false); }, [engaged]);
  useLayoutEffect(() => {
    if (!pageVisible) { setSuspended(true); setHovered(false); setFocused(false); setLinger(false); }
  }, [pageVisible]);
  const active = pageVisible && !suspended && (engaged || hovered || focused || resize.active);
  const requested = pageVisible && (active || linger);
  // Gracefully dismiss after leaving the compact pet/control group.
  // Movement inside its shared hover envelope has no deadline.
  useEffect(() => {
    if (active) { setLinger(true); return; }
    if (!linger) return;
    const timer = setTimeout(() => setLinger(false), 180);
    return () => clearTimeout(timer);
  }, [active, linger]);
  useLayoutEffect(() => {
    let current = true;
    if (!requested) setAcknowledged(false);
    void bridge.controlsVisible(requested).then(() => {
      if (current) setAcknowledged(requested);
    }).catch(() => {
      if (current) { setAcknowledged(false); void bridge.controlsVisible(false).catch(() => {}); }
    });
    return () => { current = false; };
  }, [bridge, requested]);
  useLayoutEffect(() => () => { void bridge.controlsVisible(false).catch(() => {}); }, [bridge]);
  const visible = requested && acknowledged;
  const label = hidden ? '显示气泡' : '隐藏气泡';
  return <GlassToolbar data-contrast="high" ref={element} role="toolbar" aria-label="桌宠快捷操作" data-visible={visible}
    className={`pet-toolbar ${styles.toolbar}`} style={rectStyle(rect ?? layout?.toolbar)}
    onPointerEnter={() => { setSuspended(false); setHovered(true); }} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => { setSuspended(false); setFocused(true); }} onBlurCapture={() => queueMicrotask(() => {
      if (element.current && !element.current.contains(document.activeElement)) setFocused(false);
    })}>
    <Tooltip label={label} rect={layout?.pet} disabled={!visible}>
      <GlassAction iconOnly className="bubble-toggle" aria-label={label} aria-pressed={hidden} onClick={onToggle}>
        {hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </GlassAction>
    </Tooltip>
    <span className={styles.divider} aria-hidden="true" />
    <Tooltip label="调整大小（方向键）" rect={layout?.pet} disabled={!visible}>
      <GlassAction iconOnly className={`resize-handle ${styles.resize}`} aria-label="调整宠物窗口大小" {...resize.handlers}>
        <MoveDiagonal2 aria-hidden="true" />
      </GlassAction>
    </Tooltip>
  </GlassToolbar>;
}
