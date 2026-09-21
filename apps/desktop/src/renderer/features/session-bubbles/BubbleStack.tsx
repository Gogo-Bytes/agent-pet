import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { SessionState } from '@agent-pet/domain';
import type { SessionRef } from '@agent-pet/adapter-core';
import type { OverlayLayout } from '../../../shared/overlay-layout.js';
import type { PetBridge } from '../../app/bridge/pet-store.js';
import { visibleBubbles } from '../../bubble-model.js';
import { rectStyle } from '../../shared/rect-style.js';

const labels = { working: '正在工作', 'completed-unread': '已完成', 'error-unread': '发生错误' };
export function BubbleStack({ bridge, state, layout, hidden, onOpen }: {
  bridge: PetBridge; state: SessionState; layout: OverlayLayout | null;
  hidden: boolean; onOpen: (session: SessionRef) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hovered = useRef(false);
  const deck = useRef<HTMLDivElement>(null);
  const bubbles = [...visibleBubbles(state)].reverse();
  const isExpanded = expanded && bubbles.length > 0;
  useEffect(() => {
    void bridge.bubblesExpanded(isExpanded);
    return () => { void bridge.bubblesExpanded(false); };
  }, [bridge, isExpanded]);
  useEffect(() => { if (!bubbles.length) setExpanded(false); }, [bubbles.length]);
  const above = !layout || layout.bubbles.y < layout.pet.y;
  return <div className="bubble-layer" hidden={hidden} data-side={above ? 'above' : 'below'}
    style={{ ...rectStyle(layout?.bubbles), justifyContent: above ? 'safe flex-end' : 'flex-start' }}>
    <div ref={deck} className={`bubble-deck${isExpanded ? ' is-expanded' : ''}`} role="group"
      aria-label={`${bubbles.length} 个会话通知，悬停或聚焦展开`}
      style={{ '--stack-height': `${Math.min(3, bubbles.length) * 7 + 66}px` } as CSSProperties}
      onPointerEnter={() => { hovered.current = true; setExpanded(true); }}
      onPointerLeave={() => {
        hovered.current = false;
        if (!deck.current?.contains(document.activeElement)) setExpanded(false);
      }}
      onFocus={() => setExpanded(true)}
      onBlur={() => queueMicrotask(() => {
        if (deck.current && !hovered.current && !deck.current.contains(document.activeElement)) setExpanded(false);
      })}>
      {bubbles.map((bubble, index) => <button key={bubble.sessionId}
        className={`session-bubble session-bubble--${bubble.status}`} type="button"
        style={{ '--depth': Math.min(index, 2), '--order': bubbles.length - index } as CSSProperties}
        data-stacked-hidden={index > 2}
        onClick={() => {
          const session = state.sessions[bubble.sessionId];
          if (session) void onOpen({ provider: session.provider, sessionId: session.sessionId });
        }}>
        <strong>{bubble.name}</strong><span>{labels[bubble.status]}</span>
      </button>)}
    </div>
  </div>;
}
