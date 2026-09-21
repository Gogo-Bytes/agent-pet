import { useCallback, useEffect, useRef, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import type { PetBridge } from '../app/bridge/pet-store.js';

// use-gesture owns recognition/capture/keys. This adapter owns only the native
// interaction lease and incremental screen CSS-pixel (Electron DIP) commands.
export function useWindowGesture(bridge: PetBridge, kind: 'moveWindowBy' | 'resizeWindowBy') {
  const lease = useRef<{
    cancel: () => void; point: [number, number] | null;
    target: Element | null; pointerId: number | null;
  } | null>(null);
  const [active, setActive] = useState(false);
  const release = useCallback((cancel = false) => {
    const current = lease.current;
    if (!current) return;
    lease.current = null;
    if (cancel) current.cancel();
    if (current.pointerId !== null && current.target?.hasPointerCapture(current.pointerId)) {
      current.target.releasePointerCapture(current.pointerId);
    }
    setActive(false);
    void bridge.interaction(false);
  }, [bridge]);
  useEffect(() => {
    const blur = () => release(true);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('blur', blur); release(true); };
  }, [release]);
  const bind = useDrag(({ first, last, canceled, event, delta, cancel }) => {
    if (canceled) { release(); return; }
    const pointer = 'screenX' in event;
    if (first) {
      lease.current = {
        cancel, point: pointer ? [event.screenX, event.screenY] : null,
        target: event.target instanceof Element ? event.target : null,
        pointerId: 'pointerId' in event ? event.pointerId : null,
      };
      setActive(true);
      void bridge.interaction(true);
    }
    const current = lease.current;
    if (!current) return;
    if (last) { release(); return; }
    let [x, y] = delta;
    if (pointer) {
      const previous = current.point;
      x = previous ? event.screenX - previous[0] : 0;
      y = previous ? event.screenY - previous[1] : 0;
      current.point = [event.screenX, event.screenY];
    } else if (event.cancelable) event.preventDefault();
    // Never send use-gesture's cumulative offset: Main may have clamped it.
    if (x || y) void bridge[kind]({ x, y });
  }, { pointer: { keys: kind === 'resizeWindowBy' }, keyboardDisplacement: 10, threshold: 0 });
  return { active, handlers: { ...bind(), onBlur: () => release(true) } };
}
