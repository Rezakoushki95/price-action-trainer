import { useEffect, useState } from 'react';
import { CHART } from './theme';

/**
 * Drives the bar-reveal animation, 0 to 1, restarting whenever `key` changes.
 *
 * A bar that appears instantly is information; a bar that draws itself in over a
 * couple of hundred milliseconds is a slot reel. That distinction is most of
 * what makes this app feel the way it is supposed to feel, so the animation is
 * not decoration and is not optional.
 *
 * Skipped entirely while fast-forwarding -- at 45ms a bar there is nothing to
 * animate, and trying would only cost frames.
 */
export function useReveal(key: number, skip: boolean, duration = CHART.revealMs): number {
  const [t, setT] = useState(1);

  useEffect(() => {
    if (skip) {
      setT(1);
      return;
    }
    let raf = 0;
    const start = Date.now();
    setT(0);

    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setT(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, skip, duration]);

  return t;
}
