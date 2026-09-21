import { useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { PetStore } from './bridge/pet-store.js';
import { PetCanvas } from '../features/pet/PetCanvas.js';
import { BubbleStack } from '../features/session-bubbles/BubbleStack.js';
import { Toolbar } from '../features/pet-controls/Toolbar.js';
import { useSessionNotice } from '../features/notifications/use-session-notice.js';

import { glassSurfaceClass } from '../shared/ui/GlassSurface.js';
import noticeStyles from '../features/notifications/Notice.module.css';

export function App({ store }: { store: PetStore }) {
  const { sessions, layout, error } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [hidden, setHidden] = useState(false);
  const [modelNotice, setModelNotice] = useState('');
  const { message, openSession } = useSessionNotice(store.bridge);
  const above = layout && layout.bubbles.y < layout.pet.y;
  const noticeStyle: CSSProperties = layout ? {
    left: layout.bubbles.x + 4, width: layout.bubbles.width - 8,
    top: above ? 'auto' : layout.bubbles.y + 4,
    bottom: above ? layout.bounds.height - layout.bubbles.y - layout.bubbles.height + 4 : 'auto',
  } : {};
  return <>
    <PetCanvas store={store} rect={layout?.pet} onNotice={setModelNotice} />
    <BubbleStack bridge={store.bridge} state={sessions} layout={layout} hidden={hidden} onOpen={openSession} />
    <Toolbar bridge={store.bridge} layout={layout} hidden={hidden} onToggle={() => setHidden(value => !value)} />
    <p className={`pet-notice ${noticeStyles.notice} ${glassSurfaceClass}`} role="status" style={noticeStyle}>{message ?? (error || modelNotice)}</p>
  </>;
}
