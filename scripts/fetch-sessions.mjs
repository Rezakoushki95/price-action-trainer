/**
 * Build-time data pipeline. Not shipped, not called at runtime.
 *
 *   node scripts/fetch-sessions.mjs
 *
 * Pulls ES=F from Yahoo's v8 chart endpoint, slices each regular session
 * (09:30-16:00 ET = 78 five-minute bars), keeps the overnight Globex bars that
 * precede it as an EMA seed, and writes src/data/sessions.json.
 *
 * CONTRACT ROLL
 * -------------
 * ES is a quarterly future. Yahoo's ES=F is a continuous front-month stitch, and
 * its DAILY and INTRADAY series do not roll on the same date -- observed June 2026:
 * intraday rolled to ESU26 on the 15th, daily stayed on ESM26 until expiry on the
 * 19th, leaving four sessions ~68 points apart between the two series.
 *
 * So magnets are derived from the INTRADAY series only: yesterday's high/low/close
 * come from yesterday's own 5-minute bars. Same contract as today's chart by
 * construction, and every level is one the player could scroll back and see.
 *
 * Yahoo's daily series is still fetched, but purely as an independent witness for
 * detecting roll boundaries -- never as a source of price levels.
 *
 * The 60-day intraday window is a ROLLING one, so this script MERGES into any
 * existing sessions.json rather than overwriting it. Re-run monthly and the
 * library accumulates indefinitely.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/sessions.json');
// Identifying data lives OUTSIDE src/, so no bundler can reach it.
const META = resolve(__dirname, '../data-meta/sessions.meta.json');

const SYMBOL = 'ES=F';
const TICK = 0.25;
const RTH_START = '09:30';
const RTH_END = '16:00'; // exclusive; the last bar opens 15:55
const RTH_BARS = 78;
const SEED_BARS = 80; // overnight bars kept to warm up the 20-EMA
const DAILY_RAIL = 30; // daily bars shown in the context rail
// The oldest days in the window have almost no daily history behind them, and a
// context rail of one or two bars looks broken -- it is the feature the app is
// built around. Ten days is still real context, and costs a handful of sessions.
const MIN_RAIL = 10;
const ROLL_JUMP = 10; // pts: shift in (rthClose - yahooDailyClose) that means a roll

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

/**
 * Yahoo renders midnight as "24:00" under hour12:false, which silently breaks
 * lexical time comparison. hourCycle:'h23' is what actually yields "00:00".
 */
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** unix seconds -> { date: 'YYYY-MM-DD', time: 'HH:MM' } in New York time. */
function et(ts) {
  const p = Object.fromEntries(
    fmt.formatToParts(new Date(ts * 1000)).map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const round = (n) => Math.round(n * 100) / 100;

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      const j = await r.json();
      if (j?.chart?.error) throw new Error(JSON.stringify(j.chart.error));
      if (!j?.chart?.result?.[0]) throw new Error('no chart.result in response');
      return j.chart.result[0];
    } catch (e) {
      if (attempt === 3) throw new Error(`${url}\n  ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

/** Flatten Yahoo's parallel arrays into bar objects, dropping null-padded slots. */
function toBars(result) {
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const { open: o, high: h, low: l, close: c, volume: v } = q;
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    if (o?.[i] == null || h?.[i] == null || l?.[i] == null || c?.[i] == null) continue;
    bars.push({
      t: ts[i],
      o: round(o[i]), h: round(h[i]), l: round(l[i]), c: round(c[i]),
      v: v?.[i] ?? 0,
    });
  }
  // Yahoo can repeat a timestamp across range boundaries; keep the last.
  const byTs = new Map(bars.map((b) => [b.t, b]));
  return [...byTs.values()].sort((a, b) => a.t - b.t);
}

const url = (qs) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMBOL)}?${qs}`;

// ---------------------------------------------------------------- fetch

console.log(`Fetching ${SYMBOL} ...`);

const [intraRes, dailyRes] = await Promise.all([
  get(url('range=60d&interval=5m&includePrePost=true')),
  get(url('range=2y&interval=1d')),
]);

const intraBars = toBars(intraRes);
const yahooDaily = toBars(dailyRes);
console.log(`  intraday: ${intraBars.length} bars (null slots dropped)`);
console.log(`  daily   : ${yahooDaily.length} bars (roll witness only)`);

// ---------------------------------------------------------------- slice ET days

const days = new Map();
for (const b of intraBars) {
  const { date, time } = et(b.t);
  if (!days.has(date)) days.set(date, []);
  days.get(date).push({ ...b, hm: time });
}
const dayKeys = [...days.keys()].sort();

const strip = (b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });

/** Per-date RTH slice + the overnight bars leading into it. */
const sliced = new Map();
const skipped = [];

for (let i = 0; i < dayKeys.length; i++) {
  const date = dayKeys[i];
  const bars = days.get(date);
  const rth = bars.filter((b) => b.hm >= RTH_START && b.hm < RTH_END);

  if (rth.length !== RTH_BARS) {
    // Sundays (Globex opens 18:00 ET, no RTH) and the current partial day land here.
    if (rth.length > 0) skipped.push({ date, reason: `${rth.length} RTH bars, need ${RTH_BARS}` });
    continue;
  }

  const prevDay = dayKeys[i - 1];
  const pre = [
    ...(prevDay ? days.get(prevDay).filter((b) => b.hm >= RTH_END) : []),
    ...bars.filter((b) => b.hm < RTH_START),
  ];

  sliced.set(date, {
    rth: rth.map(strip),
    seed: pre.slice(-SEED_BARS).map(strip),
    rthHigh: round(Math.max(...rth.map((b) => b.h))),
    rthLow: round(Math.min(...rth.map((b) => b.l))),
    rthOpen: rth[0].o,
    rthClose: rth.at(-1).c,
  });
}

const dates = [...sliced.keys()].sort();
console.log(`  ${dates.length} complete RTH sessions sliced`);

// ---------------------------------------------------------------- roll detection

// (our RTH close) - (Yahoo's daily close) is a small, stable number for as long as
// both series track the same contract. When either one rolls, that difference steps
// to a NEW SUSTAINED LEVEL and stays there.
//
// The sustained part matters. Yahoo's daily series also emits one-off junk (values
// off the 0.25 tick grid, e.g. 7508.43), which spikes the difference for a single
// day. Testing a point-to-point jump cannot tell a spike from a stitch and throws
// away good sessions; comparing the median of the three days either side can.
//
// Only the FIRST session after a stitch is actually compromised -- its "yesterday"
// bars belong to the outgoing contract. Everything after it is internally consistent.
const yDailyClose = new Map(yahooDaily.map((b) => [et(b.t).date, b.c]));
const diffs = dates.map((d) => {
  const yc = yDailyClose.get(d);
  return yc == null ? null : sliced.get(d).rthClose - yc;
});

const median = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};

// While both series agree the offset sits in a tight band around the baseline
// (RTH close vs settlement, a point or two). A roll pushes it out of that band and
// holds it there until the other series rolls too, giving a RUN of anomalous dates.
const baseline = median(diffs);
const anomalous = diffs.map((d) => d != null && Math.abs(d - baseline) > ROLL_JUMP);

const rollDates = new Set();
for (let i = 0; i < dates.length; i++) {
  if (!anomalous[i] || anomalous[i - 1]) continue; // only the first day of a run
  let end = i;
  while (anomalous[end + 1]) end++;
  const len = end - i + 1;

  if (len === 1) {
    // One isolated day. A real roll persists for days until the other series
    // follows; a lone outlier is Yahoo daily junk (it emits closes off the 0.25
    // tick grid). Harmless -- we take no price from that series.
    console.log(`  ignoring 1-day offset outlier at ${dates[i]} (${diffs[i].toFixed(2)} vs baseline ${baseline.toFixed(2)}) -- daily-series junk`);
    continue;
  }

  // Start of a sustained run: our intraday series rolled here, so this session's
  // previous day belongs to the outgoing contract. Only this one is compromised.
  rollDates.add(dates[i]);
  console.log(
    `  contract stitch at ${dates[i]}: offset held ${diffs[i].toFixed(2)} vs baseline ` +
    `${baseline.toFixed(2)} for ${len} sessions (through ${dates[end]})`
  );
}

// ---------------------------------------------------------------- daily rail

// Built from our own intraday bars so the rail, the magnets and the chart are all
// one series. Grows with each monthly run, same as the sessions.
const daily = dates.map((d) => {
  const s = sliced.get(d);
  return { d, o: s.rthOpen, h: s.rthHigh, l: s.rthLow, c: s.rthClose };
});

// ---------------------------------------------------------------- sessions
//
// NORMALISATION
// -------------
// Nothing that identifies the real trading day survives into the shipped file.
// Every price is stored as POINTS FROM THE SESSION OPEN, and every timestamp as
// SECONDS FROM THE OPENING BELL. Dates, the symbol and absolute price levels go
// to a separate metadata file that the app never imports.
//
// The reason is cheating, and it is not theoretical: with dates in the bundle a
// player pulls the APK, runs grep, reads the date, looks the day up and knows
// exactly what happens next. Absolute prices are almost as revealing -- ES at
// 7544 plus the shape of the daily rail narrows it to a handful of days for
// anyone who follows the market.
//
// Normalising costs nothing. Every relationship the game depends on -- distances,
// R multiples, the EMA, where the magnets sit -- is relative anyway.

const sessions = [];
const meta = [];

for (let i = 1; i < dates.length; i++) {
  const date = dates[i];
  const prev = dates[i - 1];
  const cur = sliced.get(date);
  const y = sliced.get(prev);

  if (rollDates.has(date)) {
    skipped.push({ date, reason: `contract roll -- ${prev} is a different contract` });
    continue;
  }
  if (cur.seed.length < 20) {
    skipped.push({ date, reason: `${cur.seed.length} seed bars, 20-EMA would be undefined` });
    continue;
  }

  const anchor = cur.rthOpen; // price origin
  const t0 = cur.rth[0].t; // time origin

  const rebase = (bars) =>
    bars.map((b) => ({
      t: b.t - t0,
      o: round(b.o - anchor),
      h: round(b.h - anchor),
      l: round(b.l - anchor),
      c: round(b.c - anchor),
    }));

  // The rail travels with its session rather than living in a shared array, so a
  // session is self-contained and cannot be chained to its neighbours.
  const rail = daily.slice(Math.max(0, i - DAILY_RAIL), i).map((d) => ({
    o: round(d.o - anchor),
    h: round(d.h - anchor),
    l: round(d.l - anchor),
    c: round(d.c - anchor),
  }));

  if (rail.length < MIN_RAIL) {
    skipped.push({ date, reason: `only ${rail.length} daily bars of context, need ${MIN_RAIL}` });
    continue;
  }

  sessions.push({
    seed: rebase(cur.seed),
    rth: rebase(cur.rth),
    rail,
    magnets: {
      yHigh: round(y.rthHigh - anchor),
      yLow: round(y.rthLow - anchor),
      yClose: round(y.rthClose - anchor),
      // Half of an odd tick count lands on .125 -- exact in binary float, so no
      // rounding. Rounding to 2dp here silently shifts the level by 0.005.
      yMid: (y.rthHigh + y.rthLow) / 2 - anchor,
      onHigh: round(Math.max(...cur.seed.map((b) => b.h)) - anchor),
      onLow: round(Math.min(...cur.seed.map((b) => b.l)) - anchor),
      open: 0, // the origin, by construction
    },
  });

  meta.push({ date, prevDate: prev, anchor });
}

// ---------------------------------------------------------------- merge + write

// Sessions are keyed by date through the metadata file. The shipped file has no
// idea what day anything is, which is the whole point.
let oldSessions = [];
let oldMeta = [];
if (existsSync(OUT) && existsSync(META)) {
  try {
    oldSessions = JSON.parse(readFileSync(OUT, 'utf8')).sessions ?? [];
    oldMeta = JSON.parse(readFileSync(META, 'utf8')).sessions ?? [];
    if (oldSessions.length !== oldMeta.length) {
      console.warn('  sessions.json and its metadata disagree on length, rebuilding from scratch');
      oldSessions = [];
      oldMeta = [];
    } else {
      console.log(`  existing: ${oldSessions.length} sessions on disk`);
    }
  } catch {
    console.warn('  existing data unreadable, starting fresh');
  }
}

const byDate = new Map();
oldMeta.forEach((m, i) => byDate.set(m.date, { meta: m, session: oldSessions[i] }));
const newDates = [];
meta.forEach((m, i) => {
  if (!byDate.has(m.date)) newDates.push(m.date);
  byDate.set(m.date, { meta: m, session: sessions[i] });
});

const ordered = [...byDate.values()].sort((a, b) => (a.meta.date < b.meta.date ? -1 : 1));

const out = {
  interval: '5m',
  tickSize: TICK,
  rthBars: RTH_BARS,
  dailyRail: DAILY_RAIL,
  // Prices are points from each session open; times are seconds from the bell.
  normalised: true,
  sessions: ordered.map((x) => x.session),
};

const metaOut = {
  generatedAt: new Date().toISOString(),
  symbol: SYMBOL,
  note: 'Identifying data, deliberately NOT shipped. Never import this from src/.',
  sessions: ordered.map((x) => x.meta),
};

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(dirname(META), { recursive: true });
const json = JSON.stringify(out);
writeFileSync(OUT, json);
writeFileSync(META, JSON.stringify(metaOut, null, 1));

// ---------------------------------------------------------------- report

console.log(`\nWrote ${OUT}`);
console.log(
  `  ${out.sessions.length} sessions (${newDates.length} new), ` +
    `${(Buffer.byteLength(json) / 1024 / 1024).toFixed(2)} MB, normalised`
);
console.log(`  metadata (not shipped): ${META}`);
console.log(`  range: ${ordered[0]?.meta.date} -> ${ordered.at(-1)?.meta.date}`);

if (skipped.length) {
  console.log(`\n  skipped ${skipped.length}:`);
  for (const s of skipped) console.log(`    ${s.date}  ${s.reason}`);
}

// ---------------------------------------------------------------- integrity

const problems = [];
ordered.forEach(({ session: s, meta: m }) => {
  const tag = m.date;
  if (s.rth.length !== RTH_BARS) problems.push(`${tag}: ${s.rth.length} RTH bars`);
  if (s.seed.length < 20) problems.push(`${tag}: ${s.seed.length} seed bars`);
  if (s.rail.length < MIN_RAIL) problems.push(`${tag}: only ${s.rail.length} rail bars`);

  if (s.rth[0].o !== 0) problems.push(`${tag}: session does not open at 0 (${s.rth[0].o})`);
  if (s.rth[0].t !== 0) problems.push(`${tag}: opening bar is not at t=0 (${s.rth[0].t})`);
  if (s.magnets.open !== 0) problems.push(`${tag}: open magnet is not the origin`);
  if (s.seed.at(-1).t >= 0) problems.push(`${tag}: seed bars are not before the bell`);

  for (let i = 1; i < s.rth.length; i++) {
    if (s.rth[i].t - s.rth[i - 1].t !== 300) {
      problems.push(`${tag}: RTH gap at bar ${i}`);
      break;
    }
  }
  for (const b of [...s.seed, ...s.rth]) {
    if (!(b.h >= b.o && b.h >= b.c && b.l <= b.o && b.l <= b.c && b.h >= b.l)) {
      problems.push(`${tag}: impossible OHLC at t=${b.t}`);
      break;
    }
    if ([b.o, b.h, b.l, b.c].some((p) => Math.abs(p / TICK - Math.round(p / TICK)) > 1e-6)) {
      problems.push(`${tag}: price off the ${TICK} tick grid at t=${b.t}`);
      break;
    }
  }

  const lo = Math.min(...s.rth.map((b) => b.l));
  const hi = Math.max(...s.rth.map((b) => b.h));
  const span = Math.max(hi - lo, 1);
  if (s.magnets.yLow > hi + 6 * span || s.magnets.yHigh < lo - 6 * span) {
    problems.push(`${tag}: yesterday range is implausibly far from today -- contract mismatch?`);
  }

  const y = s.rail.at(-1);
  if (!y) problems.push(`${tag}: empty rail`);
  else if (y.h !== s.magnets.yHigh || y.l !== s.magnets.yLow || y.c !== s.magnets.yClose) {
    problems.push(`${tag}: magnets disagree with the last rail bar`);
  } else if (Math.abs(s.magnets.yMid - (y.h + y.l) / 2) > 1e-9) {
    problems.push(`${tag}: yMid is not the midpoint of the last rail bar`);
  }
});

// Nothing identifying may survive into the shipped file.
const leak = JSON.stringify(out);
for (const pat of [/\d{4}-\d{2}-\d{2}/, /ES=F/, /generatedAt/, /prevDate/]) {
  if (pat.test(leak)) problems.push(`LEAK: shipped file still matches ${pat}`);
}

if (problems.length) {
  console.error(`\n  ${problems.length} INTEGRITY PROBLEM(S):`);
  for (const p of problems.slice(0, 25)) console.error(`    ${p}`);
  process.exit(1);
}
console.log('\n  integrity checks passed, nothing identifying in the shipped file');
