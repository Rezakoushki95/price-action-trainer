# Al Brooks Trainer

A mobile trading *trainer* that teaches Al Brooks price action, simplified, using the
short-video reinforcement loop. Not a backtester and not a charting app: a game whose unit of
play is **one real trading day of ES futures, revealed one bar at a time**.

## The idea

Bar-by-bar replay is *already* a variable-ratio reward schedule — the same mechanism that makes
short-video feeds compulsive. The job was never to bolt gamification onto a chart; it was to
avoid smothering the loop that already exists. Two consequences are treated as non-negotiable:

- **Bars animate in, they never snap in.** A bar that appears instantly is information. A bar
  whose wick extends and body fills over ~220ms is a slot reel.
- **Losses are as watchable as wins.** Near-miss rendering — *stopped by one tick, then it ran* —
  is more motivating than a clean loss, and it is the most important emotional lesson in Brooks'
  material.

## The loop

```
FLAT      bar closes ──► [ SELL ] [ NOTHING ] [ BUY ]
                              │
IN TRADE  each tap = next bar ──► [ HOLD ] [ EXIT ]
                              │
EXIT      stop hit · 16:00 bell · manual ──► score in R ──► back to FLAT
```

**One tap reveals one bar, always.** Whether you are flat and deciding or in a position and
sweating it, the heartbeat is identical. 78 taps and the day is over.

**Press and hold to fast-forward.** Setups go past while you hold and nothing pauses for them;
the summary tells you how many you blew through. A stop still fires and halts the stream — you
keep the risk, you lose the chance to have managed it. Impatience is the mechanic, not a bug.

| | |
|---|---|
| Instrument | ES=F — real E-mini S&P 500, CME |
| Timeframe | 5-minute bars |
| Session | Full regular session, 09:30–16:00 ET = 78 bars |
| Entry | Filled at the close of the bar you decided on |
| Stop | One tick beyond the signal bar's extreme |
| Target | **None** — the magnets are the only thing telling you where to get out |
| Exit | Stop · 16:00 bell · you |
| Positions | Unlimited per session, one at a time |

No fixed target is the load-bearing decision. Without one, the daily-chart magnets stop being
decoration and become the thing the game is actually played on.

## Magnets

Only the 20-bar EMA is ever drawn as an indicator — Brooks puts it on every chart, so it is not
configurable. The horizontal levels unlock as you level up, which solves chart clutter and player
progression with one mechanism:

| Level | Unlocks |
|---|---|
| 1 | Yesterday's high, yesterday's low |
| 2 | Yesterday's close, today's open |
| 3 | Yesterday's midpoint |
| 4 | Overnight (Globex) high and low |

Every one is a **hard number read off bars the player could scroll back and see**, so scoring
against them cannot be argued with. Measured moves, breakout-point retests, wedge targets and
trend channel lines are all genuine Brooks magnets and all deliberately absent: they are
subjective, and a subjective level has no business in an auto-graded decision.

A magnet too far away to fit on screen is **pinned to the top or bottom edge with the distance to
it** rather than hidden or allowed to squash the bars — on a gap day the whole of yesterday can
sit above price, which is exactly when you need to know where it is.

The daily rail highlights the specific daily bar each level came from and runs those levels out
to its right edge in the same colour they are drawn on the chart below, so the learner sees where
a magnet *comes from*.

## Scoring

A textbook-correct Brooks trade loses roughly four times in ten, so grading purely on outcome
punishes good decisions and trains superstition. The app keeps two separate books:

- **Money in R**, honestly, including the losses.
- **XP on process** — did you take a real setup, did you pass a bad one — which drives levels.

**Passing earns XP.** Brooks' biggest practical lesson is that most bars are untradeable, and an
app that only rewards action trains the exact habit it exists to cure. You can lose money on a
session and still level up, and the summary says so out loud.

## Running it

Three ways, and only one of them needs Android Studio.

### In a browser — no toolchain at all

Skia ships a WebAssembly build (CanvasKit), so the whole app runs in a browser. Haptics are
no-ops; everything else is the real thing.

```bash
npm install
npm run web          # dev server
# or a production build:
npm run web:build && npm run web:serve   # -> http://localhost:3000
```

`scripts/serve-web.mjs` exists because two things bite here: `expo export` does not copy
`public/` into the build, and CanvasKit's `instantiateStreaming` refuses any MIME type other
than `application/wasm`. The script handles both.

If the chart area is blank in a headless browser, the cause is almost always a missing GL
surface rather than the app. Chrome needs software WebGL:

```bash
chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=500,900 --screenshot=shot.png http://localhost:3000/
```

### On a phone — cloud build, no local SDK

```bash
npx eas build --profile development --platform android
```

