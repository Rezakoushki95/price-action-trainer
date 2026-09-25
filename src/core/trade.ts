/**
 * Position lifecycle.
 *
 * The rules, exactly as specified:
 *   - You act at a bar's CLOSE and are filled at that close.
 *   - The stop goes one tick beyond the signal bar's extreme.
 *   - There is no profit target. A position ends on the stop, on the closing
 *     bell, or because you chose to get out.
 *
 * No target is the interesting part: it means the magnets are the only thing
 * telling you where to take profit, so reading the daily context is the game
 * rather than decoration.
 */

import type { Bar, ClosedTrade, Direction, ExitReason, OpenPosition } from './types';

/** A position being carried forward, with its running excursions. */
export interface LivePosition extends OpenPosition {
  maxFavourableR: number;
  maxAdverseR: number;
}

/**
 * Enter at the close of `bars[entryIndex]`, stopping one tick beyond that bar.
 *
 * Risk is at least one tick by construction: for a long the stop sits below the
 * signal bar's low, and the close can never be below it.
 */
export function openPosition(
  bars: Bar[],
  entryIndex: number,
  dir: Direction,
  tick: number
): LivePosition {
  const signal = bars[entryIndex];
  if (!signal) throw new Error(`no bar at index ${entryIndex}`);

  const entry = signal.c;
  const stop = dir === 'long' ? signal.l - tick : signal.h + tick;
  const risk = Math.abs(entry - stop);

  return { dir, entryIndex, entry, stop, risk, maxFavourableR: 0, maxAdverseR: 0 };
}

/** Unrealised result at an arbitrary price, in R. */
export function unrealisedR(pos: OpenPosition, price: number): number {
  const move = pos.dir === 'long' ? price - pos.entry : pos.entry - price;
  return move / pos.risk;
}

/**
 * Where a bar would take the position out, or null if it survives.
 *
 * If the bar opens already through the stop, the fill is the open, not the stop
 * price -- gapping through a stop is a real cost and pretending otherwise would
 * flatter every score in the app.
 */
export function stopFillPrice(pos: OpenPosition, bar: Bar): number | null {
  if (pos.dir === 'long') {
    if (bar.o <= pos.stop) return bar.o;
    return bar.l <= pos.stop ? pos.stop : null;
  }
  if (bar.o >= pos.stop) return bar.o;
  return bar.h >= pos.stop ? pos.stop : null;
}

export type StepResult =
  | { status: 'open'; position: LivePosition }
  | { status: 'closed'; trade: ClosedTrade };

/**
 * Carry the position through one bar.
 *
 * Order matters: the stop is checked before the bell, because a position stopped
 * out during the final bar did not survive to the close.
 */
export function stepPosition(
  pos: LivePosition,
  bar: Bar,
  barIndex: number,
  isFinalBar: boolean
): StepResult {
  const best = pos.dir === 'long' ? bar.h : bar.l;
  const worst = pos.dir === 'long' ? bar.l : bar.h;

  const position: LivePosition = {
    ...pos,
    maxFavourableR: Math.max(pos.maxFavourableR, unrealisedR(pos, best)),
    maxAdverseR: Math.min(pos.maxAdverseR, unrealisedR(pos, worst)),
  };

  const stopped = stopFillPrice(pos, bar);
  if (stopped !== null) {
    return { status: 'closed', trade: settle(position, barIndex, stopped, 'stop') };
  }
  if (isFinalBar) {
    return { status: 'closed', trade: settle(position, barIndex, bar.c, 'bell') };
  }
  return { status: 'open', position };
}

/** Get out at the close of the current bar because the player said so. */
export function closeManually(pos: LivePosition, barIndex: number, bar: Bar): ClosedTrade {
  return settle(pos, barIndex, bar.c, 'manual');
}

function settle(
  pos: LivePosition,
  exitIndex: number,
  exit: number,
  reason: ExitReason
): ClosedTrade {
  const r = unrealisedR(pos, exit);
  return {
    ...pos,
    exitIndex,
    exit,
    reason,
    r,
    // The realised result is itself an excursion; a stop-out is the low-water mark.
    maxFavourableR: Math.max(pos.maxFavourableR, r),
    maxAdverseR: Math.min(pos.maxAdverseR, r),
  };
}

/**
 * Run a position forward with no intervention, for tests and for the summary
 * screen's "what would holding have done?" line.
 */
export function resolve(pos: LivePosition, bars: Bar[], lastIndex: number): ClosedTrade {
  let live = pos;
  for (let i = pos.entryIndex + 1; i <= lastIndex; i++) {
    const res = stepPosition(live, bars[i], i, i === lastIndex);
    if (res.status === 'closed') return res.trade;
    live = res.position;
  }
  // Only reachable if the position was opened on the final bar; it never had a
  // bar to trade against, so it settles flat at its own entry.
  return settle(live, pos.entryIndex, pos.entry, 'bell');
}

/**
 * How close a stop-out came to being a winner. Brooks talks about this constantly
 * and it is the most emotionally sticky moment in the app, so it gets rendered
 * rather than buried.
 */
export function wasNearMiss(trade: ClosedTrade, threshold = 0.25): boolean {
  return trade.reason === 'stop' && trade.maxFavourableR >= threshold;
}
