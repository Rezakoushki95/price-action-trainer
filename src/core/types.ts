/**
 * Shared shapes for the pure game core.
 *
 * Nothing in src/core imports React, React Native or Skia. It is plain data in,
 * plain data out, so it can be unit-tested on its own and survives a change of
 * rendering platform.
 */

/**
 * One 5-minute bar.
 *
 * NORMALISED. `t` is seconds from the opening bell (negative overnight) and the
 * prices are points from the session open, so the opening bar is always
 * `{ t: 0, o: 0 }`. Nothing here can identify which real day is being played --
 * see scripts/fetch-sessions.mjs for why that matters.
 */
export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** One day on the context rail, in points from the session open. */
export interface DailyBar {
  o: number;
  h: number;
  l: number;
  c: number;
}

/**
 * The price levels Al Brooks refers to as magnets. Every one is a hard number
 * taken from bars the player could scroll back and see -- no interpretation, so
 * scoring against them cannot be argued with.
 */
export interface Magnets {
  yHigh: number; // yesterday's regular-session high
  yLow: number; // yesterday's regular-session low
  yClose: number; // yesterday's regular-session close
  yMid: number; // midpoint of yesterday's range
  onHigh: number; // overnight (Globex) high
  onLow: number; // overnight (Globex) low
  open: number; // today's regular-session open
}

export type MagnetKey = keyof Magnets;

/** One playable trading day. Self-contained: it knows nothing of its neighbours. */
export interface Session {
  /** Overnight Globex bars preceding the open. Warm up the EMA; never traded. */
  seed: Bar[];
  /** The regular session, 09:30-16:00 ET. 78 bars. This is what gets played. */
  rth: Bar[];
  /** Trailing daily bars for the context rail; the LAST one is yesterday. */
  rail: DailyBar[];
  magnets: Magnets;
}

/**
 * The whole baked dataset, as written by scripts/fetch-sessions.mjs.
 *
 * Deliberately absent: dates, the instrument symbol, and any absolute price. They
 * live in data-meta/, which is outside src/ so no bundler can reach it.
 */
export interface SessionDb {
  interval: string;
  tickSize: number;
  rthBars: number;
  dailyRail: number;
  /** Always true. Prices are points from the open, times seconds from the bell. */
  normalised: boolean;
  sessions: Session[];
}

export type Direction = 'long' | 'short';

/** Why a position ended. */
export type ExitReason = 'stop' | 'bell' | 'manual';

export interface OpenPosition {
  dir: Direction;
  /** Index into the session view's bar array of the signal bar. */
  entryIndex: number;
  entry: number;
  stop: number;
  /** Points of risk per contract. Always > 0. One R. */
  risk: number;
}

export interface ClosedTrade extends OpenPosition {
  exitIndex: number;
  exit: number;
  reason: ExitReason;
  /** Profit in multiples of the risk taken at entry. */
  r: number;
  /** Best unrealised R seen while the position was open. */
  maxFavourableR: number;
  /** Worst unrealised R seen while the position was open. */
  maxAdverseR: number;
}
