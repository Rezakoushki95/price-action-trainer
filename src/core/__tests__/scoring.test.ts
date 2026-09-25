import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROGRESS,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  OVERTRADE_LIMIT,
  applyDecision,
  applyTrade,
  levelFromXp,
  levelProgress,
  scoreDecision,
  scoreExit,
} from '../scoring';
import { MAGNET_META } from '../magnets';
import type { SetupSignal } from '../setups';
import type { ClosedTrade } from '../types';

const good: SetupSignal = { kind: 'H2', dir: 'long', quality: 0.8, reasons: ['H2 in a bull trend'] };
const weak: SetupSignal = { kind: 'H1', dir: 'long', quality: 0.3, reasons: ['H1, doji signal bar'] };
const none: SetupSignal = { kind: null, dir: null, quality: 0, reasons: [] };

const trade = (over: Partial<ClosedTrade>): ClosedTrade => ({
  dir: 'long', entryIndex: 0, entry: 100, stop: 99, risk: 1,
  exitIndex: 5, exit: 102, reason: 'manual', r: 2,
  maxFavourableR: 2, maxAdverseR: 0, ...over,
});

describe('levels', () => {
  it('starts at level 1 with no XP', () => {
    expect(levelFromXp(0)).toBe(1);
  });

  it('advances at each threshold', () => {
    LEVEL_THRESHOLDS.forEach((t, i) => expect(levelFromXp(t)).toBe(i + 1));
  });

  it('does not advance one XP short of a threshold', () => {
    expect(levelFromXp(LEVEL_THRESHOLDS[1] - 1)).toBe(1);
  });

  it('caps at max level', () => {
    expect(levelFromXp(999_999)).toBe(MAX_LEVEL);
    expect(levelProgress(999_999).frac).toBe(1);
  });

  it('reports fractional progress toward the next level', () => {
    const mid = (LEVEL_THRESHOLDS[0] + LEVEL_THRESHOLDS[1]) / 2;
    expect(levelProgress(mid).frac).toBeCloseTo(0.5, 6);
    expect(levelProgress(mid).level).toBe(1);
  });

  it('unlocks every magnet within the level ladder', () => {
    // A magnet that unlocks past the maximum level is unreachable content.
    for (const m of MAGNET_META) expect(m.unlocksAt).toBeLessThanOrEqual(MAX_LEVEL);
  });
});

describe('scoreDecision', () => {
  it('rewards passing when there is no setup', () => {
    const s = scoreDecision('pass', none, 0);
    expect(s.xp).toBeGreaterThan(0);
    expect(s.good).toBe(true);
    expect(s.verdict).toMatch(/good pass/i);
  });

  it('rewards passing a weak setup too', () => {
    expect(scoreDecision('pass', weak, 0).good).toBe(true);
  });

  it('does not reward passing a real setup', () => {
    const s = scoreDecision('pass', good, 0);
    expect(s.good).toBe(false);
    expect(s.xp).toBeLessThan(scoreDecision('pass', none, 0).xp);
  });

  it('pays most for taking a real setup the right way', () => {
    const s = scoreDecision('long', good, 0);
    expect(s.good).toBe(true);
    expect(s.xp).toBeGreaterThan(scoreDecision('pass', none, 0).xp);
  });

  it('does not pay for trading the wrong direction', () => {
    expect(scoreDecision('short', good, 0).good).toBe(false);
  });

  it('does not pay for trading when there is nothing there', () => {
    const s = scoreDecision('long', none, 0);
    expect(s.good).toBe(false);
    expect(s.detail.join(' ')).toMatch(/sit on your hands/i);
  });

  it('cuts XP once the player is overtrading', () => {
    const normal = scoreDecision('long', good, 0).xp;
    const spamming = scoreDecision('long', good, OVERTRADE_LIMIT).xp;
    expect(spamming).toBeLessThan(normal);
  });

  it('never charges XP for passing, however wrong it was', () => {
    // Discipline is never punished; only unrewarded. Negative XP for patience
    // would teach exactly the habit the app exists to break.
    expect(scoreDecision('pass', good, 0).xp).toBeGreaterThanOrEqual(0);
  });

  it('always explains itself', () => {
    for (const setup of [good, weak, none]) {
      for (const action of ['long', 'short', 'pass'] as const) {
        const s = scoreDecision(action, setup, 0);
        expect(s.verdict.length).toBeGreaterThan(0);
        expect(s.detail.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('scoreExit', () => {
  it('pays a bonus for choosing to get out in profit', () => {
    expect(scoreExit(trade({ reason: 'manual', r: 1.5 })).xp).toBeGreaterThan(0);
  });

  it('treats a stop-out as a sound process, not a failure', () => {
    // The single most important thing this app teaches.
    const s = scoreExit(trade({ reason: 'stop', r: -1, maxFavourableR: 0 }));
    expect(s.good).toBe(true);
  });

  it('names the near miss when a stop-out had been in profit', () => {
    const s = scoreExit(trade({ reason: 'stop', r: -1, maxFavourableR: 1.4 }));
    expect(s.detail.join(' ')).toMatch(/1\.40R in your favour/);
    expect(s.detail.join(' ')).toMatch(/good trade can still lose/i);
  });

  it('does not pay for being carried out by the bell', () => {
    expect(scoreExit(trade({ reason: 'bell', r: 0.8 })).xp).toBe(0);
  });
});

describe('progress', () => {
  it('builds a streak on good decisions and breaks it on a bad one', () => {
    let p = EMPTY_PROGRESS;
    p = applyDecision(p, scoreDecision('pass', none, 0));
    p = applyDecision(p, scoreDecision('long', good, 0));
    expect(p.streak).toBe(2);
    expect(p.bestStreak).toBe(2);

    p = applyDecision(p, scoreDecision('long', none, 0));
    expect(p.streak).toBe(0);
    expect(p.bestStreak).toBe(2); // best is remembered
  });

  it('accumulates R and wins separately from XP', () => {
    let p = EMPTY_PROGRESS;
    p = applyTrade(p, trade({ r: 2 }));
    p = applyTrade(p, trade({ r: -1 }));
    expect(p.totalR).toBeCloseTo(1, 10);
    expect(p.tradesTaken).toBe(2);
    expect(p.wins).toBe(1);
    expect(p.xp).toBe(0); // money and process are separate books
  });

  it('lets a losing player still gain levels through good process', () => {
    let p = EMPTY_PROGRESS;
    for (let i = 0; i < 20; i++) {
      p = applyDecision(p, scoreDecision('long', good, 0));
      p = applyTrade(p, trade({ r: -1, reason: 'stop' }));
    }
    expect(p.totalR).toBeLessThan(0);
    expect(levelFromXp(p.xp)).toBeGreaterThan(1);
  });
});
