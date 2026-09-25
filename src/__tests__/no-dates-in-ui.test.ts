/**
 * Dates must never reach the screen.
 *
 * A player who can read the session date can look the day up and see exactly what
 * happens next, which makes the entire exercise pointless. This guards the rule
 * two ways: the clock helper must not emit anything date-like, and no file that
 * renders UI may reference a session date at all.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import raw from '../data/sessions.json';
import { barClock, buildSessionView } from '../core/session';
import type { SessionDb } from '../core/types';

const db = raw as unknown as SessionDb;

describe('barClock', () => {
  const view = buildSessionView(db.sessions[0], db.tickSize);

  it('opens the regular session at 09:30', () => {
    expect(barClock(view, view.rthStart)).toBe('09:30');
  });

  it('advances five minutes a bar', () => {
    expect(barClock(view, view.rthStart + 1)).toBe('09:35');
    expect(barClock(view, view.rthStart + 12)).toBe('10:30');
  });

  it('reaches the closing bar at 15:55', () => {
    expect(barClock(view, view.rthEnd)).toBe('15:55');
  });

  it('never emits anything date-shaped, on any bar of any session', () => {
    for (const s of db.sessions) {
      const v = buildSessionView(s, db.tickSize);
      for (let i = v.rthStart; i <= v.rthEnd; i++) {
        const c = barClock(v, i);
        expect(c).toMatch(/^\d{2}:\d{2}$/);
        expect(c).not.toMatch(/d{4}/); // nothing that could be a year
      }
    }
  });

  it('clamps below the open rather than running backwards', () => {
    expect(barClock(view, 0)).toBe('09:30');
  });
});

describe('no dates in anything that renders', () => {
  const roots = ['src/ui', 'src/render', 'src/Game.tsx'];

  const files: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isFile()) {
      if (/\.tsx?$/.test(p) && !p.includes('__tests__')) files.push(p);
      return;
    }
    for (const e of readdirSync(p)) walk(join(p, e));
  };
  roots.forEach(walk);

  it('finds the UI files to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)('%s references no session date', (f) => {
    const src = readFileSync(f, 'utf8');
    // Strip comments -- prose may legitimately explain why dates are absent.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/session\.date/);
    expect(code).not.toMatch(/\bprevDate\b/);
    expect(code).not.toMatch(/yesterday\.d\b/);
    expect(code).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
