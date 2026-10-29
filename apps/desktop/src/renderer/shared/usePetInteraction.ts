import { useCallback, useEffect, useRef, useState } from 'react';

export type PetInteraction = { action: 'hover' | 'selected' };

/** Local, latest-wins feedback; selection is an explicit activation counter, not focus. */
export function usePetInteraction(enabled: boolean, selection = 0) {
  const hovered = useRef(false);
  const [feedback, setFeedback] = useState<PetInteraction | null>(null);
  const [previousSelection, setPreviousSelection] = useState(selection);
  // Derive before effects so a simultaneous business update cannot consume its cue.
  if (selection !== previousSelection) {
    setPreviousSelection(selection);
    setFeedback(enabled && selection > 0 ? { action: 'selected' } : null);
  }
  const finish = useCallback(() => setFeedback(null), []);
  const cancel = useCallback(() => { hovered.current = false; setFeedback(null); }, []);
  const hover = (value: boolean) => {
    if (value === hovered.current) return;
    hovered.current = value;
    if (value && enabled) setFeedback({ action: 'hover' });
    else if (!value) setFeedback(current => current?.action === 'hover' ? null : current);
  };
  useEffect(() => { if (!enabled) cancel(); }, [enabled, cancel]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('lostpointercapture', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('lostpointercapture', cancel);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [cancel]);
  return { feedback: enabled ? feedback : null, hover, finish };
}
