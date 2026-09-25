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
 *
 * State is keyed by the bar it belongs to rather than reset synchronously in the
 * effect: a key the state has not caught up with simply renders as 0, so no
 * setState runs during the effect body and no cascading render is triggered.
 */
export function useReveal(key: number, skip: boolean, duration = CHART.revealMs): number {
  const [state, setState] = useState<{ key: number; t: number }>({ key, t: 1 });

  useEffect(() => {
    if (skip) return;
    let raf = 0;
    const start = Date.now();

    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      setState({ key, t: p });
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, skip, duration]);

  if (skip) return 1;
  return state.key === key ? state.t : 0;
}
