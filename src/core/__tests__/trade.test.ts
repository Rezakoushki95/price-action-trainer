import { describe, expect, it } from 'vitest';
import {
  closeManually,
  openPosition,
  resolve,
  stepPosition,
  stopFillPrice,
  unrealisedR,
  wasNearMiss,
} from '../trade';
import type { Bar } from '../types';

const TICK = 0.25;
const bar = (o: number, h: number, l: number, c: number, t = 0): Bar => ({ t, o, h, l, c });

describe('openPosition', () => {
  it('fills a long at the signal bar close with the stop one tick under its low', () => {
    const pos = openPosition([bar(100, 106, 98, 104)], 0, 'long', TICK);
    expect(pos.entry).toBe(104);
    expect(pos.stop).toBe(97.75);
    expect(pos.risk).toBeCloseTo(6.25, 10);
  });

  it('fills a short at the close with the stop one tick over the high', () => {
    const pos = openPosition([bar(100, 106, 98, 101)], 0, 'short', TICK);
    expect(pos.entry).toBe(101);
    expect(pos.stop).toBe(106.25);
    expect(pos.risk).toBeCloseTo(5.25, 10);
  });

  it('always risks at least one tick, even when the bar closes on its extreme', () => {
    // A bear bar closing exactly on its low is a terrible long signal, but it
    // must not produce zero or negative risk and blow up every R calculation.
    const pos = openPosition([bar(100, 101, 99, 99)], 0, 'long', TICK);
    expect(pos.risk).toBeCloseTo(TICK, 10);
    expect(pos.risk).toBeGreaterThan(0);
  });
});

describe('stopFillPrice', () => {
  const long = openPosition([bar(100, 106, 98, 104)], 0, 'long', TICK); // stop 97.75

  it('is null while the bar holds above the stop', () => {
    expect(stopFillPrice(long, bar(104, 108, 100, 107))).toBeNull();
  });

  it('fills at the stop when the bar trades through it', () => {
    expect(stopFillPrice(long, bar(104, 105, 96, 99))).toBe(97.75);
  });

  it('fills at the open when the bar gaps straight through the stop', () => {
    // Gapping a stop is a real cost; filling at the stop price would flatter the score.
    expect(stopFillPrice(long, bar(95, 96, 94, 95))).toBe(95);
  });

  it('mirrors for shorts', () => {
    const short = openPosition([bar(100, 106, 98, 101)], 0, 'short', TICK); // stop 106.25
    expect(stopFillPrice(short, bar(101, 105, 99, 100))).toBeNull();
    expect(stopFillPrice(short, bar(101, 107, 100, 106))).toBe(106.25);
    expect(stopFillPrice(short, bar(108, 109, 107, 108))).toBe(108);
  });
});

describe('unrealisedR', () => {
  it('is +1R at one risk-width in favour and -1R at the stop', () => {
    const pos = openPosition([bar(100, 104, 100, 104)], 0, 'long', TICK); // stop 99.75, risk 4.25
    expect(unrealisedR(pos, 104 + 4.25)).toBeCloseTo(1, 10);
    expect(unrealisedR(pos, pos.stop)).toBeCloseTo(-1, 10);
  });

  it('inverts for a short', () => {
    const pos = openPosition([bar(104, 104, 100, 100)], 0, 'short', TICK); // stop 104.25, risk 4.25
    expect(unrealisedR(pos, 100 - 4.25)).toBeCloseTo(1, 10);
    expect(unrealisedR(pos, pos.stop)).toBeCloseTo(-1, 10);
  });
});

describe('stepPosition', () => {
  const bars = [bar(100, 106, 98, 104), bar(104, 110, 103, 109), bar(109, 111, 96, 97)];

  it('carries the position and tracks the best excursion', () => {
    const pos = openPosition(bars, 0, 'long', TICK);
    const res = stepPosition(pos, bars[1], 1, false);
    expect(res.status).toBe('open');
    if (res.status !== 'open') return;
    expect(res.position.maxFavourableR).toBeCloseTo((110 - 104) / 6.25, 10);
    expect(res.position.maxAdverseR).toBeCloseTo((103 - 104) / 6.25, 10);
  });

  it('closes on the stop and reports -1R', () => {
    const pos = openPosition(bars, 0, 'long', TICK);
    const res = stepPosition(pos, bars[2], 2, false);
    expect(res.status).toBe('closed');
    if (res.status !== 'closed') return;
    expect(res.trade.reason).toBe('stop');
    expect(res.trade.r).toBeCloseTo(-1, 10);
  });

  it('closes at the bell on the final bar', () => {
    const pos = openPosition(bars, 0, 'long', TICK);
    const res = stepPosition(pos, bars[1], 1, true);
    expect(res.status).toBe('closed');
    if (res.status !== 'closed') return;
    expect(res.trade.reason).toBe('bell');
    expect(res.trade.exit).toBe(109);
  });

  it('takes the stop in preference to the bell on the final bar', () => {
    // A position stopped out during the closing bar did not survive to the close.
    const pos = openPosition(bars, 0, 'long', TICK);
    const res = stepPosition(pos, bars[2], 2, true);
    expect(res.status).toBe('closed');
    if (res.status !== 'closed') return;
    expect(res.trade.reason).toBe('stop');
  });
});

describe('resolve', () => {
  it('runs to the stop when one is hit', () => {
    const bars = [bar(100, 106, 98, 104), bar(104, 108, 103, 107), bar(107, 107, 95, 96)];
    const t = resolve(openPosition(bars, 0, 'long', TICK), bars, 2);
    expect(t.reason).toBe('stop');
    expect(t.r).toBeCloseTo(-1, 10);
  });

  it('runs to the bell when the stop is never touched', () => {
    const bars = [bar(100, 106, 98, 104), bar(104, 108, 103, 107), bar(107, 112, 106, 111)];
    const t = resolve(openPosition(bars, 0, 'long', TICK), bars, 2);
    expect(t.reason).toBe('bell');
    expect(t.exit).toBe(111);
    expect(t.r).toBeCloseTo((111 - 104) / 6.25, 10);
  });

  it('settles flat when opened on the very last bar', () => {
    const bars = [bar(100, 106, 98, 104)];
    const t = resolve(openPosition(bars, 0, 'long', TICK), bars, 0);
    expect(t.r).toBe(0);
  });
});

describe('closeManually', () => {
  it('exits at the current bar close', () => {
    const bars = [bar(100, 106, 98, 104), bar(104, 110, 103, 108)];
    const t = closeManually(openPosition(bars, 0, 'long', TICK), 1, bars[1]);
    expect(t.reason).toBe('manual');
    expect(t.exit).toBe(108);
    expect(t.r).toBeCloseTo((108 - 104) / 6.25, 10);
  });
});

describe('wasNearMiss', () => {
  it('flags a stop-out that had been meaningfully in profit first', () => {
    const bars = [bar(100, 106, 98, 104), bar(104, 112, 104, 111), bar(111, 111, 96, 97)];
    const t = resolve(openPosition(bars, 0, 'long', TICK), bars, 2);
    expect(t.reason).toBe('stop');
    expect(wasNearMiss(t)).toBe(true);
  });

  it('does not flag a stop-out that never went anywhere', () => {
    const bars = [bar(100, 106, 98, 104), bar(104, 104, 96, 97)];
    const t = resolve(openPosition(bars, 0, 'long', TICK), bars, 1);
    expect(wasNearMiss(t)).toBe(false);
  });
});
