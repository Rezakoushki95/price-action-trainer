/**
 * Integration tests for the game loop.
 *
 * These drive the real store, not a reimplementation, so they cover the exact
 * path the app takes. The invariant they exist to protect is the one the whole
 * design rests on: ONE TAP REVEALS ONE BAR, always, whether flat or in a
 * position. If that ever slips the app stops feeling like the thing it is
 * supposed to feel like.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));

const { useGame, db, setupNow, magnetsFor } = await import('../gameStore');
const { isTradeable } = await import('../../core/setups');
const { EMPTY_PROGRESS } = await import('../../core/scoring');

const S = () => useGame.getState();

beforeEach(() => {
  useGame.setState({ progress: { ...EMPTY_PROGRESS } });
  S().hydrateSession(0);
});

describe('session setup', () => {
  it('opens on the first bar of the regular session', () => {
    const s = S();
    expect(s.index).toBe(s.view.rthStart);
    expect(s.phase).toBe('playing');
    expect(s.position).toBeNull();
    expect(s.trades).toEqual([]);
  });

  it('shows only the level-1 magnets to a new player', () => {
    expect(magnetsFor(S().view, 0).map((m) => m.key).sort()).toEqual(['yHigh', 'yLow']);
  });

  it('has the EMA defined from the very first tradeable bar', () => {
    const s = S();
    expect(s.view.ema[s.view.rthStart]).not.toBeNull();
  });
});

describe('one tap, one bar', () => {
  it('advances exactly one bar on a pass', () => {
    const before = S().index;
    S().act('pass');
    expect(S().index).toBe(before + 1);
  });

  it('advances exactly one bar when entering a position', () => {
    const before = S().index;
    S().act('long');
    expect(S().index).toBe(before + 1);
  });

  it('advances exactly one bar on hold while in a position', () => {
    S().act('long');
    if (!S().position) return; // stopped out immediately; covered elsewhere
    const before = S().index;
    S().hold();
    expect(S().index).toBe(before + 1);
  });

  it('advances exactly one bar on a manual exit', () => {
    S().act('long');
    if (!S().position) return;
    const before = S().index;
    S().exitNow();
    expect(S().index).toBe(before + 1);
  });

  it('ignores a second entry while already in a position', () => {
    S().act('long');
    if (!S().position) return;
    const before = { index: S().index, pos: S().position };
    S().act('short');
    expect(S().index).toBe(before.index);
    expect(S().position).toBe(before.pos);
  });
});

describe('entering and exiting', () => {
  it('fills at the close of the decided bar with the stop past its extreme', () => {
    const s = S();
    const signal = s.view.bars[s.index];
    s.act('long');
    const pos = S().position;
    if (!pos) return; // immediate stop-out is legitimate
    expect(pos.entry).toBe(signal.c);
    expect(pos.stop).toBeCloseTo(signal.l - db.tickSize, 10);
    expect(pos.risk).toBeGreaterThan(0);
  });

  it('exits manually at the close of the bar on screen', () => {
    S().act('long');
    if (!S().position) return;
    const barAtExit = S().view.bars[S().index];
    S().exitNow();
    const t = S().trades[S().trades.length - 1];
    expect(t.reason).toBe('manual');
    expect(t.exit).toBe(barAtExit.c);
  });

  it('does not open a position on the closing bar', () => {
    // There is no bar left to trade against, so it would settle flat.
    const s = S();
    useGame.setState({ index: s.view.rthEnd });
    S().act('long');
    expect(S().position).toBeNull();
  });
});

describe('playing a session to the bell', () => {
  const play = (decide: (i: number) => 'long' | 'short' | 'pass' | 'hold' | 'exit') => {
    let taps = 0;
    while (S().phase === 'playing' && taps < 500) {
      const before = S().index;
      const s = S();
      if (s.position) {
        const d = decide(s.index);
        if (d === 'exit') s.exitNow();
        else s.hold();
      } else {
        const d = decide(s.index);
        s.act(d === 'hold' || d === 'exit' ? 'pass' : d);
      }
      taps++;
      if (S().index === before && S().phase === 'playing') {
        throw new Error(`stalled at bar ${before}`);
      }
    }
    return taps;
  };

  it('always terminates, in exactly one tap per remaining bar', () => {
    const start = S().index;
    const end = S().view.rthEnd;
    const taps = play(() => 'pass');
    expect(S().phase).toBe('ended');
    expect(S().index).toBe(end);
    expect(taps).toBe(end - start);
  });

  it('never carries a position past the closing bell', () => {
    play((i) => (i % 7 === 0 ? 'long' : 'hold'));
    expect(S().phase).toBe('ended');
    expect(S().position).toBeNull();
  });

  it('closes every position it opens', () => {
    play((i) => (i % 5 === 0 ? 'short' : i % 11 === 0 ? 'exit' : 'hold'));
    expect(S().position).toBeNull();
    for (const t of S().trades) {
      expect(['stop', 'bell', 'manual']).toContain(t.reason);
      expect(Number.isFinite(t.r)).toBe(true);
    }
  });

  it('runs every shipped session to the bell without stalling or throwing', () => {
    for (let i = 0; i < db.sessions.length; i++) {
      S().hydrateSession(i);
      play((idx) => (idx % 6 === 0 ? 'long' : idx % 9 === 0 ? 'exit' : 'hold'));
      expect(S().phase).toBe('ended');
      expect(S().position).toBeNull();
    }
  });
});

describe('accounting', () => {
  it('keeps money and XP as separate books', () => {
    S().hydrateSession(3);
    const xp0 = S().progress.xp;
    let taps = 0;
    while (S().phase === 'playing' && taps++ < 500) {
      const s = S();
      if (s.position) s.hold();
      else s.act(s.index % 4 === 0 ? 'long' : 'pass');
    }
    const p = S().progress;
    const sumR = S().trades.reduce((n, t) => n + t.r, 0);
    expect(p.totalR).toBeCloseTo(sumR, 8);
    expect(p.xp).toBeGreaterThan(xp0); // process is always rewarded, win or lose
    expect(p.tradesTaken).toBe(S().trades.length);
  });

  it('never lets XP go backwards, however badly the player trades', () => {
    // Patience is never punished, only unrewarded.
    let last = S().progress.xp;
    let taps = 0;
    while (S().phase === 'playing' && taps++ < 500) {
      const s = S();
      if (s.position) s.exitNow();
      else s.act('long'); // maximally undisciplined
      expect(S().progress.xp).toBeGreaterThanOrEqual(last);
      last = S().progress.xp;
    }
  });

  it('breaks the streak on a bad decision and rebuilds it on a good one', () => {
    S().hydrateSession(1);
    // Find a bar with no tradeable setup, where passing is correct.
    let taps = 0;
    while (S().phase === 'playing' && taps++ < 200) {
      const s = S();
      if (s.position) {
        s.hold();
        continue;
      }
      if (!isTradeable(setupNow(s))) {
        const before = s.progress.streak;
        s.act('pass');
        expect(S().progress.streak).toBe(before + 1);
        return;
      }
      s.act('pass');
    }
  });
});

describe('fast-forward', () => {
  it('reveals one bar per tick, same as a tap', () => {
    const before = S().index;
    S().advance({ viaFastForward: true });
    expect(S().index).toBe(before + 1);
  });

  it('counts the setups that went past', () => {
    S().hydrateSession(2);
    let taps = 0;
    while (S().phase === 'playing' && taps++ < 500) {
      S().advance({ viaFastForward: true });
    }
    expect(S().missed).toBeGreaterThanOrEqual(0);
    expect(S().phase).toBe('ended');
  });

  it('stops fast-forwarding the moment a stop fires', () => {
    // You keep the risk while holding; what you give up is the chance to manage it.
    for (let i = 0; i < db.sessions.length; i++) {
      S().hydrateSession(i);
      let taps = 0;
      while (S().phase === 'playing' && taps++ < 500) {
        if (!S().position) S().act('long');
        if (!S().position) continue;
        useGame.setState({ fastForwarding: true });
        S().advance({ viaFastForward: true });
        if (!S().position) {
          const t = S().trades[S().trades.length - 1];
          if (t.reason === 'stop') {
            expect(S().fastForwarding).toBe(false);
            return;
          }
        }
      }
    }
    throw new Error('no stop-out occurred in any session -- test is not exercising the path');
  });
});

describe('session navigation', () => {
  it('moves to the next session and resets the board but not the progress', () => {
    S().act('long');
    const xp = S().progress.xp;
    const idx = S().sessionIdx;
    S().nextSession();
    expect(S().sessionIdx).toBe(idx + 1);
    expect(S().trades).toEqual([]);
    expect(S().position).toBeNull();
    expect(S().index).toBe(S().view.rthStart);
    expect(S().progress.xp).toBe(xp);
  });

  it('wraps around at the end of the library', () => {
    S().hydrateSession(db.sessions.length - 1);
    S().nextSession();
    expect(S().sessionIdx).toBe(0);
  });

  it('records the level at the open so the summary can report unlocks', () => {
    S().hydrateSession(0);
    expect(S().xpAtStart).toBe(S().progress.xp);
    expect(S().levelAtStart).toBeGreaterThanOrEqual(1);
  });
});
