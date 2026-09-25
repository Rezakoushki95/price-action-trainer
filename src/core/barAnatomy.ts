/**
 * Reading a single bar, the Brooks way.
 *
 * Brooks judges a bar by where it closed relative to its own range and how much
 * of that range is body rather than tail. A bull trend bar closing on its high is
 * strong; the same size bar closing mid-range is a doji and means the opposite.
 * These primitives are the vocabulary the feedback copy and the setup detectors
 * are written in.
 */

import type { Bar } from './types';

export interface BarAnatomy {
  range: number;
  body: number;
  /** Body as a fraction of range, 0..1. */
  bodyRatio: number;
  upperTail: number;
  lowerTail: number;
  /** Where the close sits in the bar's range: 0 = on the low, 1 = on the high. */
  closePosition: number;
  isBull: boolean;
  isBear: boolean;
  /** Body is at least half the range -- Brooks' "trend bar". */
  isTrendBar: boolean;
  /** Body is a quarter of the range or less -- indecision. */
  isDoji: boolean;
}

export function anatomy(bar: Bar): BarAnatomy {
  const range = bar.h - bar.l;
  const body = Math.abs(bar.c - bar.o);
  // A bar with zero range is degenerate but real (a locked, untraded 5 minutes).
  // Treat it as a doji sitting mid-range rather than dividing by zero.
  const bodyRatio = range > 0 ? body / range : 0;
  const closePosition = range > 0 ? (bar.c - bar.l) / range : 0.5;

  return {
    range,
    body,
    bodyRatio,
    upperTail: bar.h - Math.max(bar.o, bar.c),
    lowerTail: Math.min(bar.o, bar.c) - bar.l,
    closePosition,
    isBull: bar.c > bar.o,
    isBear: bar.c < bar.o,
    isTrendBar: bodyRatio >= 0.5,
    isDoji: bodyRatio <= 0.25,
  };
}

/**
 * How much of `bar` overlaps the previous bar's range, as a fraction of the
 * previous bar's range. High overlap across several bars is Brooks' signature of
 * a trading range; near-zero overlap is a breakout.
 */
export function overlap(bar: Bar, prev: Bar): number {
  const prevRange = prev.h - prev.l;
  if (prevRange <= 0) return 1;
  const lo = Math.max(bar.l, prev.l);
  const hi = Math.min(bar.h, prev.h);
  return Math.max(0, hi - lo) / prevRange;
}

/** Average bar range over the trailing `lookback` bars ending at `index`. */
export function averageRange(bars: Bar[], index: number, lookback = 20): number {
  const start = Math.max(0, index - lookback + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= index && i < bars.length; i++) {
    sum += bars[i].h - bars[i].l;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

/**
 * A one-line plain-English read of the bar, used in feedback. Deliberately the
 * same words Brooks uses, so the vocabulary transfers when the player reads him.
 */
export function describe(bar: Bar): string {
  const a = anatomy(bar);
  if (a.range === 0) return 'no range';
  if (a.isDoji) return 'doji';

  const dir = a.isBull ? 'bull' : 'bear';
  if (a.isTrendBar) {
    const closedAtExtreme = a.isBull ? a.closePosition > 0.9 : a.closePosition < 0.1;
    return closedAtExtreme ? `strong ${dir} trend bar` : `${dir} trend bar`;
  }
  return `weak ${dir} bar`;
}
