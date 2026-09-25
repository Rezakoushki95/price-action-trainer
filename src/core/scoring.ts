/**
 * Scoring.
 *
 * The central problem: a textbook-correct Brooks trade loses roughly four times
 * in ten. Grading purely on outcome therefore punishes good decisions and trains
 * superstition -- the player learns to avoid whatever they did last time they
 * lost, which is noise.
 *
 * So the app keeps two separate books:
 *
 *   MONEY  is scored in R, honestly, including the losses. It is the truth.
 *   XP     is awarded on PROCESS -- did you take a real setup, did you pass a
 *          bad one -- and is what drives levels and magnet unlocks.
 *
 * Passing earns XP. This is not a nicety. Brooks' single biggest practical
 * lesson is that most bars are untradeable, and an app that only rewards action
 * trains overtrading, which is the exact habit it is supposed to cure.
 */

import type { ClosedTrade, Direction } from './types';
import { TRADEABLE, type SetupSignal } from './setups';

/** Cumulative XP needed to reach each level. Index 0 is level 1. */
export const LEVEL_THRESHOLDS = [0, 150, 400, 800, 1400, 2200, 3200, 4500, 6000, 8000];

export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

export function levelFromXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

/** Progress toward the next level, 0..1. Returns 1 at max level. */
export function levelProgress(xp: number): {
  level: number;
  into: number;
  need: number;
  frac: number;
} {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, need: 0, frac: 1 };
  const base = LEVEL_THRESHOLDS[level - 1];
  const next = LEVEL_THRESHOLDS[level];
  const into = xp - base;
  const need = next - base;
  return { level, into, need, frac: need > 0 ? into / need : 1 };
}

/** Trades beyond this in one session start costing XP. */
export const OVERTRADE_LIMIT = 5;

export type Action = Direction | 'pass';

export interface DecisionScore {
  xp: number;
  /** Did this count as a good decision? Drives the streak. */
  good: boolean;
  /** One line shown immediately after the decision. */
  verdict: string;
  detail: string[];
}

/**
 * Score the decision itself, independently of what price then did.
 *
 * Note what is deliberately absent: the trade's result. Whether this entry made
 * money is scored in R elsewhere. Mixing the two is what teaches superstition.
 */
export function scoreDecision(
  action: Action,
  setup: SetupSignal,
  tradesThisSession: number
): DecisionScore {
  const real = setup.kind !== null && setup.quality >= TRADEABLE;

  if (action === 'pass') {
    if (!real) {
      return {
        xp: 12,
        good: true,
        verdict: 'Good pass',
        detail: setup.kind
          ? [`${setup.kind} was there but it was weak`, ...setup.reasons.slice(1)]
          : ['No setup. Most bars are not tradeable.'],
      };
    }
    return {
      xp: 2,
      good: false,
      verdict: 'Missed setup',
      detail: [`That was a ${setup.kind} worth taking.`, ...setup.reasons],
    };
  }

  // Taking a trade.
  const overtrading = tradesThisSession >= OVERTRADE_LIMIT;
  const penalty = overtrading ? 0.4 : 1;

  if (!real) {
    return {
      xp: Math.round(2 * penalty),
      good: false,
      verdict: setup.kind ? 'Weak setup' : 'No setup',
      detail: setup.kind
        ? setup.reasons
        : ['Nothing here to trade. This is the bar to sit on your hands.'],
    };
  }

  if (setup.dir !== action) {
    return {
      xp: Math.round(2 * penalty),
      good: false,
      verdict: 'Wrong way',
      detail: [`The setup was a ${setup.kind} -- the other direction.`, ...setup.reasons],
    };
  }

  const base = 20 + Math.round(setup.quality * 15);
  return {
    xp: Math.round(base * penalty),
    good: true,
    verdict: overtrading ? `${setup.kind} taken (overtrading)` : `${setup.kind} taken`,
    detail: overtrading
      ? [`${OVERTRADE_LIMIT}+ trades this session -- XP reduced.`, ...setup.reasons]
      : setup.reasons,
  };
}

/**
 * A small process bonus for how the position was ENDED, not for how much it made.
 * Getting out deliberately is a skill; being carried out by the bell is not.
 */
export function scoreExit(trade: ClosedTrade): DecisionScore {
  if (trade.reason === 'manual' && trade.r > 0) {
    return {
      xp: 8,
      good: true,
      verdict: `Closed +${trade.r.toFixed(2)}R`,
      detail: ['You chose the exit. That is the half of trading nobody practises.'],
    };
  }
  if (trade.reason === 'stop') {
    const near = trade.maxFavourableR >= 0.5;
    return {
      xp: 0,
      good: true, // a stop-out is not a process failure -- the plan worked as designed
      verdict: `Stopped ${trade.r.toFixed(2)}R`,
      detail: near
        ? [
            `It was +${trade.maxFavourableR.toFixed(2)}R in your favour first.`,
            'A good trade can still lose. That is the job.',
          ]
        : ['The stop did what it is for.'],
    };
  }
  if (trade.reason === 'bell') {
    return {
      xp: 0,
      good: true,
      verdict: `Bell ${trade.r >= 0 ? '+' : ''}${trade.r.toFixed(2)}R`,
      detail: ['Carried out at the close. Deciding when to leave beats being told.'],
    };
  }
  return {
    xp: 0,
    good: true,
    verdict: `Closed ${trade.r.toFixed(2)}R`,
    detail: [],
  };
}

export interface Progress {
  xp: number;
  streak: number;
  bestStreak: number;
  sessionsPlayed: number;
  totalR: number;
  tradesTaken: number;
  wins: number;
}

export const EMPTY_PROGRESS: Progress = {
  xp: 0,
  streak: 0,
  bestStreak: 0,
  sessionsPlayed: 0,
  totalR: 0,
  tradesTaken: 0,
  wins: 0,
};

/** Apply a decision to the running progress. */
export function applyDecision(p: Progress, score: DecisionScore): Progress {
  const streak = score.good ? p.streak + 1 : 0;
  return {
    ...p,
    xp: p.xp + score.xp,
    streak,
    bestStreak: Math.max(p.bestStreak, streak),
  };
}

export function applyTrade(p: Progress, trade: ClosedTrade): Progress {
  return {
    ...p,
    totalR: p.totalR + trade.r,
    tradesTaken: p.tradesTaken + 1,
    wins: p.wins + (trade.r > 0 ? 1 : 0),
  };
}
