---
name: brooks-trainer
description: Use when working on this Al Brooks trading trainer app — adding setups, magnets, screens, scoring or sessions. Holds the design invariants that must not be broken and the Brooks domain model the app teaches.
---

# Al Brooks Trainer — Design Invariants

A trainer that teaches Brooks price action using the short-video reinforcement loop. One real ES
trading day, revealed one bar at a time.

## Invariants — breaking these breaks the product

1. **ONE TAP REVEALS ONE BAR.** Flat or in a position, the heartbeat is identical. Nothing may
   ever reveal two bars for one tap, or none. Enforced by tests in
   `src/state/__tests__/gameStore.test.ts`.
2. **Bars animate in, never snap in.** An instant bar is information; a bar that draws itself over
   ~220ms is a slot reel. This is most of the feel of the app, not decoration.
3. **One indicator only: the 20-bar EMA.** Brooks puts it on every chart. Not configurable.
4. **No profit target.** Exits are stop, bell, or the player. Without a target the magnets become
   the actual decision tool — this is what makes daily context load-bearing instead of decorative.
5. **Passing earns XP.** Most bars are untradeable. An app that only rewards action trains
   overtrading, the exact habit it exists to cure. Discipline is never _punished_, only
   unrewarded — XP must never go backwards.
6. **Money and process are separate books.** R is honest, including losses. XP is process and
   drives levels. A player can lose and still level up, and the summary says so out loud.
7. **Never auto-pause on a setup.** Spotting them is the skill being trained. Fast-forward lets
   them pass; the summary reports what was missed.

## Magnets

Only levels that are **hard numbers read off bars the player could scroll back and see**:
yesterday's high / low / close / midpoint, today's open, overnight high / low. They unlock by
level, which solves chart clutter and progression with one mechanism.

**Deliberately excluded from scoring**: measured moves, breakout-point retests, wedge targets,
trend channel lines. All genuine Brooks magnets, all subjective — they belong in explanation copy,
never in an auto-graded decision.

A magnet off screen is **pinned to the edge with its distance**, never hidden and never allowed to
squash the bars. On a gap day the whole of yesterday sits above price — exactly when you need it.

## Domain model

- **Three market states**, cycling: breakout → channel → trading range
- **Always-in direction**: if you had to hold something right now, which way
- **H1/H2/L1/L2**: pullback counting. Brooks prefers the _second_ entry — the market tries
  everything twice, and the first attempt usually fails
- **Signal bar quality**: body/range ratio, where it closed in its own range, tails
- **Trader's equation**: `P(win) × reward > P(loss) × risk`. Shown live as R-to-next-magnet on
  the entry buttons, before the player commits
- **A good trade loses ~40% of the time.** Say it in the UI. Grading yourself on one day's
  outcome teaches superstition.

## Stated simplification

`core/setups.ts` uses the 20-EMA as a trend filter and resets pullback counts when price closes
through it. Brooks counts legs by eye using swing structure a human reads in context. This is a
defensible mechanical proxy, **not** a faithful reproduction — which is why it drives XP but never
decides whether the player was _right_. The money score comes from what price actually did.

If you make the detector stricter or looser, check the density test: it should fire on roughly
5–15% of bars (currently 10.7%, about 8 per session). Much more and it trains overtrading; much
less and there is no game.

## Where things are

```
scripts/fetch-sessions.mjs  build-time data pipeline (see: market-data-integrity)
src/core/                   pure TS, no React/Skia/RN — testable in isolation, port-proof
src/render/                 Skia canvases + chart geometry
src/state/gameStore.ts      the loop
src/ui/                     HUD, action zone, feedback, summary
```

Keep `core/` free of platform imports. It is why the rules can be tested without a simulator.

## Before saying a change works

Run the tests, then **look at it** — see the `verify-ui-renders` skill. A blank chart passes every
test in this repo.
