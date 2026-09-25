/**
 * Brooks' pullback counting, mechanised.
 *
 * In a bull trend the market pulls back, and the FIRST bar whose high pokes above
 * the previous bar's high ends that pullback: a High 1. If price then rolls over
 * into another leg down and again pokes above a prior bar's high, that is a
 * High 2. Brooks prefers the second entry, because the market tries to do
 * everything twice, and the first attempt usually fails.
 *
 * Lows mirror it exactly.
 *
 * SIMPLIFICATION, STATED PLAINLY: Brooks counts legs by eye, using swing
 * structure a human reads in context. This implementation uses the 20-bar EMA as
 * the trend filter and resets the count when price closes on the other side of
 * it. That is a defensible mechanical proxy, not a faithful reproduction of his
 * judgement, and it is the reason the setup counter drives XP but never dictates
 * whether the player was "right" -- the money score comes from what price
 * actually did.
 */

import { anatomy } from './barAnatomy';
import type { Bar, Direction } from './types';

export type SetupKind = 'H1' | 'H2' | 'H3' | 'L1' | 'L2' | 'L3';

export interface SetupSignal {
  kind: SetupKind | null;
  dir: Direction | null;
  /** 0..1. How much this bar looks like something Brooks would actually take. */
  quality: number;
  /** Plain-English reasons, shown as feedback after the decision. */
  reasons: string[];
}

const NONE: SetupSignal = { kind: null, dir: null, quality: 0, reasons: [] };

/**
 * Pullback counts for every bar in the series.
 *
 * Returns, per index, the pending count in each direction. A value of 2 at index
 * i means "this bar is a High 2".
 */
export function countPullbacks(
  bars: Bar[],
  ema: (number | null)[]
): { high: (number | null)[]; low: (number | null)[] } {
  const high: (number | null)[] = new Array(bars.length).fill(null);
  const low: (number | null)[] = new Array(bars.length).fill(null);

  let highCount = 0;
  let lowCount = 0;
  let inHighLeg = false; // currently making lower highs (a pullback in a bull trend)
  let inLowLeg = false;

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const prev = bars[i - 1];
    const e = ema[i];

    // Trend filter. Losing the EMA invalidates the count on that side entirely --
    // a High 2 in a bear trend is not a High 2, it is a bull trap.
    if (e != null) {
      if (bar.c < e) {
        highCount = 0;
        inHighLeg = false;
      }
      if (bar.c > e) {
        lowCount = 0;
        inLowLeg = false;
      }
    }

    // --- bull side: count pokes above the prior high, out of a lower-high leg ---
    if (bar.h < prev.h) {
      inHighLeg = true;
    } else if (bar.h > prev.h && inHighLeg) {
      highCount = Math.min(highCount + 1, 3);
      inHighLeg = false;
      if (e != null && bar.c > e) high[i] = highCount;
    }

    // --- bear side ---
    if (bar.l > prev.l) {
      inLowLeg = true;
    } else if (bar.l < prev.l && inLowLeg) {
      lowCount = Math.min(lowCount + 1, 3);
      inLowLeg = false;
      if (e != null && bar.c < e) low[i] = lowCount;
    }
  }

  return { high, low };
}

export interface SetupContext {
  bars: Bar[];
  ema: (number | null)[];
  counts: ReturnType<typeof countPullbacks>;
  /** Reward-to-risk available to the next magnet, per direction. */
  rewardToRisk?: { long: number | null; short: number | null };
}

/**
 * How good a signal this bar is, and in which direction.
 *
 * Quality is a blend of three things Brooks weighs: whether there is a countable
 * pullback at all, how strong the signal bar itself is, and whether there is
 * enough room to a magnet to make the trader's equation work.
 */
export function setupAt(ctx: SetupContext, index: number): SetupSignal {
  const bar = ctx.bars[index];
  if (!bar || index < 1) return NONE;

  const h = ctx.counts.high[index];
  const l = ctx.counts.low[index];
  if (h == null && l == null) return NONE;

  // If both fire, take the one whose signal bar agrees with its own direction.
  const a = anatomy(bar);
  const dir: Direction = h != null && (l == null || a.isBull) ? 'long' : 'short';
  const count = dir === 'long' ? h : l;
  if (count == null) return NONE;

  const kind = ((dir === 'long' ? 'H' : 'L') + count) as SetupKind;
  const reasons: string[] = [
    `${kind}: pullback ${count} in a ${dir === 'long' ? 'bull' : 'bear'} trend`,
  ];

  // Brooks strongly prefers the second entry.
  let quality = count === 2 ? 0.55 : count === 1 ? 0.3 : 0.35;
  if (count === 2) reasons.push('second entry -- the market tries to do things twice');

  // Signal bar strength. A doji signal bar is how good context becomes a loss.
  const withTrend = dir === 'long' ? a.isBull : a.isBear;
  if (a.isTrendBar && withTrend) {
    quality += 0.25;
    reasons.push(`signal bar is a ${dir === 'long' ? 'bull' : 'bear'} trend bar`);
  } else if (a.isDoji) {
    quality -= 0.2;
    reasons.push('signal bar is a doji -- weak');
  } else if (!withTrend) {
    quality -= 0.15;
    reasons.push('signal bar closes against the entry direction');
  }

  // Closing at the extreme is what makes a signal bar worth acting on.
  const extreme = dir === 'long' ? a.closePosition : 1 - a.closePosition;
  if (extreme > 0.8) {
    quality += 0.1;
    reasons.push('closes near its extreme');
  }

  // Room to the next magnet -- the reward half of the trader's equation.
  const rr = ctx.rewardToRisk?.[dir] ?? null;
  if (rr != null) {
    if (rr >= 2) {
      quality += 0.15;
      reasons.push(`about ${rr.toFixed(1)}R to the next magnet`);
    } else if (rr < 1) {
      quality -= 0.25;
      reasons.push(`only ${rr.toFixed(1)}R to the next magnet -- not worth the risk`);
    }
  }

  return { kind, dir, quality: Math.max(0, Math.min(1, quality)), reasons };
}

/** A setup worth taking. Below this, passing is the correct play. */
export const TRADEABLE = 0.5;

export function isTradeable(s: SetupSignal): boolean {
  return s.kind !== null && s.quality >= TRADEABLE;
}
