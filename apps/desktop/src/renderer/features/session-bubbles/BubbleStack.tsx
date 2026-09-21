import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { SessionState } from '@agent-pet/domain';
import type { SessionRef } from '@agent-pet/adapter-core';
import type { OverlayLayout } from '../../../shared/overlay-layout.js';
import type { PetBridge } from '../../app/bridge/pet-store.js';
import { rectStyle } from '../../shared/rect-style.js';

import { motion, type MotionStyle } from 'motion/react';
import { glassSurfaceClass } from '../../shared/ui/GlassSurface.js';
import { useReducedMotionPreference } from '../../shared/use-reduced-motion.js';
import styles from './BubbleStack.module.css';

const labels = { working: '正在工作', 'completed-unread': '已完成', 'error-unread': '发生错误' };
export function BubbleStack({ bridge, state, layout, hidden, onOpen }: {
  bridge: PetBridge; state: SessionState; layout: OverlayLayout | null;
  hidden: boolean; onOpen: (session: SessionRef) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hovered = useRef(false);
  const deck = useRef<HTMLDivElement>(null);
  const bubbles = [...state.bubbles].reverse();
  const present = !hidden && bubbles.length > 0;
  const wantExpanded = present && expanded;
  const [ack, setAck] = useState({ present: false, expanded: false });
  const reduced = useReducedMotionPreference();
  const shown = present && ack.present;
  const isExpanded = shown && wantExpanded && ack.expanded;
  // Grow/reveal only after Main has installed the hit policy. Shrink/removal
  // commits first; no AnimatePresence or visible exit nodes outlive that commit.
  useLayoutEffect(() => {
    let current = true;
    if (!present) setAck({ present: false, expanded: false });
    else if (!wantExpanded) setAck(value => ({ ...value, expanded: false }));
    void Promise.all([bridge.bubblesExpanded(wantExpanded), bridge.bubblesVisible(present)]).then(() => {
      if (current) setAck({ present, expanded: wantExpanded });
    }).catch(() => {
      if (!current) return;
      // This Promise callback is outside React's commit. Remove visible DOM
      // synchronously before releasing an already-installed native region.
      flushSync(() => setAck({ present: false, expanded: false }));
      void bridge.bubblesVisible(false).catch(() => {});
      void bridge.bubblesExpanded(false).catch(() => {});
    });
    return () => { current = false; };
  }, [bridge, present, wantExpanded]);
  useLayoutEffect(() => () => {
    void bridge.bubblesVisible(false).catch(() => {});
    void bridge.bubblesExpanded(false).catch(() => {});
  }, [bridge]);
  useEffect(() => { if (!present) { hovered.current = false; setExpanded(false); } }, [present]);
  const above = !layout || layout.bubbles.y < layout.pet.y;
  return <div className={`bubble-layer ${styles.layer}`} hidden={!shown} data-side={above ? 'above' : 'below'}
    style={{ ...rectStyle(layout?.bubbles),
      height: layout ? Math.min(layout.bubbles.height, isExpanded ? layout.bubbles.height : 88) : undefined,
      top: layout && above ? layout.bubbles.y + layout.bubbles.height - Math.min(layout.bubbles.height, isExpanded ? layout.bubbles.height : 88) : layout?.bubbles.y,
      justifyContent: above ? 'safe flex-end' : 'flex-start' }}>
    <motion.div ref={deck} initial={false}
      animate={reduced ? 'still' : !shown ? 'hidden' : isExpanded ? 'expanded' : 'collapsed'}
      variants={{ still: { opacity: 1 }, hidden: { opacity: 1 }, expanded: { opacity: [0.8, 1] }, collapsed: { opacity: [0.8, 1] } }}
      transition={{ duration: reduced ? 0 : 0.14 }} data-motion={reduced ? 'reduced' : 'opacity'}
      className={`bubble-deck ${styles.deck}${isExpanded ? ` is-expanded ${styles.expanded}` : ''}`} role="group"
      aria-label={`${bubbles.length} 个会话通知，悬停或聚焦展开`}
      style={{ '--stack-height': `${Math.min(3, bubbles.length) * 7 + 66}px` } as MotionStyle}
      onPointerEnter={() => { hovered.current = true; setExpanded(true); }}
      onPointerLeave={() => {
        hovered.current = false;
        if (!deck.current?.contains(document.activeElement)) setExpanded(false);
      }}
      onFocus={() => setExpanded(true)}
      onBlur={() => queueMicrotask(() => {
        if (deck.current && !hovered.current && !deck.current.contains(document.activeElement)) setExpanded(false);
      })}>
      {bubbles.map((bubble, index) => <motion.button key={bubble.sessionId}
        initial={reduced ? false : { opacity: 0 }} animate={reduced ? 'still' : 'enter'}
        variants={{ still: { opacity: 1 }, enter: { opacity: [0, 1] } }} transition={{ duration: reduced ? 0 : 0.14 }}
        className={`session-bubble ${styles.bubble} ${glassSurfaceClass}`} data-status={bubble.status} type="button"
        style={{ '--depth': Math.min(index, 2), '--order': bubbles.length - index } as MotionStyle}
        data-stacked-hidden={index > 2}
        onClick={() => {
          const session = state.sessions[bubble.sessionId];
          if (session) void onOpen({ provider: session.provider, sessionId: session.sessionId });
        }}>
        <strong>{bubble.name}</strong><span>{labels[bubble.status]}</span>
      </motion.button>)}
    </motion.div>
  </div>;
}
