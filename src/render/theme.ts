/**
 * One palette, used by both the Skia canvases and the React Native chrome, so
 * the chart and the UI around it never drift apart.
 *
 * Dark by default and not themeable: this is a full-bleed, immersive screen, and
 * a bright chart at 6am in bed is a reason to close the app.
 */

export const theme = {
  bg: '#0B0E13',
  surface: '#141922',
  surfaceHi: '#1D2430',
  border: '#252D3B',

  text: '#E6EAF0',
  textDim: '#8A94A6',
  textFaint: '#5A6474',

  bull: '#2EE59D',
  bear: '#FF5B6B',
  bullDim: '#1B6B4D',
  bearDim: '#7A2F38',

  /** The 20-bar EMA. Deliberately the only gold thing on the screen. */
  ema: '#F2C94C',

  magnet: '#5B7BA8',
  magnetText: '#9FB6D4',

  /** Yesterday's high and low get more weight -- they are the levels Brooks draws most. */
  magnetKey: '#7FA8DC',

  entry: '#E6EAF0',
  stop: '#FF5B6B',
  riskFill: 'rgba(255, 91, 107, 0.10)',

  good: '#2EE59D',
  bad: '#FFB020',
  xp: '#7C6FF0',
} as const;

export const CHART = {
  /** Bars visible in the window. Enough to read structure, few enough to see each bar. */
  visibleBars: 46,
  /** Space kept at the right for magnet labels. */
  rightPad: 58,
  topPad: 10,
  bottomPad: 10,
  /** How long a freshly revealed bar takes to draw itself in. */
  revealMs: 220,
  /** Bar interval while fast-forwarding. */
  fastForwardMs: 45,
} as const;
