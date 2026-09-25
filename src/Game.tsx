/**
 * Al Brooks opening-hour trainer.
 *
 * One real session of ES futures, revealed one bar at a time. Tap to advance,
 * hold to fast-forward, trade at the close or do nothing. The 20-bar EMA and the
 * magnets carried down from the daily chart are the only things on the screen,
 * because they are the only things Brooks needs to read a chart.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ChartCanvas } from './render/ChartCanvas';
import { DailyRail } from './render/DailyRail';
import { useReveal } from './render/useReveal';
import { CHART, theme } from './render/theme';
import { ActionZone } from './ui/ActionZone';
import { FeedbackBanner } from './ui/FeedbackBanner';
import { Hud } from './ui/Hud';
import { SessionSummary } from './ui/SessionSummary';

import { db, magnetsFor, useGame } from './state/gameStore';
import { barClock, railBars, rthProgress } from './core/session';
import { rewardToRisk, targetMagnet } from './core/magnets';
import { openPosition, unrealisedR } from './core/trade';

const RAIL_HEIGHT = 78;
/** Hud + rail + feedback strip + action zone, so the chart can size itself before layout. */
const CHROME_HEIGHT = 330;

export default function App() {
  const g = useGame();
  const [chart, setChart] = useState({ w: 0, h: 0 });
  const [rail, setRail] = useState(0);

  // onLayout is measured asynchronously and reports 0x0 on the first paint, which
  // left both canvases guarded out and the screen blank. Falling back to the
  // window means the chart is drawn on frame one and onLayout only refines it.
  const win = useWindowDimensions();
  const chartW = chart.w || Math.max(1, win.width - 4);
  const chartH = chart.h || Math.max(160, win.height - CHROME_HEIGHT);
  const railW = rail || Math.max(1, win.width - 24);

  const skipAnimation = g.fastForwarding;
  const reveal = useReveal(g.index, skipAnimation);

  // --- fast-forward: one bar every CHART.fastForwardMs while the button is held ---
  useEffect(() => {
    if (!g.fastForwarding) return;
    const id = setInterval(
      () => useGame.getState().advance({ viaFastForward: true }),
      CHART.fastForwardMs
    );
    return () => clearInterval(id);
  }, [g.fastForwarding]);

  // --- a tick per revealed bar. Silent while streaming, or it becomes a buzz. ---
  useEffect(() => {
    if (skipAnimation) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [g.index, skipAnimation]);

  // --- a position closing is the moment that matters, so it gets its own knock ---
  useEffect(() => {
    if (g.feedback?.kind !== 'exit' || !g.feedback.trade) return;
    const won = g.feedback.trade.r > 0;
    Haptics.notificationAsync(
      won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
    ).catch(() => {});
  }, [g.feedback]);

  const magnets = useMemo(() => magnetsFor(g.view, g.progress.xp), [g.view, g.progress.xp]);
  const railData = useMemo(() => railBars(g.view.session), [g.view.session]);

  const bar = g.view.bars[g.index];
  const canEnter = g.phase === 'playing' && !g.position && g.index < g.view.rthEnd;

  const longRR = useMemo(() => {
    if (!canEnter || !bar) return null;
    const risk = openPosition(g.view.bars, g.index, 'long', db.tickSize).risk;
    return rewardToRisk(magnets, bar.c, risk, 'long');
  }, [canEnter, bar, g.view.bars, g.index, magnets]);

  const shortRR = useMemo(() => {
    if (!canEnter || !bar) return null;
    const risk = openPosition(g.view.bars, g.index, 'short', db.tickSize).risk;
    return rewardToRisk(magnets, bar.c, risk, 'short');
  }, [canEnter, bar, g.view.bars, g.index, magnets]);

  const openR = g.position && bar ? unrealisedR(g.position, bar.c) : 0;
  const target = g.position && bar ? targetMagnet(magnets, bar.c, g.position.dir) : null;
  const sessionR = g.trades.reduce((n, t) => n + t.r, 0);
  const progress = rthProgress(g.view, g.index);

  if (g.phase === 'summary') {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
          <SessionSummary
            trades={g.trades}
            missed={g.missed}
            xpGained={g.progress.xp - g.xpAtStart}
            xpTotal={g.progress.xp}
            levelAtStart={g.levelAtStart}
            onNext={g.nextSession}
            onReplay={g.replaySession}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <Hud
          xp={g.progress.xp}
          streak={g.progress.streak}
          sessionR={sessionR}
          bar={progress.bar}
          total={progress.total}
          clock={barClock(g.view, g.index)}
          open={!!g.position}
        />

        {/* Daily context is permanent. It is never something you navigate to. */}
        <View style={styles.rail} onLayout={(e) => setRail(e.nativeEvent.layout.width)}>
          {railW > 0 && (
            <DailyRail
              bars={railData.bars}
              yesterdayIndex={railData.yesterdayIndex}
              width={railW}
              height={RAIL_HEIGHT}
            />
          )}
        </View>

        <View
          style={styles.chart}
          onLayout={(e) =>
            setChart({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          }
        >
          {chartW > 0 && chartH > 0 && (
            <ChartCanvas
              view={g.view}
              index={g.index}
              position={g.position}
              magnets={magnets}
              reveal={reveal}
              width={chartW}
              height={chartH}
            />
          )}
        </View>

        <FeedbackBanner feedback={g.feedback} />

        <ActionZone
          phase={g.phase}
          position={g.position}
          unrealisedR={openR}
          longRR={longRR}
          shortRR={shortRR}
          target={target}
          onAct={g.act}
          onHold={g.hold}
          onExit={g.exitNow}
          onFastForward={g.setFastForward}
          onSummary={g.showSummary}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  rail: { height: RAIL_HEIGHT, marginHorizontal: 12, marginBottom: 4 },
  chart: { flex: 1, marginLeft: 4 },
});
