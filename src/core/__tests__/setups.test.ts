import { describe, expect, it } from 'vitest';
import { countPullbacks, isTradeable, setupAt, TRADEABLE } from '../setups';
import { emaOfCloses } from '../ema';
import raw from '../../data/sessions.json';
import { buildSessionView } from '../session';
import { visibleMagnets, rewardToRisk } from '../magnets';
import { openPosition } from '../trade';
import type { Bar, SessionDb } from '../types';

const db = raw as unknown as SessionDb;
const bar = (o: number, h: number, l: number, c: number, t = 0): Bar => ({ t, o, h, l, c });

describe('countPullbacks', () => {
  it('counts a first and second pullback in a rising market', () => {
    // Rise, pull back (lower high), poke above -> H1. Pull back again, poke -> H2.
    const bars: Bar[] = [];
    for (let i = 0; i < 30; i++) bars.push(bar(100 + i, 101 + i, 99 + i, 100.5 + i)); // uptrend
    const base = bars.length;
    bars.push(bar(129, 129.5, 127, 127.5)); // lower high  -> leg down
    bars.push(bar(127, 131, 126.5, 130.5)); // pokes above -> H1
    bars.push(bar(130, 130.2, 128, 128.5)); // lower high  -> leg down again
    bars.push(bar(128, 132, 127.5, 131.5)); // pokes above -> H2

    const ema = emaOfCloses(bars);
    const { high } = countPullbacks(bars, ema);
    expect(high[base + 1]).toBe(1);
    expect(high[base + 3]).toBe(2);
  });

  it('mirrors the count for lows in a falling market', () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 30; i++) bars.push(bar(130 - i, 131 - i, 129 - i, 129.5 - i));
    const base = bars.length;
    bars.push(bar(101, 103, 100.5, 102.5)); // higher low (100.5 > 100) -> leg up
    bars.push(bar(102, 102.5, 99, 99.5)); //   pokes below   -> L1
    bars.push(bar(100, 101, 99.5, 100.5)); //  higher low (99.5 > 99) -> leg up again
    bars.push(bar(100, 100.2, 98, 98.2)); //   pokes below   -> L2

    const ema = emaOfCloses(bars);
    const { low } = countPullbacks(bars, ema);
    expect(low[base + 1]).toBe(1);
    expect(low[base + 3]).toBe(2);
  });

  it('does not report a bull count while price is below the EMA', () => {
    // A "High 2" in a bear trend is a bull trap, not a setup.
    const bars: Bar[] = [];
    for (let i = 0; i < 40; i++) bars.push(bar(130 - i, 131 - i, 129 - i, 129.5 - i));
    const ema = emaOfCloses(bars);
    const { high } = countPullbacks(bars, ema);
    expect(high.every((h) => h === null)).toBe(true);
  });

  it('never emits a count without an EMA to judge trend by', () => {
    const bars = Array.from({ length: 10 }, (_, i) => bar(100 + i, 101 + i, 99 + i, 100 + i));
    const { high, low } = countPullbacks(bars, emaOfCloses(bars));
    expect(high.every((x) => x === null)).toBe(true);
    expect(low.every((x) => x === null)).toBe(true);
  });
});

