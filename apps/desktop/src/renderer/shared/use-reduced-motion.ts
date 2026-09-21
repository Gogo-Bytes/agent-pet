import { useSyncExternalStore } from 'react';
const query = '(prefers-reduced-motion: reduce)';
function subscribe(listener: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener('change', listener);
  return () => media?.removeEventListener('change', listener);
}
// Motion 13's useReducedMotion samples only at mount. Subscribe to the OS
// preference so opacity transitions also stop when it changes while open.
export function useReducedMotionPreference() {
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? false);
}
