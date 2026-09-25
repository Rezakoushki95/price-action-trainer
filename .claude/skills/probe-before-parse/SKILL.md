---
name: probe-before-parse
description: Use before writing code against any external API, undocumented endpoint, or file format whose shape you are assuming. Dump the real structure first with a throwaway script, then write the parser against what is actually there.
---

# Probe Before You Parse

## The rule

Never write a parser from memory or from documentation. Fetch one real response, print its
actual shape, and read it. It costs one script and saves silent corruption.

## What probing caught here

Writing the Yahoo Finance loader "from what I know" would have shipped three bugs:

1. **`tradingPeriods` is an object `{pre, post, regular}`, not an array.** The plan said array.
   Every guide implies array. It is an object of arrays-of-arrays.
2. **`Intl.DateTimeFormat` with `hour12: false` renders midnight as `24:00`, not `00:00`.**
   Every overnight slice compares times as strings, so this silently corrupts sessions.
   `hourCycle: 'h23'` is what actually yields `00:00`.
3. **3,470 of 17,279 bars had null closes** — the grid is padded with untraded slots. Trusting
   the array length would have produced phantom bars.

None of these throw. All of them produce plausible, wrong output.

## The probe script

Throwaway, into the scratchpad, never committed. Print:

- top-level keys, and the **type** of anything you assumed was an array
  (`Array.isArray(x) ? 'array' : typeof x`)
- counts, and counts of nulls per field
- first and last elements, decoded into human units (timestamps → local dates)
- the distribution of anything you will threshold on

```js
console.log('typeof:', Array.isArray(tp) ? 'array' : typeof tp, '| length:', tp?.length);
console.log('nulls in close:', q.close.filter((c) => c == null).length);
console.log('first ts:', et(ts[0]), '| last:', et(ts.at(-1)));
```

## Then: verify independently

The pipeline's own assertions share the pipeline's assumptions. Write a **separate** script that
recomputes the outputs from raw inputs and compares. Here that caught `yMid` being rounded to 2dp
when the true midpoint lands on `.125` — the build's own checks never compared `yMid` at all,
because the same mind wrote both.

If a check and the code it checks were written from the same assumption, it is not a check.

## Do not fix what you have not diagnosed

When output looks wrong, print the distribution before changing a threshold. Here a "contract
roll detector" fired on 7 dates; the instinct was to loosen the threshold. Printing the actual
offset series showed the real signature was a **sustained level shift**, not a point jump — one
genuine roll plus one junk outlier. Guessing would have thrown away 6 good sessions.
