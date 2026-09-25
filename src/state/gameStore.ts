/**
 * The game loop, as a store.
 *
 * One rule governs the whole thing: ONE TAP REVEALS ONE BAR. Whether the player
 * is flat and deciding, or in a position and sweating it, the heartbeat is
 * identical. Nothing in here may ever reveal two bars for one tap, or none.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import rawDb from '../data/sessions.json';
import { buildSessionView, type SessionView } from '../core/session';
import { countPullbacks, isTradeable, setupAt, type SetupSignal } from '../core/setups';
import { rewardToRisk, visibleMagnets, type MagnetLine } from '../core/magnets';
import { closeManually, openPosition, stepPosition, type LivePosition } from '../core/trade';
import {
  EMPTY_PROGRESS,
  applyDecision,
  applyTrade,
  levelFromXp,
  scoreDecision,
  scoreExit,
  type Action,
  type DecisionScore,
  type Progress,
} from '../core/scoring';
import type { ClosedTrade, Direction, SessionDb } from '../core/types';

export const db = rawDb as unknown as SessionDb;

export type Phase = 'playing' | 'ended' | 'summary';

export interface Feedback extends DecisionScore {
  id: number;
  kind: 'decision' | 'exit';
  /** Set when this feedback came from a trade closing. */
  trade?: ClosedTrade;
}

interface Persisted {
  progress: Progress;
  /** Position in the play order, not an index into the session array. */
  sessionIdx: number;
  /** Seeds this player's shuffle. Persisted so their order never changes. */
  seed: number;
}

interface GameState extends Persisted {
  /** Session indices in the order this player plays them. Derived from `seed`. */
  order: number[];

  // --- derived per session, rebuilt on load ---
  view: SessionView;
  counts: { high: (number | null)[]; low: (number | null)[] };

  index: number;
  position: LivePosition | null;
  trades: ClosedTrade[];
  phase: Phase;
  feedback: Feedback | null;
  /** Setups that went past while the player held fast-forward. */
  missed: number;
  fastForwarding: boolean;
  /** Snapshot at the open, so the summary can report what the session earned. */
  xpAtStart: number;
  levelAtStart: number;

  // --- actions ---
  act: (action: Action) => void;
  hold: () => void;
  exitNow: () => void;
  advance: (opts?: { viaFastForward?: boolean }) => void;
  setFastForward: (on: boolean) => void;
  showSummary: () => void;
  nextSession: () => void;
  replaySession: () => void;
  hydrateSession: (idx: number) => void;
}

let feedbackId = 0;

/** `pos` is a position in the play order, not an index into the raw array. */
function makeView(order: number[], pos: number) {
  const n = order.length;
  const session = db.sessions[order[((pos % n) + n) % n]];
  const view = buildSessionView(session, db.tickSize);
  return { view, counts: countPullbacks(view.bars, view.ema) };
}

/** Magnets the player has earned the right to see. */
export function magnetsFor(view: SessionView, xp: number): MagnetLine[] {
  return visibleMagnets(view.magnets, levelFromXp(xp));
}

/**
 * The setup on the bar currently under the playhead, including how much room
 * there is to the next magnet in each direction. Recomputed rather than stored,
 * because it depends on the player's level via which magnets are visible.
 */
export function setupNow(state: {
  view: SessionView;
  counts: GameState['counts'];
  index: number;
  progress: Progress;
}): SetupSignal {
  const { view, counts, index } = state;
  if (index < view.rthStart || index > view.rthEnd) {
    return { kind: null, dir: null, quality: 0, reasons: [] };
  }
  const lines = magnetsFor(view, state.progress.xp);
  const price = view.bars[index].c;
  const longRisk = openPosition(view.bars, index, 'long', db.tickSize).risk;
  const shortRisk = openPosition(view.bars, index, 'short', db.tickSize).risk;

  return setupAt(
    {
      bars: view.bars,
      ema: view.ema,
      counts,
      rewardToRisk: {
        long: rewardToRisk(lines, price, longRisk, 'long')?.rr ?? null,
        short: rewardToRisk(lines, price, shortRisk, 'short')?.rr ?? null,
      },
    },
    index
  );
}

/**
 * The order sessions are played in.
 *
 * Chronological order is a (weak) leak: once a player recognises one session they
 * know its neighbours are the days either side of it. Shuffling removes that, and
 * costs nothing, because a session carries its own daily rail and its own magnets
 * -- position in the array is not part of its meaning. Reordering CANNOT move
 * yesterday's high, or any other magnet. The tests prove it rather than assume it.
 *
 * The shuffle is seeded and the seed is persisted, so a player keeps the same
 * order across launches and "session 12" stays session 12 for them.
 */
export function makeOrder(seed: number): number[] {
  const n = db.sessions.length;
  const order = Array.from({ length: n }, (_, i) => i);

  // xorshift32: tiny, deterministic, and good enough to shuffle a few dozen items.
  let x = seed >>> 0 || 1;
  const rnd = () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x100000000;
  };

  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  // The first session a player ever sees should have a full context rail -- the
  // earliest days we hold have short ones, and a one-bar rail is a poor
  // introduction to the feature the app is built around.
  const full = order.findIndex((i) => db.sessions[i].rail.length >= db.dailyRail);
  if (full > 0) [order[0], order[full]] = [order[full], order[0]];

  return order;
}

