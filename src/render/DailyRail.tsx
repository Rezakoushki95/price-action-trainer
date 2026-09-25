/**
 * The daily context strip.
 *
 * This is the feature the whole app is built around, so it does one thing beyond
 * showing daily bars: it marks the EXACT bar yesterday's high and low were read
 * from, and runs those two levels out to the right edge in the same colour they
 * are drawn on the intraday chart below.
 *
 * The learner therefore sees where a magnet COMES FROM rather than just that it
 * exists -- which is the difference between context that teaches and context
 * that decorates.
 *
 * The rail keeps its own price scale. Thirty daily bars span far more range than
 * one session, so forcing it onto the intraday axis would flatten it into a line.
 * The colour-matched levels carry the connection instead.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, DashPathEffect, Path, Skia } from '@shopify/react-native-skia';

import type { DailyBar } from '../core/types';
import { signed } from '../core/format';
import { theme } from './theme';

interface Props {
  bars: DailyBar[];
  /** Index into `bars` of the session's previous day. */
  yesterdayIndex: number;
  width: number;
  height: number;
}

const PAD = 8;

export function DailyRail({ bars, yesterdayIndex, width, height }: Props) {
  const scene = useMemo(() => {
    const bull = Skia.Path.Make();
    const bear = Skia.Path.Make();
    const wick = Skia.Path.Make();
    const yBull = Skia.Path.Make();
    const yBear = Skia.Path.Make();
    const yWick = Skia.Path.Make();
    const levels = Skia.Path.Make();
    const highlight = Skia.Path.Make();

    if (!bars.length)
      return { bull, bear, wick, yBull, yBear, yWick, levels, highlight, y: (_: number) => 0 };

    let min = Infinity;
    let max = -Infinity;
    for (const b of bars) {
      if (b.l < min) min = b.l;
      if (b.h > max) max = b.h;
    }
    const span = Math.max(max - min, 1e-6) * 1.08;
    const mid = (max + min) / 2;
    const lo = mid - span / 2;

    const usable = height - PAD * 2;
    const y = (p: number) => PAD + (1 - (p - lo) / span) * usable;

    const slot = width / bars.length;
    const w = Math.max(1.5, slot * 0.55);

    bars.forEach((b, i) => {
      const cx = i * slot + slot / 2;
      const isY = i === yesterdayIndex;
      const up = b.c >= b.o;
      const bodyPath = isY ? (up ? yBull : yBear) : up ? bull : bear;
      const wickPath = isY ? yWick : wick;

      wickPath.moveTo(cx, y(b.h));
      wickPath.lineTo(cx, y(b.l));
      const top = Math.min(y(b.o), y(b.c));
      bodyPath.addRect(Skia.XYWHRect(cx - w / 2, top, w, Math.max(Math.abs(y(b.c) - y(b.o)), 1)));

      if (isY) {
        // Run yesterday's high and low out to the right edge, so the eye connects
        // them to the identically coloured rays on the chart below.
        levels.moveTo(cx, y(b.h));
        levels.lineTo(width, y(b.h));
        levels.moveTo(cx, y(b.l));
        levels.lineTo(width, y(b.l));

        const pad = 3;
        highlight.addRect(
          Skia.XYWHRect(cx - w / 2 - pad, y(b.h) - pad, w + pad * 2, y(b.l) - y(b.h) + pad * 2)
        );
      }
    });

    return { bull, bear, wick, yBull, yBear, yWick, levels, highlight, y };
  }, [bars, yesterdayIndex, width, height]);

  const yesterday = bars[yesterdayIndex];

  return (
    <View style={{ width, height }}>
      <Canvas style={{ width, height }}>
        <Path
          path={scene.highlight}
          color={theme.magnetKey}
          style="stroke"
          strokeWidth={1}
          opacity={0.45}
        />
        <Path path={scene.levels} color={theme.magnetKey} style="stroke" strokeWidth={1}>
          <DashPathEffect intervals={[6, 4]} />
        </Path>

        {/* The rest of the month recedes; only yesterday is at full strength. */}
        <Path
          path={scene.wick}
          color={theme.textFaint}
          style="stroke"
          strokeWidth={1}
          opacity={0.55}
        />
        <Path path={scene.bull} color={theme.bullDim} style="fill" opacity={0.9} />
        <Path path={scene.bear} color={theme.bearDim} style="fill" opacity={0.9} />

        <Path path={scene.yWick} color={theme.text} style="stroke" strokeWidth={1.3} />
        <Path path={scene.yBull} color={theme.bull} style="fill" />
        <Path path={scene.yBear} color={theme.bear} style="fill" />
      </Canvas>

      <Text style={styles.caption}>DAILY · {bars.length}d</Text>
      {yesterday && (
        <Text style={styles.legend}>
          yesterday · H {signed(yesterday.h)} · L {signed(yesterday.l)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    position: 'absolute',
    left: 2,
    top: 2,
    color: theme.textFaint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  legend: {
    position: 'absolute',
    left: 2,
    bottom: 2,
    color: theme.textFaint,
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
});
