import { describe, expect, it } from 'vitest';
import { EMA_PERIOD, ema } from '../ema';

describe('ema', () => {
  it('is null until the seed period has filled', () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).not.toBeNull();
  });

  it('seeds with the simple average of the first period values', () => {
    // SMA of [2,4,6] = 4
    expect(ema([2, 4, 6, 8], 3)[2]).toBeCloseTo(4, 10);
  });

  it('applies the standard 2/(n+1) multiplier after the seed', () => {
    // seed = 4, k = 2/4 = 0.5, next = 8*0.5 + 4*0.5 = 6
    expect(ema([2, 4, 6, 8], 3)[3]).toBeCloseTo(6, 10);
  });

  it('is flat on constant input', () => {
    const out = ema(new Array(50).fill(7), EMA_PERIOD);
    expect(out[49]).toBeCloseTo(7, 10);
  });

  it('tracks a step change without overshooting it', () => {
    const vals = [...new Array(30).fill(100), ...new Array(30).fill(200)];
    const out = ema(vals, EMA_PERIOD) as number[];
    // Lags on the way up, never exceeds the new level.
    expect(out[35]).toBeGreaterThan(100);
    expect(out[35]).toBeLessThan(200);
    expect(out[59]).toBeLessThanOrEqual(200);
    expect(out[59]).toBeGreaterThan(out[35]);
  });

  it('returns all nulls when there are fewer values than the period', () => {
    expect(ema([1, 2, 3], 20).every((x) => x === null)).toBe(true);
  });

  it('lags price in a trend, which is what makes it a pullback magnet', () => {
    const rising = Array.from({ length: 60 }, (_, i) => 100 + i);
    const out = ema(rising, EMA_PERIOD) as number[];
    expect(out[59]).toBeLessThan(rising[59]);
  });
});