Builds the dev client on Expo's servers; install the APK and get real haptics.

### On a phone — built locally

```bash
npx expo run:android   # needs Android Studio + a JDK
npx expo run:ios       # needs macOS
```

Skia and Reanimated ship native code, so **none of the device paths work in Expo Go** — that is
the only reason a dev build is involved at all.

```bash
npm test              # 142 unit + integration tests
npx tsc --noEmit      # typecheck
npm run data          # refresh market data
```


## Data

`scripts/fetch-sessions.mjs` pulls ES=F from Yahoo's v8 chart endpoint at **build time only** —
no API key, no proxy, and the shipped app has zero network dependency. It writes
`src/data/sessions.json` (39 sessions, ~0.33MB, bundled) plus
`data-meta/sessions.meta.json`, which is **never bundled**.

### Nothing shipped can identify the real trading day

A player who can work out which day they are replaying can look it up and see what happens next,
which makes the whole exercise pointless. And this is not theoretical — before the fix, `grep`
on the release Android bundle returned `2026-07-20`, `ES=F` and `prevDate` in plain text. No
decompiler needed; pulling your own APK takes seconds.

So the shipped file contains **no dates, no symbol, no build provenance and no absolute prices**:

- every price is **points from that session's open**, so the opening bar is always `0`
- every timestamp is **seconds from the opening bell**, negative overnight
- each session carries its own daily rail, so sessions cannot be chained together
- dates and the price anchors live in `data-meta/`, outside `src/`, where no bundler reaches them
- the **play order is shuffled** from a seed stored per player, so chronological order cannot
  give a recognised session away either

Shuffling is safe precisely because a session is self-contained: it carries its own daily rail
and its own magnets, so position in the array is not part of its meaning. Reordering cannot move
yesterday's high. `src/state/__tests__/playOrder.test.ts` proves that across seven seeds and every
session rather than assuming it.

Sessions with fewer than ten days of daily history behind them are dropped: a two-bar context rail
looks broken, and the rail is the feature the app is built around.

Normalising costs nothing: distances, R multiples, the EMA and the magnets are all relative
anyway. It arguably teaches better, since Brooks is about structure rather than price level.

The build fails if any of it leaks, and `src/core/__tests__/data.test.ts` re-checks the shipped
file on every test run.


Three things it handles that are easy to get wrong:

- **Overnight bars are mandatory.** A 20-bar EMA needs 20 bars; at 09:30 there is exactly one.
  Without Globex data the only indicator in the app is undefined through the whole first hour.
  80 seed bars are kept per session.
- **Contract rolls.** ES is a quarterly future and Yahoo's daily and intraday series *do not roll
  on the same date* — in June 2026 the intraday switched to ESU26 on the 15th while the daily
  stayed on ESM26 until expiry on the 19th, leaving four sessions ~68 points apart between the two
  series. Magnets are therefore derived from the intraday series only, and sessions that straddle
  a stitch are dropped.
- **The rolling window.** Yahoo only serves 60 days of 5-minute data, so the script **merges**
  into the existing file rather than overwriting it. Re-run it monthly and the library grows by
  ~21 sessions a month, indefinitely, at no cost.

The build fails loudly on any integrity problem rather than shipping bad bars.

## Layout

```
scripts/fetch-sessions.mjs   build-time data pipeline
src/
  core/      pure TypeScript — no React, no Skia, no RN. Unit-tested in isolation.
    ema · magnets · barAnatomy · setups · trade · scoring · session
  render/    Skia canvases and chart geometry
    ChartCanvas · DailyRail · geometry · theme · useReveal
  state/     zustand store — the game loop
  ui/        HUD, action zone, feedback, session summary
  data/      baked sessions.json
```

`core/` imports nothing platform-specific, which is why the game rules can be tested without a
simulator and why a change of rendering platform would not touch them.

## Known limitations

- **Not yet run on a physical phone.** It has been rendered and screenshotted in a browser via
  CanvasKit — chart, daily rail, EMA, magnets, in-trade state and the session summary all verified
  visually — and it bundles for Android. What remains unverified is anything device-specific:
  haptics, real touch latency, and the sub-300ms feedback budget.
- **The reveal animation runs on the JS thread** via `requestAnimationFrame`, not on the UI thread
  via Reanimated worklets. Only the newest bar is rebuilt per frame so it should hold up, but if
  it stutters on a real device this is the first thing to move.
- **The setup detector is a stated simplification.** Brooks counts pullback legs by eye using
  swing structure a human reads in context; `core/setups.ts` uses the 20-bar EMA as a trend filter
  and resets the count when price closes through it. That is why it drives XP but never decides
  whether the player was *right* — the money score comes from what price actually did.
