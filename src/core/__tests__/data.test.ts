/**
 * Guards the shipped dataset itself.
 *
 * Two jobs. First, the bars must be sound -- they are baked at build time from an
 * undocumented endpoint, against a futures symbol that rolls contract every
 * quarter, and if they are wrong the app teaches nonsense very convincingly.
 *
 * Second, and just as important, the file must not identify the real trading day.
 * A player who can work out the date can look it up and see what happens next,
 * which makes the whole exercise pointless. Dates and absolute prices therefore
 * live in data-meta/, outside src/, where no bundler can reach them.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import raw from '../../data/sessions.json';
import { EMA_PERIOD } from '../ema';
import { buildSessionView, priceExtent, railBars, rthProgress } from '../session';
import { MAGNET_META, visibleMagnets } from '../magnets';
import { openPosition, resolve as resolveTrade } from '../trade';
import type { SessionDb } from '../types';

const db = raw as unknown as SessionDb;
const SHIPPED = resolve(__dirname, '../../data/sessions.json');
const META = resolve(__dirname, '../../../data-meta/sessions.meta.json');

describe('nothing identifying is shipped', () => {
  const text = readFileSync(SHIPPED, 'utf8');

  it('contains no dates', () => {
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('contains no instrument symbol', () => {
    expect(text).not.toMatch(/ES=F|E-?mini|CME/i);
  });

  it('carries no build provenance a reader could pivot from', () => {
    expect(text).not.toMatch(/generatedAt|prevDate|symbol/);
  });

  it('has no absolute price anywhere near a real index level', () => {
    // Every price is points from the open, so a four-digit one would mean the
    // normalisation was skipped somewhere. Checked on the parsed data rather than
    // the raw text, because bar times are seconds from the bell and legitimately
    // reach 23100.
    const prices: number[] = [];
    for (const s of db.sessions) {
      for (const b of [...s.seed, ...s.rth, ...s.rail]) prices.push(b.o, b.h, b.l, b.c);
      prices.push(...Object.values(s.magnets));
    }
    expect(prices.filter((p) => Math.abs(p) > 1000)).toEqual([]);
  });

  it('keeps the identifying data in a file outside src/', () => {
    const meta = JSON.parse(readFileSync(META, 'utf8'));
    expect(meta.symbol).toBe('ES=F');
    expect(meta.sessions.length).toBe(db.sessions.length);
    expect(meta.sessions[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('normalisation', () => {
  it('declares itself normalised', () => {
    expect(db.normalised).toBe(true);
  });

  it('opens every session at price 0 and time 0', () => {
    for (const s of db.sessions) {
      expect(s.rth[0].o).toBe(0);
      expect(s.rth[0].t).toBe(0);
      expect(s.magnets.open).toBe(0);
    }
  });

  it('puts every seed bar before the bell', () => {
    for (const s of db.sessions) {
      expect(s.seed[s.seed.length - 1].t).toBeLessThan(0);
      for (const b of s.seed) expect(b.t).toBeLessThan(0);
    }
  });

  it('keeps offsets small enough to be a day of trading, not a price level', () => {
    for (const s of db.sessions) {
      for (const b of s.rth) expect(Math.abs(b.c)).toBeLessThan(1000);
    }
  });
});

describe('dataset shape', () => {
  it('ships a usable number of sessions', () => {
    expect(db.sessions.length).toBeGreaterThan(20);
    expect(db.interval).toBe('5m');
    expect(db.tickSize).toBe(0.25);
  });

  it('has a full regular session in every entry', () => {
    for (const s of db.sessions) expect(s.rth.length).toBe(db.rthBars);
  });

  it('carries enough overnight bars to define the 20-bar EMA at the open', () => {
    for (const s of db.sessions) expect(s.seed.length).toBeGreaterThanOrEqual(EMA_PERIOD);
  });

  it('gives every session its own rail, no longer than the configured length', () => {
    for (const s of db.sessions) {
      // A one- or two-bar rail looks broken, and the rail is the feature the app
      // is built around, so the pipeline drops sessions without real context.
      expect(s.rail.length).toBeGreaterThanOrEqual(10);
      expect(s.rail.length).toBeLessThanOrEqual(db.dailyRail);
    }
  });
});

describe('bar integrity', () => {
  it('has coherent OHLC on every bar', () => {
    for (const s of db.sessions) {
      for (const b of [...s.seed, ...s.rth]) {
        expect(b.h).toBeGreaterThanOrEqual(Math.max(b.o, b.c));
        expect(b.l).toBeLessThanOrEqual(Math.min(b.o, b.c));
        expect(b.h).toBeGreaterThanOrEqual(b.l);
      }
    }
  });

  it('quotes every price on the 0.25 tick grid', () => {
    for (const s of db.sessions) {
      for (const b of [...s.seed, ...s.rth]) {
        for (const p of [b.o, b.h, b.l, b.c]) {
          expect(Math.abs(p / db.tickSize - Math.round(p / db.tickSize))).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('has contiguous five-minute regular-session bars', () => {
    for (const s of db.sessions) {
      for (let i = 1; i < s.rth.length; i++) {
        expect(s.rth[i].t - s.rth[i - 1].t).toBe(300);
      }
    }
  });

  it('runs the session clock from the bell to the close', () => {
    for (const s of db.sessions) {
      expect(s.rth[s.rth.length - 1].t).toBe((db.rthBars - 1) * 300);
    }
  });
});

describe('magnets', () => {
  it('matches the last rail bar, which is yesterday', () => {
    for (const s of db.sessions) {
      const y = s.rail[s.rail.length - 1];
      expect(s.magnets.yHigh).toBe(y.h);
      expect(s.magnets.yLow).toBe(y.l);
      expect(s.magnets.yClose).toBe(y.c);
      expect(s.magnets.yMid).toBeCloseTo((y.h + y.l) / 2, 10);
    }
  });

  it('derives the overnight levels from the seed bars', () => {
    for (const s of db.sessions) {
      expect(s.magnets.onHigh).toBe(Math.max(...s.seed.map((b) => b.h)));
      expect(s.magnets.onLow).toBe(Math.min(...s.seed.map((b) => b.l)));
    }
  });

  it('keeps every magnet in the price neighbourhood of its own session', () => {
    // A surviving contract stitch shows up here: yesterday's levels would sit an
    // absurd distance from today's chart, drawing a line the player can never see.
    for (const s of db.sessions) {
      const { min, max } = priceExtent([...s.seed, ...s.rth]);
      const span = Math.max(max - min, 1);
      for (const m of MAGNET_META) {
        const p = s.magnets[m.key];
        const dist = p > max ? p - max : p < min ? min - p : 0;
        expect(dist).toBeLessThan(3 * span);
      }
    }
  });
});

describe('session view', () => {
  it('defines the EMA for every tradeable bar', () => {
    for (const s of db.sessions) {
      const v = buildSessionView(s, db.tickSize);
      for (let i = v.rthStart; i <= v.rthEnd; i++) {
        expect(v.ema[i]).not.toBeNull();
        expect(Number.isFinite(v.ema[i] as number)).toBe(true);
      }
    }
  });

  it('keeps the EMA inside the price range it was built from', () => {
    for (const s of db.sessions.slice(0, 10)) {
      const v = buildSessionView(s, db.tickSize);
      const { min, max } = priceExtent(v.bars);
      for (let i = v.rthStart; i <= v.rthEnd; i++) {
        expect(v.ema[i] as number).toBeGreaterThanOrEqual(min);
        expect(v.ema[i] as number).toBeLessThanOrEqual(max);
      }
    }
  });

  it('counts the regular session from 1 to 78', () => {
    const v = buildSessionView(db.sessions[0], db.tickSize);
    expect(rthProgress(v, v.rthStart)).toEqual({ bar: 1, total: db.rthBars });
    expect(rthProgress(v, v.rthEnd)).toEqual({ bar: db.rthBars, total: db.rthBars });
  });

  it('builds a context rail ending on yesterday', () => {
    for (const s of db.sessions.slice(-10)) {
      const { bars, yesterdayIndex } = railBars(s);
      expect(bars.length).toBeGreaterThan(0);
      expect(yesterdayIndex).toBe(bars.length - 1);
      expect(bars[yesterdayIndex].h).toBe(s.magnets.yHigh);
    }
  });
});

describe('playability', () => {
  it('lets a position be opened on any bar and always resolves', () => {
    const v = buildSessionView(db.sessions[0], db.tickSize);
    for (let i = v.rthStart; i < v.rthEnd; i++) {
      for (const dir of ['long', 'short'] as const) {
        const t = resolveTrade(openPosition(v.bars, i, dir, db.tickSize), v.bars, v.rthEnd);
        expect(Number.isFinite(t.r)).toBe(true);
        expect(t.r).toBeGreaterThanOrEqual(-1.5); // a gap through the stop can exceed -1R
        expect(['stop', 'bell']).toContain(t.reason);
      }
    }
  });

  it('never produces zero risk anywhere in the dataset', () => {
    for (const s of db.sessions) {
      const v = buildSessionView(s, db.tickSize);
      for (let i = v.rthStart; i <= v.rthEnd; i++) {
        expect(openPosition(v.bars, i, 'long', db.tickSize).risk).toBeGreaterThan(0);
        expect(openPosition(v.bars, i, 'short', db.tickSize).risk).toBeGreaterThan(0);
      }
    }
  });

  it('offers something to aim at from the open on every session', () => {
    // With no fixed target, a session with no magnet in reach is unplayable.
    for (const s of db.sessions) {
      const lines = visibleMagnets(s.magnets, 1);
      expect(lines.length).toBe(2);
      const above = lines.some((l) => l.price > 0);
      const below = lines.some((l) => l.price < 0);
      expect(above || below).toBe(true);
    }
  });
});
