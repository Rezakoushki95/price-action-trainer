---
name: verify-ui-renders
description: Use before claiming any UI works, and after any change to a screen, component, layout or canvas. Renders the app in a headless browser and looks at the pixels. Passing tests and a clean typecheck do NOT mean the screen is not blank.
---

# Prove the UI Actually Renders

## Why this exists

In this project 142 tests passed, `tsc --noEmit` was clean, and Metro bundled 1,237 modules —
while the chart and the daily rail were **completely blank**. Every automated signal was green
and the main feature of the app was invisible.

The bug: `onLayout` reports `0×0` on the first paint, and both canvases were guarded behind
`chart.w > 0 && chart.h > 0`. No unit test can see that. Only pixels can.

**Never report a UI as working on the strength of tests alone. Look at it.**

## The loop

```bash
npm run web:build      # expo export --platform web
npm run web:serve      # copies canvaskit.wasm in, serves it as application/wasm
```

Then screenshot and **Read the PNG** — actually look at the image, do not just check the file
exists:

```bash
chrome --headless=new --no-sandbox --hide-scrollbars \
  --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
  --window-size=500,900 --virtual-time-budget=30000 \
  --screenshot=shot.png http://localhost:3000/
```

Chrome lives at `/c/Program Files/Google/Chrome/Application/chrome.exe` (Edge also works).

## Traps that cost time here

| Symptom | Cause |
|---|---|
| Canvas blank, text around it fine | `--disable-gpu` starves CanvasKit of a GL surface. Use the swiftshader flags above. |
| Content cut off at the right | Windows clamps headless windows to ~496px wide. The page laid out at 496 and the capture cropped at 390 — not a layout bug. Screenshot at 500+. |
| Blank white page | `expo export` does not copy `public/` into the build, so `canvaskit.wasm` is missing. |
| WASM fails to instantiate | `instantiateStreaming` rejects any MIME type but `application/wasm`. |
| Everything renders but one region | Something is guarded behind an async measurement. Suspect `onLayout`. |

## When the picture is wrong, instrument — do not guess

Add a temporary absolutely-positioned `<Text>` dumping the numbers you suspect (measured sizes,
array lengths, index, computed values), screenshot, read it, then remove it. One debug line
answered in seconds what three rounds of theorising had not:

```
DBG chart 0x0  rail 0  bars 158  idx 80  ema 7553.9  mags 2  railbars 1
```

That single line proved the data was perfect and the layout was the problem, and revealed a
second bug (`railbars 1`) nobody had asked about.

## Screenshotting states that need interaction

To capture a screen you can only reach by tapping, temporarily drive the store from the web
entry via a `?scene=` query param, screenshot, then **remove the driver**. Do not ship it.

## Geometry without a browser

For pure layout maths, render the real geometry module to ASCII in a test and print it. Cheap,
runs in CI, and it caught a ratchet that squashed the bars to 19.6% of the chart. Assert a
numeric property (`bars fill > 33% of the axis`) so the regression cannot come back silently.