describe('setupAt', () => {
  const build = (bars: Bar[]) => {
    const ema = emaOfCloses(bars);
    return { bars, ema, counts: countPullbacks(bars, ema) };
  };

  it('returns nothing on a bar with no pullback count', () => {
    const bars = Array.from({ length: 30 }, (_, i) => bar(100 + i, 101 + i, 99 + i, 100.5 + i));
    expect(setupAt(build(bars), 20).kind).toBeNull();
  });

  it('rates a second entry above a first', () => {
    const mk = (count: 1 | 2) => {
      const bars: Bar[] = [];
      for (let i = 0; i < 30; i++) bars.push(bar(100 + i, 101 + i, 99 + i, 100.5 + i));
      bars.push(bar(129, 129.5, 127, 127.5));
      bars.push(bar(127, 131, 126.5, 130.8)); // H1, strong bull bar
      if (count === 2) {
        bars.push(bar(130, 130.2, 128, 128.5));
        bars.push(bar(128, 132, 127.5, 131.8)); // H2, strong bull bar
      }
      const ctx = build(bars);
      return setupAt(ctx, bars.length - 1);
    };
    expect(mk(2).quality).toBeGreaterThan(mk(1).quality);
    expect(mk(2).kind).toBe('H2');
  });

  it('marks down a doji signal bar', () => {
    const strong: Bar[] = [];
    for (let i = 0; i < 30; i++) strong.push(bar(100 + i, 101 + i, 99 + i, 100.5 + i));
    const weak = [...strong];
    strong.push(bar(129, 129.5, 127, 127.5));
    weak.push(bar(129, 129.5, 127, 127.5));
    strong.push(bar(127, 131, 126.5, 130.9)); // trend bar closing on its high
    weak.push(bar(128.5, 131, 126.5, 128.7)); // doji

    const s = setupAt(build(strong), strong.length - 1);
    const w = setupAt(build(weak), weak.length - 1);
    expect(s.quality).toBeGreaterThan(w.quality);
    expect(w.reasons.join(' ')).toMatch(/doji|weak/i);
  });

  it('penalises a setup with no room to the next magnet', () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 30; i++) bars.push(bar(100 + i, 101 + i, 99 + i, 100.5 + i));
    bars.push(bar(129, 129.5, 127, 127.5));
    bars.push(bar(127, 131, 126.5, 130.8));
    const ctx = build(bars);
    const roomy = setupAt({ ...ctx, rewardToRisk: { long: 3, short: null } }, bars.length - 1);
    const cramped = setupAt({ ...ctx, rewardToRisk: { long: 0.4, short: null } }, bars.length - 1);
    expect(roomy.quality).toBeGreaterThan(cramped.quality);
    expect(cramped.reasons.join(' ')).toMatch(/not worth the risk/);
  });

  it('always explains itself', () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 30; i++) bars.push(bar(100 + i, 101 + i, 99 + i, 100.5 + i));
    bars.push(bar(129, 129.5, 127, 127.5));
    bars.push(bar(127, 131, 126.5, 130.8));
    const s = setupAt(build(bars), bars.length - 1);
    expect(s.kind).not.toBeNull();
    expect(s.reasons.length).toBeGreaterThan(0);
    expect(s.quality).toBeGreaterThanOrEqual(0);
    expect(s.quality).toBeLessThanOrEqual(1);
  });
});

describe('against the real dataset', () => {
  it('finds setups, but on a minority of bars', () => {
    // If nearly every bar is a setup the detector is useless and the app would
    // train overtrading. If almost none are, there is nothing to play.
    let bars = 0;
    let tradeable = 0;

    for (const s of db.sessions) {
      const v = buildSessionView(s, db.tickSize);
      const counts = countPullbacks(v.bars, v.ema);
      const lines = visibleMagnets(v.magnets, 4);

      for (let i = v.rthStart; i < v.rthEnd; i++) {
        bars++;
        const longRisk = openPosition(v.bars, i, 'long', db.tickSize).risk;
        const shortRisk = openPosition(v.bars, i, 'short', db.tickSize).risk;
        const sig = setupAt(
          {
            bars: v.bars,
            ema: v.ema,
            counts,
            rewardToRisk: {
              long: rewardToRisk(lines, v.bars[i].c, longRisk, 'long')?.rr ?? null,
              short: rewardToRisk(lines, v.bars[i].c, shortRisk, 'short')?.rr ?? null,
            },
          },
          i
        );
        if (isTradeable(sig)) tradeable++;
      }
    }

    const rate = tradeable / bars;
    console.log(
      `\ntradeable setups: ${tradeable} of ${bars} bars (${(rate * 100).toFixed(1)}%) ` +
        `-- about ${(rate * db.rthBars).toFixed(1)} per 78-bar session`
    );
    expect(bars).toBeGreaterThan(3000);
    expect(rate).toBeGreaterThan(0.01);
    expect(rate).toBeLessThan(0.25);
  });
});

describe('isTradeable', () => {
  it('is false for no setup at all', () => {
    expect(isTradeable({ kind: null, dir: null, quality: 0.9, reasons: [] })).toBe(false);
  });
  it('respects the threshold', () => {
    expect(isTradeable({ kind: 'H2', dir: 'long', quality: TRADEABLE, reasons: [] })).toBe(true);
    expect(isTradeable({ kind: 'H2', dir: 'long', quality: TRADEABLE - 0.01, reasons: [] })).toBe(false);
  });
});
