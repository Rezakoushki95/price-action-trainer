---
name: market-data-integrity
description: Use when fetching, baking or validating OHLC market data — futures, equities, crypto. Covers contract rolls, tick grids, session slicing and independent verification. Bad market data teaches nonsense very convincingly.
---

# Market Data Integrity

Bad price data does not crash. It renders beautifully and teaches the wrong thing. Assert
everything.

## Contract rolls are the silent killer

Continuous futures symbols (`ES=F`) are stitched from quarterly contracts, and **different
series from the same provider roll on different dates.** Observed in June 2026: the intraday
series switched to ESU26 on the 15th while the daily series stayed on ESM26 until expiry on the
19th — four sessions sitting ~68 points apart between the two.

Consequence: a "yesterday's high" taken from the daily series would be a level from a **different
contract** — invisible on the chart, or worse, plausible and fictional.

**Rules:**
- Derive levels from the *same series* you draw. Same contract by construction.
- Use the other series only as a **witness** for detecting stitches, never as a price source.
- A real roll is a **sustained** offset shift held for days. A one-day spike is provider junk
  (Yahoo emits daily closes off the tick grid, e.g. `7508.43` on a 0.25-tick instrument).
- Detect the *start* of an anomalous run and drop that one session — the end of the run is just
  the other series catching up and costs nothing.

## Assertions worth having

- **OHLC coherence**: `h >= max(o,c)`, `l <= min(o,c)`, `h >= l`
- **Tick grid**: every price is an exact multiple of the instrument's tick
- **Contiguity**: consecutive bars are exactly one interval apart, no gaps
- **Session length**: read it from the data, never hardcode. 78 bars is a normal RTH day on
  5-minute bars; a half day is 42. Hardcoding silently corrupts every holiday.
- **Plausibility**: a derived level must sit in the same price neighbourhood as the bars it will
  be drawn over. This is the last net that catches a surviving stitch.

Fail the build loudly. Never ship a bar you have not checked.

## Indicators need warm-up data

A 20-bar EMA needs 20 bars. At the opening bell there is **one**. Without prior-session bars the
indicator is undefined through the most important stretch of the day. Fetch and keep seed bars
(here: 80 overnight Globex bars per session) — and assert they are present.

## Rolling windows: snapshot and merge

Free intraday endpoints serve a rolling window (Yahoo: 60 days of 5-minute bars). Do not treat
that as the limit. **Bake to disk and merge on every run** — re-run monthly and the library grows
forever at no cost. Merging also means a provider outage costs new data, not existing data.

## Fetch at build time, not run time

Hitting an undocumented endpoint from the shipped app makes the app fail when the endpoint does.
Bake the data in: zero network dependency, works offline, no key in the client, and a broken
endpoint only stops *new* collection.
