/**
 * Mapping bars and prices onto the canvas.
 *
 * The one thing that matters here beyond arithmetic is that the price axis must
 * be STABLE. An axis that rescales on every revealed bar makes the chart twitch,
 * and a twitching chart destroys the feel the whole app is built on. So the
 * extent is quantised to round steps and only moves when it genuinely has to.
 */

import { CHART } from './theme';

export interface ChartGeometry {
  start: number;
  end: number;
  min: number;
  max: number;
  barW: number;
  slot: number;
  plotW: number;
  height: number;
  x: (index: number) => number;
  y: (price: number) => number;
}

/** A round-ish step near `raw`, so axis bounds land on sensible numbers. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

export function buildGeometry(opts: {
  bars: { h: number; l: number }[];
  index: number;
  width: number;
  height: number;
  /** Extra prices that must stay on screen -- magnets, an entry, a stop. */
  include?: number[];
  visibleBars?: number;
}): ChartGeometry {
  const visible = opts.visibleBars ?? CHART.visibleBars;
  const end = opts.index;
  const start = Math.max(0, end - visible + 1);

  const plotW = Math.max(1, opts.width - CHART.rightPad);
  const slot = plotW / visible;
  const barW = Math.max(1.5, slot * 0.62);

  let min = Infinity;
  let max = -Infinity;
  for (let i = start; i <= end && i < opts.bars.length; i++) {
    const b = opts.bars[i];
    if (b.l < min) min = b.l;
    if (b.h > max) max = b.h;
  }
  if (!Number.isFinite(min)) {
    min = 0;
    max = 1;
  }

  // Bring in the extra levels, but never let distant magnets flatten the bars
  // into a hairline. On a gap day the whole of yesterday can sit above price, and
  // reading the bars matters more than reaching a label -- anything beyond
  // `reach` is left off screen, and ChartCanvas pins it to the edge with the
  // distance to it instead.
  //
  // Both comparisons are made against the FROZEN bar extent. Testing against a
  // running min/max lets each magnet walk the axis a little further out, and the
  // next one then clears the bar it just raised -- a ratchet that dragged the
  // bars down to a fifth of the chart on some sessions.
  const barLo = min;
  const barHi = max;
  const reach = Math.max(barHi - barLo, 1e-6) * 0.5;
  for (const p of opts.include ?? []) {
    if (p > barHi && p - barHi < reach) max = Math.max(max, p);
    if (p < barLo && barLo - p < reach) min = Math.min(min, p);
  }

  const range = Math.max(max - min, 1e-6);
  const pad = range * 0.08;
  const step = niceStep(range / 6);
  min = Math.floor((min - pad) / step) * step;
  max = Math.ceil((max + pad) / step) * step;

  const span = Math.max(max - min, 1e-6);
  const top = CHART.topPad;
  const usable = Math.max(1, opts.height - CHART.topPad - CHART.bottomPad);

  return {
    start,
    end,
    min,
    max,
    barW,
    slot,
    plotW,
    height: opts.height,
    x: (i: number) => (i - start) * slot + slot / 2,
    y: (price: number) => top + (1 - (price - min) / span) * usable,
  };
}

/** Ease-out cubic. Fast at the start, settles at the end -- reads as a bar landing. */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}
