/**
 * Magnets -- the price levels the market is drawn toward.
 *
 * Two rules govern this list, and both are deliberate.
 *
 * 1. Every level is a HARD NUMBER read off bars the player could scroll back and
 *    see. Nothing here needs interpretation, so the app can score against them
 *    without the player being able to argue. Measured moves, breakout-point
 *    retests, wedge targets and trend channel lines are all genuine price-action
 *    magnets and all deliberately absent: they are subjective, and a subjective
 *    level has no business in an auto-graded decision. They belong in the
 *    explanation copy instead.
 *
 * 2. They unlock progressively. A phone-sized chart carrying seven horizontal
 *    lines is unreadable, and an unreadable chart destroys the pacing the whole
 *    app depends on. Starting a beginner with two lines solves chart clutter and
 *    player progression with one mechanism.
 */

import type { MagnetKey, Magnets } from './types';

export interface MagnetMeta {
  key: MagnetKey;
  /** Short label drawn at the right edge of the chart. */
  label: string;
  /** Full name, used in teaching copy and the unlock screen. */
  name: string;
  /** Player level at which this line starts being drawn. */
  unlocksAt: number;
  /** Why it matters -- shown when the magnet is unlocked. */
  why: string;
}

/** Ordered by when they unlock, then by how often they come into play. */
export const MAGNET_META: MagnetMeta[] = [
  {
    key: 'yHigh',
    label: 'YH',
    name: "Yesterday's high",
    unlocksAt: 1,
    why: 'The level day traders draw most. Trading above it is the day trying to become a bull day.',
  },
  {
    key: 'yLow',
    label: 'YL',
    name: "Yesterday's low",
    unlocksAt: 1,
    why: 'The mirror of the high. Breaking below it is the day trying to become a bear day.',
  },
  {
    key: 'yClose',
    label: 'YC',
    name: "Yesterday's close",
    unlocksAt: 2,
    why: 'Where the gap is measured from. It pulls price hard in the first hour.',
  },
  {
    key: 'open',
    label: 'OPEN',
    name: "Today's open",
    unlocksAt: 2,
    why: "The day's bull/bear line. Price returns to it repeatedly, and which side it closes matters.",
  },
  {
    key: 'yMid',
    label: 'YMID',
    name: "Yesterday's midpoint",
    unlocksAt: 3,
    why: 'Trading-range days drift straight to the middle of the prior range.',
  },
  {
    key: 'onHigh',
    label: 'ONH',
    name: 'Overnight high',
    unlocksAt: 4,
    why: 'The top of the pre-market range. The open often tests it before choosing a direction.',
  },
  {
    key: 'onLow',
    label: 'ONL',
    name: 'Overnight low',
    unlocksAt: 4,
    why: 'The bottom of the pre-market range.',
  },
];

export const MAX_MAGNET_LEVEL = Math.max(...MAGNET_META.map((m) => m.unlocksAt));

export interface MagnetLine extends MagnetMeta {
  price: number;
}

/** The magnets a player at `level` should see, sorted high to low for drawing. */
export function visibleMagnets(magnets: Magnets, level: number): MagnetLine[] {
  return MAGNET_META.filter((m) => m.unlocksAt <= level)
    .map((m) => ({ ...m, price: magnets[m.key] }))
    .sort((a, b) => b.price - a.price);
}

/** Magnets unlocked by moving from `fromLevel` to `toLevel`. Drives the unlock screen. */
export function newlyUnlocked(fromLevel: number, toLevel: number): MagnetMeta[] {
  return MAGNET_META.filter((m) => m.unlocksAt > fromLevel && m.unlocksAt <= toLevel);
}

/** Nearest visible magnet above `price`, or null if price is above all of them. */
export function nearestAbove(lines: MagnetLine[], price: number): MagnetLine | null {
  let best: MagnetLine | null = null;
  for (const l of lines) {
    if (l.price > price && (best === null || l.price < best.price)) best = l;
  }
  return best;
}

/** Nearest visible magnet below `price`, or null if price is below all of them. */
export function nearestBelow(lines: MagnetLine[], price: number): MagnetLine | null {
  let best: MagnetLine | null = null;
  for (const l of lines) {
    if (l.price < price && (best === null || l.price > best.price)) best = l;
  }
  return best;
}

/**
 * The next magnet in the direction of a position -- i.e. the realistic place to
 * think about taking profit. With no fixed target in the game, this is what the
 * player is actually reasoning about.
 */
export function targetMagnet(
  lines: MagnetLine[],
  price: number,
  dir: 'long' | 'short'
): MagnetLine | null {
  return dir === 'long' ? nearestAbove(lines, price) : nearestBelow(lines, price);
}

/**
 * Reward-to-risk if the position ran to the next magnet. This is the left-hand
 * side of the trader's equation, and showing it before the player commits is
 * the point of the whole magnet system.
 */
export function rewardToRisk(
  lines: MagnetLine[],
  entry: number,
  risk: number,
  dir: 'long' | 'short'
): { magnet: MagnetLine; rr: number } | null {
  const magnet = targetMagnet(lines, entry, dir);
  if (!magnet || risk <= 0) return null;
  const reward = dir === 'long' ? magnet.price - entry : entry - magnet.price;
  return { magnet, rr: reward / risk };
}