/** A seed for a player who does not have one yet. */
const freshSeed = () => Math.floor(Math.random() * 0x100000000) >>> 0 || 1;

const INITIAL_SEED = freshSeed();
const initial = makeView(makeOrder(INITIAL_SEED), 0);

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      progress: EMPTY_PROGRESS,
      sessionIdx: 0,
      seed: INITIAL_SEED,
      order: makeOrder(INITIAL_SEED),
      view: initial.view,
      counts: initial.counts,
      index: initial.view.rthStart,
      position: null,
      trades: [],
      phase: 'playing',
      feedback: null,
      missed: 0,
      fastForwarding: false,
      xpAtStart: 0,
      levelAtStart: 1,

      hydrateSession: (pos) => {
        // Rebuilt from the seed every time rather than trusted from state, so a
        // rehydrated player gets their own order back and not the default one.
        const seed = get().seed || freshSeed();
        const order = makeOrder(seed);
        const n = order.length;
        const at = ((pos % n) + n) % n;
        const { view, counts } = makeView(order, at);
        const xp = get().progress.xp;
        set({
          seed,
          order,
          sessionIdx: at,
          view,
          counts,
          index: view.rthStart,
          position: null,
          trades: [],
          phase: 'playing',
          feedback: null,
          missed: 0,
          fastForwarding: false,
          xpAtStart: xp,
          levelAtStart: levelFromXp(xp),
        });
      },

      /** Decide at the current bar's close, then reveal the next bar. */
      act: (action) => {
        const s = get();
        if (s.phase !== 'playing' || s.position) return;

        const setup = setupNow(s);
        const score = scoreDecision(action, setup, s.trades.length);
        const progress = applyDecision(s.progress, score);

        // On the closing bar there is no bar left to trade against, so an entry
        // would settle flat at its own price. Only a pass makes sense there.
        const canEnter = action !== 'pass' && s.index < s.view.rthEnd;
        const position = canEnter
          ? openPosition(s.view.bars, s.index, action as Direction, db.tickSize)
          : null;

        set({
          progress,
          position,
          feedback: { ...score, id: ++feedbackId, kind: 'decision' },
        });
        get().advance();
      },

      hold: () => {
        const s = get();
        if (s.phase !== 'playing' || !s.position) return;
        get().advance();
      },

      exitNow: () => {
        const s = get();
        if (s.phase !== 'playing' || !s.position) return;

        const trade = closeManually(s.position, s.index, s.view.bars[s.index]);
        const score = scoreExit(trade);
        set({
          position: null,
          trades: [...s.trades, trade],
          progress: applyTrade(applyDecision(s.progress, score), trade),
          feedback: { ...score, id: ++feedbackId, kind: 'exit', trade },
        });
        get().advance();
      },

      /**
       * Reveal exactly one bar.
       *
       * A position is carried through the new bar BEFORE the playhead moves on,
       * so a stop is honoured on the bar that hit it -- including during
       * fast-forward, which is the whole cost of fast-forwarding.
       */
      advance: (opts) => {
        const s = get();
        if (s.phase !== 'playing' || s.index >= s.view.rthEnd) {
          if (s.index >= s.view.rthEnd && s.phase === 'playing') {
            set({ phase: 'ended', fastForwarding: false });
          }
          return;
        }

        const next = s.index + 1;
        const isFinal = next >= s.view.rthEnd;
        const patch: Partial<GameState> = { index: next };

        if (s.position) {
          const res = stepPosition(s.position, s.view.bars[next], next, isFinal);
          if (res.status === 'closed') {
            const score = scoreExit(res.trade);
            patch.position = null;
            patch.trades = [...s.trades, res.trade];
            patch.progress = applyTrade(applyDecision(s.progress, score), res.trade);
            patch.feedback = { ...score, id: ++feedbackId, kind: 'exit', trade: res.trade };
            // A stop firing halts fast-forward. You keep the risk; you lose the
            // chance to have managed it.
            patch.fastForwarding = false;
          } else {
            patch.position = res.position;
          }
        } else if (opts?.viaFastForward) {
          // Nothing was decided on this bar. If a real setup was sitting there,
          // it is gone, and the summary will say so.
          const passed = setupNow({ ...s, index: next });
          if (isTradeable(passed)) patch.missed = s.missed + 1;
        }

        if (isFinal) {
          patch.phase = 'ended';
          patch.fastForwarding = false;
        }
        set(patch);
      },

      setFastForward: (on) => {
        if (get().phase !== 'playing') return;
        set({ fastForwarding: on });
      },

      showSummary: () => {
        const s = get();
        set({
          phase: 'summary',
          fastForwarding: false,
          progress: { ...s.progress, sessionsPlayed: s.progress.sessionsPlayed + 1 },
        });
      },

      nextSession: () => get().hydrateSession(get().sessionIdx + 1),
      replaySession: () => get().hydrateSession(get().sessionIdx),
    }),
    {
      name: 'price-action-trainer',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the player's progress survives a restart; the session in flight does not.
      partialize: (s): Persisted => ({
        progress: s.progress,
        sessionIdx: s.sessionIdx,
        seed: s.seed,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrateSession(state.sessionIdx);
      },
    }
  )
);
