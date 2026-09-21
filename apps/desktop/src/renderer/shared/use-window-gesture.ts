import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { PetBridge } from '../app/bridge/pet-store.js';

// R1 retains screen-coordinate deltas; Main still clamps authoritative geometry.
export function useWindowGesture(bridge: PetBridge, kind: 'moveWindowBy' | 'resizeWindowBy') {
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const [active, setActive] = useState(false);
  useEffect(() => () => {
    if (pointer.current) void bridge.interaction(false);
    pointer.current = null;
  }, [bridge]);
  function stop(event: PointerEvent<HTMLElement>) {
    if (pointer.current?.id !== event.pointerId) return;
    pointer.current = null;
    setActive(false);
    void bridge.interaction(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return {
    active,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.button !== 0 || pointer.current) return;
        if (kind === 'resizeWindowBy') { event.preventDefault(); event.stopPropagation(); }
        pointer.current = { id: event.pointerId, x: event.screenX, y: event.screenY };
        setActive(true);
        void bridge.interaction(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const previous = pointer.current;
        if (!previous || previous.id !== event.pointerId) return;
        pointer.current = { id: event.pointerId, x: event.screenX, y: event.screenY };
        void bridge[kind]({ x: event.screenX - previous.x, y: event.screenY - previous.y });
      },
      onPointerUp: stop,
      onPointerCancel: stop,
    },
  };
}
