/**
 * Screenshots the app at a real phone viewport, tapping its way into states that
 * otherwise need a human.
 *
 *   npm run web:build && npm run web:serve      # in one shell
 *   npm run shoot                               # in another
 *
 * Why this exists rather than plain `chrome --screenshot`:
 *
 *   - Windows clamps a headless window to about 496px wide, so --window-size
 *     cannot produce a 390px phone. Device emulation over CDP can.
 *   - CanvasKit needs a GL surface. Headless Chrome gives it one only with the
 *     swiftshader flags below; with --disable-gpu every canvas renders blank
 *     while the React Native text around it draws perfectly, which looks
 *     convincingly like an app bug and is not one.
 *   - Pressing a button needs move -> down -> pause -> up. Neither
 *     page.mouse.click nor page.touchscreen.tap nor dispatching pointer events
 *     on the element does anything at all: React Native Web Pressable only
 *     counts a press once the pointer has entered the element first. Every one
 *     of the failing methods lands on the right pixels and leaves the app
 *     completely static, so the screenshots keep coming out looking plausible
 *     -- which is worse than failing. Measured, not guessed.
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SHOT_DIR ?? resolve(__dirname, '../shots');
const URL = process.env.SHOT_URL ?? 'http://localhost:3000/';
const SEED = Number(process.env.SHOT_SEED ?? 42);

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** iPhone 14-ish. A real phone viewport, not a small desktop window. */
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: false };

mkdirSync(OUT, { recursive: true });

const browser = await launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox',
    '--hide-scrollbars',
    // CanvasKit will not draw without a GL surface.
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

const page = await browser.newPage();
await page.setViewport(PHONE);

// Pin the shuffle so a run is reproducible. Without this every page load picks a
// random seed and the shots show a different session each time.
await page.evaluateOnNewDocument((seed) => {
  localStorage.setItem(
    'brooks-trainer',
    JSON.stringify({
      state: {
        seed,
        sessionIdx: 0,
        progress: {
          xp: 0,
          streak: 0,
          bestStreak: 0,
          sessionsPlayed: 0,
          totalR: 0,
          tradesTaken: 0,
          wins: 0,
        },
      },
      version: 0,
    })
  );
}, SEED);

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });

// CanvasKit is an 8MB wasm download; nothing is on screen until it lands.
await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 2, {
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 600));

const settle = (ms = 320) => new Promise((r) => setTimeout(r, ms));

/** Centre of the on-screen button with this label, or null. */
async function findButton(label) {
  return page.evaluate((want) => {
    const el = [...document.querySelectorAll('div,button')].find(
      (n) => n.innerText?.trim().split('\n')[0] === want && n.getBoundingClientRect().height > 30
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
}

/**
 * Press a button by its label.
 *
 * move -> down -> hold briefly -> up. See the header for why the obvious
 * alternatives silently do nothing.
 */
async function tap(label, times = 1) {
  for (let i = 0; i < times; i++) {
    const hit = await findButton(label);
    if (!hit) throw new Error(`no button labelled "${label}" on screen`);
    await page.mouse.move(hit.x, hit.y);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 60));
    await page.mouse.up();
    await settle();
  }
}

/** What the HUD currently reads, so the script can assert it is actually playing. */
const hud = () => page.evaluate(() => document.body.innerText.split('\n').slice(0, 6).join(' | '));

async function shoot(name) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  console.log(`  ${name.padEnd(18)} ${await hud()}`);
}

console.log(
  `Shooting ${URL} at ${PHONE.width}x${PHONE.height} dpr${PHONE.deviceScaleFactor}, seed ${SEED}\n`
);

await shoot('01-open');

// Sit on our hands through the first stretch, the way most bars deserve.
await tap('NOTHING', 20);
await shoot('02-midmorning');

// A tap has to actually move the playhead, or every shot after this is a lie.
const bar = await page.evaluate(() => {
  const m = document.body.innerText.match(/(\d+)\s*\/\s*78/);
  return m ? Number(m[1]) : 0;
});
if (bar < 20) throw new Error(`taps are not registering -- still on bar ${bar} after 20`);

// Take a trade and carry it.
await tap('BUY');
await shoot('03-in-trade');

for (let i = 0; i < 5; i++) {
  if (!(await findButton('HOLD'))) break; // stopped out already
  await tap('HOLD');
}
await shoot('04-holding');

// Get out deliberately -- the half of trading nobody practises.
if (await findButton('EXIT')) {
  await tap('EXIT');
  await shoot('05-after-exit');
} else {
  await shoot('05-stopped-out');
}

// Run the rest of the day out and land on the summary.
for (let i = 0; i < 90; i++) {
  if (await findButton('SEE RESULTS')) break;
  if (await findButton('HOLD')) await tap('HOLD');
  else if (await findButton('NOTHING')) await tap('NOTHING');
  else break;
}
if (await findButton('SEE RESULTS')) {
  await tap('SEE RESULTS');
  await settle(500);
  await shoot('06-summary');
}

console.log(`\nWrote to ${OUT}`);
await browser.close();
