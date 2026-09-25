/**
 * The 20-bar exponential moving average -- the only indicator in this app.
 * Price-action traders keep it on every chart and every timeframe, so it is never optional
 * and never configurable.
 */

export const EMA_PERIOD = 20;

/**
 * Standard EMA, seeded with the simple average of the first `period` values,
 * which is what charting platforms do. Indices before the seed completes are
 * null rather than 0 -- a wrong line is worse than no line, and the caller has
 * to decide what to draw.
 */
export function ema(values: number[], period: number = EMA_PERIOD): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  const k = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Convenience: EMA over bar closes. */
export function emaOfCloses(bars: { c: number }[], period: number = EMA_PERIOD): (number | null)[] {
  return ema(
    bars.map((b) => b.c),
    period
  );
}
