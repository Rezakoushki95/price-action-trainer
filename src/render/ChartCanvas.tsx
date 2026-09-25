/**
 * The intraday chart.
 *
 * Deliberately hand-rolled rather than a charting library, because the two
 * things that matter most here -- a bar drawing itself in over ~220ms, and
 * Brooks-style magnet rays labelled at the right edge -- are exactly what
 * off-the-shelf charts fight you on.
 *
 * Only one indicator is ever drawn: the 20-bar EMA.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, DashPathEffect, Path, Skia } from '@shopify/react-native-skia';

import type { MagnetLine } from '../core/magnets';
import type { SessionView } from '../core/session';
import type { LivePosition } from '../core/trade';
import { signed } from '../core/format';
import { buildGeometry, easeOut } from './geometry';
import { CHART, theme } from './theme';

interface Props {
  view: SessionView;
  index: number;
  position: LivePosition | null;
  magnets: MagnetLine[];
  /** 0..1 for the most recently revealed bar. 1 means fully drawn. */
  reveal: number;
  width: number;
  height: number;
}

export function ChartCanvas({ view, index, position, magnets, reveal, width, height }: Props) {
  const geom = useMemo(
    () =>
      buildGeometry({
        bars: view.bars,
        index,
        width,
        height,
        include: [
          ...magnets.map((m) => m.price),
          ...(position ? [position.entry, position.stop] : []),
        ],
      }),
    [view, index, width, height, magnets, position]
  );

  /**
   * Everything except the newest bar. Rebuilt only when the playhead moves, so
   * the reveal animation re-renders one bar rather than forty-six.
   */
  const scene = useMemo(() => {
    const bullBody = Skia.Path.Make();
    const bearBody = Skia.Path.Make();
    const bullWick = Skia.Path.Make();
    const bearWick = Skia.Path.Make();
    const preBody = Skia.Path.Make();
    const preWick = Skia.Path.Make();
    const emaPath = Skia.Path.Make();

    let emaStarted = false;
    let bellX: number | null = null;

    for (let i = geom.start; i <= geom.end; i++) {
      const bar = view.bars[i];
      if (!bar) continue;

      const cx = geom.x(i);
      const isOvernight = i < view.rthStart;
      if (i === view.rthStart) bellX = cx - geom.slot / 2;

      // The newest bar is drawn separately so it can animate.
      if (i !== geom.end) {
        const up = bar.c >= bar.o;
        const body = isOvernight ? preBody : up ? bullBody : bearBody;
        const wick = isOvernight ? preWick : up ? bullWick : bearWick;
        addBar(body, wick, cx, geom.barW, geom.y(bar.o), geom.y(bar.h), geom.y(bar.l), geom.y(bar.c));
      }

      const e = view.ema[i];
      if (e != null) {
        const ey = geom.y(e);
        if (!emaStarted) {
          emaPath.moveTo(cx, ey);
          emaStarted = true;
        } else {
          emaPath.lineTo(cx, ey);
        }
      }
    }

    const bell = Skia.Path.Make();
    if (bellX != null && bellX > 0) {
      bell.moveTo(bellX, CHART.topPad);
      bell.lineTo(bellX, height - CHART.bottomPad);
    }

    const magnetPath = Skia.Path.Make();
    const keyMagnetPath = Skia.Path.Make();
    for (const m of magnets) {
      const y = geom.y(m.price);
      if (y < 0 || y > height) continue;
      const p = m.key === 'yHigh' || m.key === 'yLow' ? keyMagnetPath : magnetPath;
      p.moveTo(0, y);
      p.lineTo(geom.plotW + CHART.rightPad - 4, y);
    }

    return { bullBody, bearBody, bullWick, bearWick, preBody, preWick, emaPath, bell, magnetPath, keyMagnetPath };
  }, [view, geom, magnets, height]);

  /** The bar under the playhead, drawn partially according to `reveal`. */
  const newest = useMemo(() => {
    const bar = view.bars[geom.end];
    const body = Skia.Path.Make();
    const wick = Skia.Path.Make();
    if (!bar) return { body, wick, up: true, overnight: false };

    const e = easeOut(reveal);
    const h = bar.o + (bar.h - bar.o) * e;
    const l = bar.o + (bar.l - bar.o) * e;
    const c = bar.o + (bar.c - bar.o) * e;

    addBar(body, wick, geom.x(geom.end), geom.barW, geom.y(bar.o), geom.y(h), geom.y(l), geom.y(c));
    return { body, wick, up: bar.c >= bar.o, overnight: geom.end < view.rthStart };
  }, [view, geom, reveal]);

  /** Entry, stop and the band of risk between them. */
  const pos = useMemo(() => {
    if (!position) return null;
    const entryY = geom.y(position.entry);
    const stopY = geom.y(position.stop);
    const entry = Skia.Path.Make();
    entry.moveTo(0, entryY);
    entry.lineTo(geom.plotW, entryY);
    const stop = Skia.Path.Make();
    stop.moveTo(0, stopY);
    stop.lineTo(geom.plotW, stopY);
    const band = Skia.Path.Make();
    band.addRect(Skia.XYWHRect(0, Math.min(entryY, stopY), geom.plotW, Math.abs(stopY - entryY)));
    return { entry, stop, band };
  }, [position, geom]);

  const lastClose = view.bars[geom.end]?.c;

  return (
    <View style={{ width, height }}>
      <Canvas style={{ width, height }}>
        {/* Magnets sit behind price -- they are context, not the subject. */}
        <Path path={scene.magnetPath} color={theme.magnet} style="stroke" strokeWidth={1}>
          <DashPathEffect intervals={[3, 5]} />
        </Path>
        <Path path={scene.keyMagnetPath} color={theme.magnetKey} style="stroke" strokeWidth={1.4}>
          <DashPathEffect intervals={[6, 4]} />
        </Path>

        <Path path={scene.bell} color={theme.border} style="stroke" strokeWidth={1}>
          <DashPathEffect intervals={[2, 4]} />
        </Path>

        {pos && (
          <>
            <Path path={pos.band} color={theme.riskFill} style="fill" />
            <Path path={pos.entry} color={theme.entry} style="stroke" strokeWidth={1.2} />
            <Path path={pos.stop} color={theme.stop} style="stroke" strokeWidth={1.2}>
              <DashPathEffect intervals={[4, 3]} />
            </Path>
          </>
        )}

        {/* Overnight bars are context and never tradeable, so they recede. */}
        <Path path={scene.preWick} color={theme.textFaint} style="stroke" strokeWidth={1} opacity={0.5} />
        <Path path={scene.preBody} color={theme.textFaint} style="fill" opacity={0.4} />

        <Path path={scene.emaPath} color={theme.ema} style="stroke" strokeWidth={1.8} />

        <Path path={scene.bullWick} color={theme.bull} style="stroke" strokeWidth={1.1} />
        <Path path={scene.bearWick} color={theme.bear} style="stroke" strokeWidth={1.1} />
        <Path path={scene.bullBody} color={theme.bull} style="fill" />
        <Path path={scene.bearBody} color={theme.bear} style="fill" />

        <Path
          path={newest.wick}
          color={newest.overnight ? theme.textFaint : newest.up ? theme.bull : theme.bear}
          style="stroke"
          strokeWidth={1.3}
        />
        <Path
          path={newest.body}
          color={newest.overnight ? theme.textFaint : newest.up ? theme.bull : theme.bear}
          style="fill"
        />
      </Canvas>

      {/* Labels are React Native text rather than Skia text, so no font asset
          has to be bundled and they stay crisp at any density. */}
      {magnets.map((m) => {
        const y = geom.y(m.price);
        const key = m.key === 'yHigh' || m.key === 'yLow';
        const colour = key ? theme.magnetKey : theme.magnet;

        // A magnet can sit well outside the day's range -- on a gap day the whole
        // of yesterday is above price. Stretching the axis to reach it would
        // squash the bars into a hairline exactly when reading them matters most,
        // and hiding it would remove the level the player is trading toward. So
        // it gets pinned to the edge with the distance to it instead.
        const off = y < 10 ? 'up' : y > height - 10 ? 'down' : null;
        if (off && lastClose != null) {
          const away = Math.abs(m.price - lastClose);
          return (
            <View
              key={m.key}
              style={[
                styles.magnetLabel,
                styles.magnetOff,
                { borderColor: colour, [off === 'up' ? 'top' : 'bottom']: 2 },
              ]}
            >
              <Text style={[styles.magnetText, { color: colour }]} numberOfLines={1}>
                {m.label} {off === 'up' ? '↑' : '↓'}
                {away.toFixed(0)}
              </Text>
            </View>
          );
        }

        return (
          <View key={m.key} style={[styles.magnetLabel, { top: y - 8, borderColor: colour }]}>
            <Text style={[styles.magnetText, key && { color: theme.magnetKey }]} numberOfLines={1}>
              {m.label}
            </Text>
          </View>
        );
      })}

      {lastClose != null && (
        <View style={[styles.priceChip, { top: geom.y(lastClose) - 9 }]}>
          <Text style={styles.priceText}>{signed(lastClose)}</Text>
        </View>
      )}
    </View>
  );
}

/** One candle: a wick from high to low and a body between open and close. */
function addBar(
  body: ReturnType<typeof Skia.Path.Make>,
  wick: ReturnType<typeof Skia.Path.Make>,
  cx: number,
  w: number,
  yOpen: number,
  yHigh: number,
  yLow: number,
  yClose: number
) {
  wick.moveTo(cx, yHigh);
  wick.lineTo(cx, yLow);

  const top = Math.min(yOpen, yClose);
  // A bar that opens and closes at the same price still has to be visible.
  const h = Math.max(Math.abs(yClose - yOpen), 1);
  body.addRect(Skia.XYWHRect(cx - w / 2, top, w, h));
}

const styles = StyleSheet.create({
  magnetLabel: {
    position: 'absolute',
    right: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    backgroundColor: theme.bg,
  },
  magnetOff: {
    backgroundColor: theme.surfaceHi,
    opacity: 0.9,
  },
  magnetText: {
    color: theme.magnetText,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  priceChip: {
    position: 'absolute',
    right: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: theme.surfaceHi,
  },
  priceText: {
    color: theme.text,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
