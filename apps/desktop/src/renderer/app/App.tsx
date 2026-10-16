import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { petControlsRect, type Rect } from '../../shared/overlay-layout.js';
import { rectStyle } from '../shared/rect-style.js';
import type { PetStore } from './bridge/pet-store.js';
import { PetCanvas } from '../features/pet/PetCanvas.js';
import { BubbleStack } from '../features/session-bubbles/BubbleStack.js';
import { Toolbar } from '../features/pet-controls/Toolbar.js';
import { useSessionNotice } from '../features/notifications/use-session-notice.js';

import { GlassSurface } from '../shared/ui/Glass.js';
import noticeStyles from '../features/notifications/Notice.module.css';

function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}
const isVisible = () => !document.hidden;

export function App({ store }: { store: PetStore }) {
  const { sessions, layout, error, preferences } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const visible = useSyncExternalStore(subscribeVisibility, isVisible);
  const [hidden, setHidden] = useState(false);
  const [controlsHovered, setControlsHovered] = useState(false);
  const [modelNotice, setModelNotice] = useState('');
  useEffect(() => { if (!visible) setControlsHovered(false); }, [visible]);
  useEffect(() => {
    const clear = () => setControlsHovered(false);
    window.addEventListener('blur', clear);
    return () => window.removeEventListener('blur', clear);
  }, []);
  const groupRect = layout ? petControlsRect(layout) : undefined;
  const insideGroup = (rect: Rect | undefined) => rect && groupRect
    ? { ...rect, x: rect.x - groupRect.x, y: rect.y - groupRect.y } : rect;
  const { message, openSession } = useSessionNotice(store.bridge);
  const above = layout && layout.bubbles.y < layout.pet.y;
  const noticeStyle: CSSProperties = layout ? {
    left: layout.bubbles.x + 4, width: layout.bubbles.width - 8,
    top: above ? 'auto' : layout.bubbles.y + 4,
    bottom: above ? layout.bounds.height - layout.bubbles.y - layout.bubbles.height + 4 : 'auto',
  } : {};
  const notice = message ?? (error || modelNotice);
  return <>
    <BubbleStack bridge={store.bridge} state={{ ...sessions, bubbles: sessions.bubbles.filter(bubble => bubble.status === 'working' || (bubble.status === 'completed-unread' ? preferences.completed : preferences.error)) }} layout={layout} hidden={hidden || !preferences.bubbles} reducedMotion={preferences.reduced} onOpen={openSession} />
    <div data-pet-controls-region style={{ position: 'absolute', ...rectStyle(groupRect) }}
      onPointerEnter={() => setControlsHovered(true)} onPointerLeave={() => setControlsHovered(false)}>
      <PetCanvas visible={visible} store={store} rect={insideGroup(layout?.pet)} onNotice={setModelNotice} />
      <Toolbar pageVisible={visible} bridge={store.bridge} layout={layout} rect={insideGroup(layout?.toolbar)} engaged={controlsHovered || !!modelNotice} hidden={hidden} onToggle={() => setHidden(value => !value)} />
    </div>

    <p className={`pet-notice ${noticeStyles.notice}`} role="status" style={noticeStyle}>{notice && <GlassSurface as="span" material="panel" data-contrast="high">{notice}</GlassSurface>}</p>
  </>;
}
