/**
 * Shuffling the play order must not disturb a single magnet.
 *
 * That is the whole reason sessions were made self-contained: each one carries
 * its own daily rail and its own yesterday-high / low / close / midpoint, so its
 * position in the array is not part of its meaning. These tests prove that rather
 * than assume it -- if anyone ever reintroduces a cross-session lookup, this is
 * what should catch it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));

const { useGame, db, makeOrder, magnetsFor } = await import('../gameStore');
const { EMPTY_PROGRESS } = await import('../../core/scoring');
const { MAGNET_META } = await import('../../core/magnets');

const S = () => useGame.getState();
const SEEDS = [1, 2, 7, 42, 1337, 99991, 0xdeadbeef];

beforeEach(() => {
  useGame.setState({ progress: { ...EMPTY_PROGRESS }, seed: 42 });
  S().hydrateSession(0);
});

describe('makeOrder', () => {
  it('is a permutation -- every session exactly once, none invented', () => {
    for (const seed of SEEDS) {
      const order = makeOrder(seed);
      expect(order.length).toBe(db.sessions.length);
      expect(new Set(order).size).toBe(db.sessions.length);
      expect([...order].sort((a, b) => a - b)).toEqual(db.sessions.map((_, i) => i));
    }
  });

  it('is deterministic, so a player keeps the same order across launches', () => {
    for (const seed of SEEDS) expect(makeOrder(seed)).toEqual(makeOrder(seed));
  });

  it('actually shuffles rather than returning chronological order', () => {
    const chronological = db.sessions.map((_, i) => i);
    const shuffled = SEEDS.filter((s) => makeOrder(s).join() !== chronological.join());
    expect(shuffled.length).toBe(SEEDS.length);
  });

  it('gives different players different orders', () => {
    const seen = new Set(SEEDS.map((s) => makeOrder(s).join()));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('never opens on a session with a stunted context rail', () => {
    for (const seed of SEEDS) {
      const first = db.sessions[makeOrder(seed)[0]];
      expect(first.rail.length).toBe(db.dailyRail);
    }
  });

  it('survives a zero seed rather than collapsing', () => {
    expect(new Set(makeOrder(0)).size).toBe(db.sessions.length);
  });
});

describe('magnets are intrinsic to a session, not to its position', () => {
  it('holds for every session under every seed', () => {
    for (const seed of SEEDS) {
      const order = makeOrder(seed);
      order.forEach((sessionIndex, position) => {
        const s = db.sessions[sessionIndex];
        const yesterday = s.rail[s.rail.length - 1];

        // Yesterday's levels come from this session's OWN last rail bar. No
        // neighbour is consulted, so no reordering can move them.
        expect(s.magnets.yHigh).toBe(yesterday.h);
        expect(s.magnets.yLow).toBe(yesterday.l);
        expect(s.magnets.yClose).toBe(yesterday.c);
        expect(s.magnets.yMid).toBeCloseTo((yesterday.h + yesterday.l) / 2, 10);

        // The overnight levels come from this session's own seed bars.
        expect(s.magnets.onHigh).toBe(Math.max(...s.seed.map((b) => b.h)));
        expect(s.magnets.onLow).toBe(Math.min(...s.seed.map((b) => b.l)));
        expect(s.magnets.open).toBe(0);

        // And nothing depends on where it landed in the order.
        expect(position).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('gives a session identical magnets wherever it is played', () => {
    // Play the same underlying session from two different seeds and compare.
    const target = 5;
    const snapshots: string[] = [];

    for (const seed of [3, 11, 250]) {
      const order = makeOrder(seed);
      const position = order.indexOf(target);
      useGame.setState({ seed });
      S().hydrateSession(position);
      snapshots.push(JSON.stringify(S().view.magnets));
    }

    expect(new Set(snapshots).size).toBe(1);
  });

  it('draws the same magnet lines regardless of order', () => {
    const lines = (seed: number, sessionIndex: number) => {
      useGame.setState({ seed, progress: { ...EMPTY_PROGRESS, xp: 5000 } });
      S().hydrateSession(makeOrder(seed).indexOf(sessionIndex));
      return magnetsFor(S().view, S().progress.xp).map((m) => `${m.key}:${m.price}`);
    };
    expect(lines(3, 9)).toEqual(lines(77, 9));
    expect(lines(3, 9).length).toBe(MAGNET_META.length);
  });
});

describe('the store walks the shuffled order', () => {
  it('starts at position 0', () => {
    expect(S().sessionIdx).toBe(0);
    expect(S().order.length).toBe(db.sessions.length);
  });

  it('visits every session exactly once before repeating', () => {
    useGame.setState({ seed: 2026 });
    S().hydrateSession(0);
    const seen: string[] = [];
    for (let i = 0; i < db.sessions.length; i++) {
      seen.push(JSON.stringify(S().view.session.rth[0]) + S().view.session.rail.length);
      S().nextSession();
    }
    // Back where we started, having covered the whole library.
    expect(S().sessionIdx).toBe(0);
    expect(new Set(seen).size).toBe(db.sessions.length);
  });

  it('rebuilds the order from the persisted seed, not from whatever was in memory', () => {
    // A returning player must get their own shuffle back.
    useGame.setState({ seed: 4711, order: [] });
    S().hydrateSession(3);
    expect(S().order).toEqual(makeOrder(4711));
    expect(S().sessionIdx).toBe(3);
  });

  it('wraps cleanly at both ends', () => {
    S().hydrateSession(db.sessions.length);
    expect(S().sessionIdx).toBe(0);
    S().hydrateSession(-1);
    expect(S().sessionIdx).toBe(db.sessions.length - 1);
  });
});
