import { describe, expect, it } from 'vitest';
import {
  MAGNET_META,
  MAX_MAGNET_LEVEL,
  nearestAbove,
  nearestBelow,
  newlyUnlocked,
  rewardToRisk,
  targetMagnet,
  visibleMagnets,
} from '../magnets';
import type { Magnets } from '../types';

const M: Magnets = {
  yHigh: 6050,
  yLow: 5990,
  yClose: 6020,
  yMid: 6020, // deliberately equal to yClose: coincident levels must not break anything
  onHigh: 6035,
  onLow: 6005,
  open: 6015,
};

describe('unlock ladder', () => {
  it('starts a beginner with only yesterday high and low', () => {
    const keys = visibleMagnets(M, 1).map((m) => m.key).sort();
    expect(keys).toEqual(['yHigh', 'yLow']);
  });

  it('adds levels as the player progresses and never removes one', () => {
    let prev = 0;
    for (let lvl = 1; lvl <= MAX_MAGNET_LEVEL; lvl++) {
      const n = visibleMagnets(M, lvl).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(prev).toBe(MAGNET_META.length);
  });

  it('keeps the chart readable at every level', () => {
    // More than five horizontal lines on a phone chart is unreadable, and an
    // unreadable chart destroys the pacing the app depends on.
    for (let lvl = 1; lvl <= 3; lvl++) {
      expect(visibleMagnets(M, lvl).length).toBeLessThanOrEqual(5);
    }
  });

  it('sorts high to low for drawing', () => {
    const prices = visibleMagnets(M, MAX_MAGNET_LEVEL).map((m) => m.price);
    expect([...prices].sort((a, b) => b - a)).toEqual(prices);
  });

  it('reports exactly what a level-up revealed', () => {
    expect(newlyUnlocked(1, 2).map((m) => m.key).sort()).toEqual(['open', 'yClose']);
    expect(newlyUnlocked(3, 3)).toEqual([]);
  });

  it('gives every magnet a label and a reason it matters', () => {
    for (const m of MAGNET_META) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.why.length).toBeGreaterThan(10);
      expect(m.unlocksAt).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('nearest magnet', () => {
  const lines = visibleMagnets(M, MAX_MAGNET_LEVEL);

  it('finds the closest level above and below', () => {
    expect(nearestAbove(lines, 6019)?.price).toBe(6020);
    expect(nearestBelow(lines, 6019)?.price).toBe(6015);
  });

  it('returns null past the outermost magnet', () => {
    expect(nearestAbove(lines, 9999)).toBeNull();
    expect(nearestBelow(lines, 1)).toBeNull();
  });

  it('excludes a magnet sitting exactly at the price', () => {
    // Standing on a level means the next one is the target, not this one.
    expect(nearestAbove(lines, 6050)).toBeNull();
    expect(nearestBelow(lines, 5990)).toBeNull();
  });

  it('aims up for a long and down for a short', () => {
    expect(targetMagnet(lines, 6019, 'long')?.price).toBe(6020);
    expect(targetMagnet(lines, 6019, 'short')?.price).toBe(6015);
  });
});

describe('rewardToRisk', () => {
  const lines = visibleMagnets(M, MAX_MAGNET_LEVEL);

  it('measures reward to the next magnet in units of risk', () => {
    // Long at 6015, risk 5, next magnet up is 6020 -> 1R.
    const rr = rewardToRisk(lines, 6015, 5, 'long');
    expect(rr?.magnet.price).toBe(6020);
    expect(rr?.rr).toBeCloseTo(1, 10);
  });

  it('rates a tight stop under a distant magnet highly', () => {
    const rr = rewardToRisk(lines, 6036, 2, 'long');
    expect(rr?.magnet.price).toBe(6050);
    expect(rr?.rr).toBeCloseTo(7, 10);
  });

  it('returns null when there is nothing left to aim at', () => {
    expect(rewardToRisk(lines, 9999, 5, 'long')).toBeNull();
  });

  it('returns null rather than dividing by zero risk', () => {
    expect(rewardToRisk(lines, 6015, 0, 'long')).toBeNull();
  });
});
