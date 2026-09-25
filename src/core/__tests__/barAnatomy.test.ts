import { describe, expect, it } from 'vitest';
import { anatomy, averageRange, describe as describeBar, overlap } from '../barAnatomy';
import type { Bar } from '../types';

const bar = (o: number, h: number, l: number, c: number): Bar => ({ t: 0, o, h, l, c });

describe('anatomy', () => {
  it('reads a strong bull trend bar closing on its high', () => {
    const a = anatomy(bar(100, 110, 99, 110));
    expect(a.isBull).toBe(true);
    expect(a.isTrendBar).toBe(true);
    expect(a.isDoji).toBe(false);
    expect(a.closePosition).toBeCloseTo(1, 10);
    expect(a.upperTail).toBe(0);
  });

  it('reads a doji as indecision regardless of direction', () => {
    const a = anatomy(bar(105, 110, 100, 105.5));
    expect(a.isDoji).toBe(true);
    expect(a.isTrendBar).toBe(false);
    expect(a.closePosition).toBeCloseTo(0.55, 10);
  });

  it('separates body from tails', () => {
    const a = anatomy(bar(102, 110, 100, 106));
    expect(a.body).toBe(4);
    expect(a.range).toBe(10);
    expect(a.bodyRatio).toBeCloseTo(0.4, 10);
    expect(a.upperTail).toBe(4);
    expect(a.lowerTail).toBe(2);
  });

  it('reads a bear bar closing on its low', () => {
    const a = anatomy(bar(110, 111, 100, 100));
    expect(a.isBear).toBe(true);
    expect(a.isTrendBar).toBe(true);
    expect(a.closePosition).toBeCloseTo(0, 10);
  });

  it('survives a zero-range bar without dividing by zero', () => {
    const a = anatomy(bar(100, 100, 100, 100));
    expect(Number.isFinite(a.bodyRatio)).toBe(true);
    expect(Number.isFinite(a.closePosition)).toBe(true);
    expect(a.isDoji).toBe(true);
  });
});

describe('overlap', () => {
  it('measures an inside bar as its share of the previous range', () => {
    expect(overlap(bar(102, 104, 101, 103), bar(100, 110, 100, 105))).toBeCloseTo(0.3, 10);
  });

  it('is 0 when a bar gaps clear of the previous range', () => {
    expect(overlap(bar(120, 125, 119, 124), bar(100, 110, 100, 105))).toBe(0);
  });

  it('measures partial overlap against the previous bar range', () => {
    expect(overlap(bar(105, 115, 105, 112), bar(100, 110, 100, 105))).toBeCloseTo(0.5, 10);
  });
});

describe('averageRange', () => {
  it('averages the trailing window', () => {
    const bars = [bar(0, 10, 0, 5), bar(0, 20, 0, 5), bar(0, 30, 0, 5)];
    expect(averageRange(bars, 2, 3)).toBeCloseTo(20, 10);
  });

  it('clamps the window at the start of the series', () => {
    const bars = [bar(0, 10, 0, 5), bar(0, 20, 0, 5)];
    expect(averageRange(bars, 0, 20)).toBeCloseTo(10, 10);
  });
});

describe('describe', () => {
  it('uses standard price-action vocabulary the player will meet again in any book', () => {
    expect(describeBar(bar(100, 110, 99, 110))).toBe('strong bull trend bar');
    expect(describeBar(bar(110, 111, 100, 100))).toBe('strong bear trend bar');
    expect(describeBar(bar(105, 110, 100, 105.5))).toBe('doji');
    expect(describeBar(bar(100, 100, 100, 100))).toBe('no range');
  });
});
