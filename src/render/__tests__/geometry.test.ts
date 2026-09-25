/**
 * Chart geometry, plus an ASCII rendering of a real session.
 *
 * The app cannot be screenshotted without a device, so this renders the same
 * geometry the Skia canvas uses into text. It catches the failures that matter
 * visually -- an inverted axis, bars off screen, magnets landing nowhere near
 * price, an EMA that does not track the bars -- and it prints the chart so a
 * human can just look at it.
 */

import { describe, expect, it } from 'vitest';
import raw from '../../data/sessions.json';
import { buildSessionView } from '../../core/session';
import { visibleMagnets } from '../../core/magnets';
import { buildGeometry, easeOut } from '../geometry';
import { CHART } from '../theme';
import type { SessionDb } from '../../core/types';

const db = raw as unknown as SessionDb;

const W = 900;
const H = 420;

const view = buildSessionView(db.sessions[10], db.tickSize);
const magnets = visibleMagnets(view.magnets, 4);
const at = (index: number) =>
  buildGeometry({
    bars: view.bars,
    index,
    width: W,
    height: H,
    include: magnets.map((m) => m.price),
  });

describe('buildGeometry', () => {
  it('inverts the price axis, so higher prices are nearer the top', () => {
    const g = at(view.rthStart + 30);
    expect(g.y(g.max)).toBeLessThan(g.y(g.min));
  });

  it('keeps every visible bar inside the canvas', () => {
    const g = at(view.rthStart + 40);
    for (let i = g.start; i <= g.end; i++) {
      const b = view.bars[i];
      expect(g.y(b.h)).toBeGreaterThanOrEqual(0);
      expect(g.y(b.l)).toBeLessThanOrEqual(H);
    }
  });

  it('lays bars left to right inside the plot area, clear of the label gutter', () => {
    const g = at(view.rthStart + 40);
    expect(g.x(g.start)).toBeGreaterThan(0);
    expect(g.x(g.end)).toBeLessThanOrEqual(g.plotW);
    expect(g.x(g.start)).toBeLessThan(g.x(g.end));
    expect(g.plotW).toBe(W - CHART.rightPad);
  });

  it('shows a fixed-width window that slides with the playhead', () => {
    const g = at(view.rthEnd);
    expect(g.end - g.start + 1).toBe(CHART.visibleBars);
    expect(g.end).toBe(view.rthEnd);
  });

  it('does not run off the left edge early in the session', () => {
    const g = buildGeometry({ bars: view.bars, index: 3, width: W, height: H });
    expect(g.start).toBe(0);
  });

  it('holds the axis still between consecutive bars', () => {
    // A price axis that rescales on every reveal makes the chart twitch, and a
    // twitching chart destroys the feel the app depends on.
    let jumps = 0;
    for (let i = view.rthStart + 1; i <= view.rthEnd; i++) {
      const a = at(i - 1);
      const b = at(i);
      if (a.min !== b.min || a.max !== b.max) jumps++;
    }
    expect(jumps / (view.rthEnd - view.rthStart)).toBeLessThan(0.35);
  });

  it('refuses to let one distant magnet flatten the bars into a hairline', () => {
    const g = buildGeometry({
      bars: view.bars,
      index: view.rthStart + 40,
      width: W,
      height: H,
      include: [999999],
    });
    const bare = buildGeometry({ bars: view.bars, index: view.rthStart + 40, width: W, height: H });
    expect(g.max).toBeLessThan(bare.max + (bare.max - bare.min) * 2);
  });

  it('keeps the EMA on screen wherever it is defined', () => {
    const g = at(view.rthStart + 50);
    for (let i = g.start; i <= g.end; i++) {
      const e = view.ema[i];
      if (e == null) continue;
      expect(g.y(e)).toBeGreaterThan(-H);
      expect(g.y(e)).toBeLessThan(H * 2);
    }
  });
});

describe('easeOut', () => {
  it('runs 0 to 1 and clamps outside that', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });

  it('is fast early and settles late, so a bar lands rather than drifts', () => {
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(0.9)).toBeGreaterThan(0.99);
  });
});

