import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
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
  const [petHovered, setPetHovered] = useState(false);
  const [modelNotice, setModelNotice] = useState('');
  useEffect(() => { if (!visible) setPetHovered(false); }, [visible]);
  const { message, openSession } = useSessionNotice(store.bridge);
  const above = layout && layout.bubbles.y < layout.pet.y;
  const noticeStyle: CSSProperties = layout ? {
    left: layout.bubbles.x + 4, width: layout.bubbles.width - 8,
    top: above ? 'auto' : layout.bubbles.y + 4,
    bottom: above ? layout.bounds.height - layout.bubbles.y - layout.bubbles.height + 4 : 'auto',
  } : {};
  const notice = message ?? (error || modelNotice);
  return <>
    <PetCanvas visible={visible} store={store} rect={layout?.pet} onNotice={setModelNotice} onHover={setPetHovered} />
    <BubbleStack bridge={store.bridge} state={{ ...sessions, bubbles: sessions.bubbles.filter(bubble => bubble.status === 'working' || (bubble.status === 'completed-unread' ? preferences.completed : preferences.error)) }} layout={layout} hidden={hidden || !preferences.bubbles} reducedMotion={preferences.reduced} onOpen={openSession} />
    <Toolbar pageVisible={visible} bridge={store.bridge} layout={layout} engaged={petHovered || !!modelNotice} hidden={hidden} onToggle={() => setHidden(value => !value)} />

    <p className={`pet-notice ${noticeStyles.notice}`} role="status" style={noticeStyle}>{notice && <GlassSurface as="span" material="panel" data-contrast="high">{notice}</GlassSurface>}</p>
  </>;
}
