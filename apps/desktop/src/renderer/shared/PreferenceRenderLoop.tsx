import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/** One per Canvas, which must use frameloop="never". Limits actual drawing and mixer advancement. */
export function PreferenceRenderLoop({ active, fps }: { active: boolean; fps: number }) {
  const advance = useThree(state => state.advance);
  const clock = useThree(state => state.clock);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let previous: number | undefined;
    const draw = (now: number) => {
      if (previous === undefined || now - previous >= 1000 / fps - 0.5) {
        const delta = previous === undefined ? 0 : Math.min((now - previous) / 1000, 0.1);
        previous = now;
        advance(clock.elapsedTime + delta, true);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active, fps, advance, clock]);
  return null;
}