function render(sessionIdx: number, barsIn: number) {
  const v = buildSessionView(db.sessions[sessionIdx], db.tickSize);
  const mags = visibleMagnets(v.magnets, 4);
  const cols = 96;
  const rows = 30;
  const index = v.rthStart + barsIn;

  // CHART.topPad/bottomPad are PIXELS. Rendering into a 30-unit-tall canvas
  // would let 20 units of padding eat the chart, so build at pixel scale and
  // divide down into character rows.
  const SCALE = 14;
  const g = buildGeometry({
    bars: v.bars,
    index,
    width: cols,
    height: rows * SCALE,
    include: mags.map((m) => m.price),
    // The real window, so the picture reflects what the player actually sees.
    visibleBars: CHART.visibleBars,
  });

  let blo = Infinity;
  let bhi = -Infinity;
  for (let i = g.start; i <= g.end; i++) {
    if (v.bars[i].l < blo) blo = v.bars[i].l;
    if (v.bars[i].h > bhi) bhi = v.bars[i].h;
  }

  const grid: string[][] = Array.from({ length: rows }, () => new Array(cols).fill(' '));
  const put = (x: number, y: number, ch: string) => {
    const r = Math.round(y / SCALE);
    const c = Math.round(x);
    if (r >= 0 && r < rows && c >= 0 && c < cols) grid[r][c] = ch;
  };

  const offscreen: string[] = [];
  for (const m of mags) {
    const y = Math.round(g.y(m.price) / SCALE);
    if (y < 0 || y >= rows) {
      offscreen.push(`${m.label}${y < 0 ? '↑' : '↓'}${Math.abs(m.price - v.bars[index].c).toFixed(0)}`);
      continue;
    }
    for (let c = 0; c < cols - 6; c++) if (grid[y][c] === ' ') grid[y][c] = '-';
    for (let k = 0; k < m.label.length && k < 5; k++) grid[y][cols - 5 + k] = m.label[k];
  }

  for (let i = g.start; i <= g.end; i++) {
    const b = v.bars[i];
    const x = g.x(i);
    const overnight = i < v.rthStart;
    for (let y = Math.round(g.y(b.h)); y <= Math.round(g.y(b.l)); y++) put(x, y, overnight ? ':' : '|');
    const top = Math.round(g.y(Math.max(b.o, b.c)));
    const bot = Math.round(g.y(Math.min(b.o, b.c)));
    for (let y = top; y <= bot; y++) put(x, y, overnight ? '.' : b.c >= b.o ? '#' : 'x');
  }

  for (let i = g.start; i <= g.end; i++) {
    const e = v.ema[i];
    if (e == null) continue;
    const y = Math.round(g.y(e) / SCALE);
    const x = Math.round(g.x(i));
    if (y >= 0 && y < rows && grid[y][x] === ' ') grid[y][x] = '~';
  }

  const art = grid.map((r) => r.join('').replace(/\s+$/, '')).join('\n');
  const fill = ((bhi - blo) / (g.max - g.min)) * 100;

  console.log(
    `\n== session #${sessionIdx}  bar ${barsIn + 1}/${v.session.rth.length}  ` +
      `(# bull  x bear  : overnight  ~ 20-EMA  - magnet)\n` +
      `axis ${g.min.toFixed(2)}..${g.max.toFixed(2)}   bars ${blo.toFixed(2)}..${bhi.toFixed(2)}   ` +
      `bars fill ${fill.toFixed(0)}% of the axis` +
      (offscreen.length ? `\npinned to edge: ${offscreen.join('  ')}` : '') +
      `\n\n${art}\n`
  );

  return { art, fill, offscreen };
}

describe('visual smoke test', () => {
  it('renders mid-session on an ordinary day', () => {
    const r = render(10, 55);
    expect(r.art).toMatch(/#/);
    expect(r.art).toMatch(/~/);
  });

  it('renders the open, where the chart is mostly overnight context', () => {
    const r = render(10, 2);
    expect(r.art).toMatch(/:/); // overnight bars carrying the EMA into the open
    expect(r.art).toMatch(/~/);
  });

  it('gives the bars most of the chart, even on the biggest gap day we hold', () => {
    // Prices are points from the open, so |yClose| IS the overnight gap. On a big
    // one the whole of yesterday sits away from price; the bars must stay readable
    // and the unreachable magnets get pinned to the edge instead.
    let gapDay = 0;
    db.sessions.forEach((s, i) => {
      if (Math.abs(s.magnets.yClose) > Math.abs(db.sessions[gapDay].magnets.yClose)) gapDay = i;
    });
    console.log(
      `\nbiggest gap in the library: session #${gapDay}, open ${db.sessions[gapDay].magnets.yClose.toFixed(2)} from yesterday close`
    );
    const r = render(gapDay, 40);
    expect(r.fill).toBeGreaterThan(40);
  });

  it('never squashes the bars below a third of the axis on any session', () => {
    let worst = { date: '', fill: 100 };
    for (let s = 0; s < db.sessions.length; s++) {
      const v = buildSessionView(db.sessions[s], db.tickSize);
      const mags = visibleMagnets(v.magnets, 4);
      for (let b = 0; b < v.session.rth.length; b += 7) {
        const idx = v.rthStart + b;
        const g = buildGeometry({
          bars: v.bars,
          index: idx,
          width: 900,
          height: 420,
          include: mags.map((m) => m.price),
        });
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = g.start; i <= g.end; i++) {
          if (v.bars[i].l < lo) lo = v.bars[i].l;
          if (v.bars[i].h > hi) hi = v.bars[i].h;
        }
        const fill = ((hi - lo) / (g.max - g.min)) * 100;
        if (fill < worst.fill) worst = { date: `session #${s}`, fill };
      }
    }
    console.log(`\nworst bar/axis fill across all sessions: ${worst.fill.toFixed(1)}% on ${worst.date}`);
    expect(worst.fill).toBeGreaterThan(33);
  });
});
