/**
 * Turning a baked session into something playable.
 *
 * The overnight seed bars and the regular session are joined into one continuous
 * array, because the 20-bar EMA has to be continuous across the open. At 09:30
 * there is exactly one regular-session bar, so an EMA computed from the regular
 * session alone would be undefined for the first hour and a half -- the most
 * important stretch of the day. The seed bars exist to solve that; they are
 * never tradeable.
 */

import { EMA_PERIOD, emaOfCloses } from './ema';
import type { Bar, DailyBar, Magnets, Session } from './types';

export interface SessionView {
  session: Session;
  /** Overnight seed bars followed by the regular session, in one array. */
  bars: Bar[];
  /** Index in `bars` of the 09:30 bar. Everything before it is context only. */
  rthStart: number;
  /** Index in `bars` of the closing bar. */
  rthEnd: number;
  /** 20-bar EMA aligned to `bars`. Null only where the seed has not filled. */
  ema: (number | null)[];
  magnets: Magnets;
  tickSize: number;
}

export function buildSessionView(
  session: Session,
  tickSize: number,
  emaPeriod: number = EMA_PERIOD
): SessionView {
  const bars = [...session.seed, ...session.rth];
  const rthStart = session.seed.length;

  return {
    session,
    bars,
    rthStart,
    rthEnd: bars.length - 1,
    ema: emaOfCloses(bars, emaPeriod),
    magnets: session.magnets,
    tickSize,
  };
}

/**
 * How many bars of the regular session have been revealed, given the playhead.
 * Used for the "bar 34 of 78" readout.
 */
export function rthProgress(view: SessionView, index: number): { bar: number; total: number } {
  return {
    bar: Math.max(0, Math.min(index - view.rthStart + 1, view.session.rth.length)),
    total: view.session.rth.length,
  };
}

/**
 * Time of day at the playhead, as "HH:MM".
 *
 * Derived by counting bars from the open rather than formatting the timestamp:
 * the regular session always starts at 09:30 ET, so this is exact, needs no
 * timezone database, and cannot identify WHICH day is being played. Dates are
 * deliberately absent from the entire UI -- a player who can read the date can
 * look the session up and see what happens next.
 */
export function barClock(view: SessionView, index: number): string {
  const step =
    view.bars.length > view.rthStart + 1
      ? (view.bars[view.rthStart + 1].t - view.bars[view.rthStart].t) / 60
      : 5;
  const mins = 9 * 60 + 30 + Math.max(0, index - view.rthStart) * step;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** True once the playhead has reached the closing bar -- the forced-exit point. */
export function isFinalBar(view: SessionView, index: number): boolean {
  return index >= view.rthEnd;
}

/**
 * The daily bars for the context rail. The last one is yesterday -- the bar
 * yesterday's high and low were read from, which the rail highlights so the
 * learner sees where the magnets come from.
 */
export function railBars(session: Session): { bars: DailyBar[]; yesterdayIndex: number } {
  return { bars: session.rail, yesterdayIndex: session.rail.length - 1 };
}

/** Highest high and lowest low across a set of bars, for scaling an axis. */
export function priceExtent(bars: { h: number; l: number }[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const b of bars) {
    if (b.l < min) min = b.l;
    if (b.h > max) max = b.h;
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 1 };
}
