/**
 * End of the day.
 *
 * Two numbers, kept deliberately apart: what the session MADE, in R, and what it
 * TAUGHT, in XP. A player can lose money and still level up, and the screen says
 * so out loud, because the alternative is teaching them to grade themselves on
 * variance.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { HoldButton } from './HoldButton';
import { theme } from '../render/theme';
import { levelFromXp, levelProgress } from '../core/scoring';
import { newlyUnlocked } from '../core/magnets';
import type { ClosedTrade } from '../core/types';

interface Props {
  trades: ClosedTrade[];
  missed: number;
  xpGained: number;
  xpTotal: number;
  levelAtStart: number;
  onNext: () => void;
  onReplay: () => void;
}

export function SessionSummary(p: Props) {
  const totalR = p.trades.reduce((n, t) => n + t.r, 0);
  const wins = p.trades.filter((t) => t.r > 0).length;
  const best = p.trades.reduce<ClosedTrade | null>((a, t) => (!a || t.r > a.r ? t : a), null);
  const worst = p.trades.reduce<ClosedTrade | null>((a, t) => (!a || t.r < a.r ? t : a), null);
  const nearMisses = p.trades.filter((t) => t.reason === 'stop' && t.maxFavourableR >= 0.5);
  const level = levelFromXp(p.xpTotal);
  const unlocked = newlyUnlocked(p.levelAtStart, level);
  const { frac } = levelProgress(p.xpTotal);

  const rColor = totalR > 0 ? theme.bull : totalR < 0 ? theme.bear : theme.textDim;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Session complete</Text>

      <View style={styles.headline}>
        <View style={styles.big}>
          <Text style={[styles.bigValue, { color: rColor }]}>
            {totalR >= 0 ? '+' : ''}
            {totalR.toFixed(2)}R
          </Text>
          <Text style={styles.bigCaption}>made</Text>
        </View>
        <View style={styles.big}>
          <Text style={[styles.bigValue, { color: theme.xp }]}>+{p.xpGained}</Text>
          <Text style={styles.bigCaption}>learned (xp)</Text>
        </View>
      </View>

      {totalR < 0 && p.xpGained > 40 && (
        <Text style={styles.lesson}>
          You lost money and still levelled up. That is the point — a good trade can lose, and
          grading yourself on the outcome of any one day teaches superstition.
        </Text>
      )}

      {unlocked.length > 0 && (
        <View style={styles.unlock}>
          <Text style={styles.unlockTitle}>LEVEL {level} — NEW MAGNETS</Text>
          {unlocked.map((m) => (
            <View key={m.key} style={styles.unlockRow}>
              <Text style={styles.unlockName}>
                {m.label} · {m.name}
              </Text>
              <Text style={styles.unlockWhy}>{m.why}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(frac * 100)}%` }]} />
      </View>

      <Row label="Trades taken" value={String(p.trades.length)} />
      <Row label="Winners" value={p.trades.length ? `${wins} of ${p.trades.length}` : '--'} />
      {/* Coloured by the number, not by the label. On a losing session the best
          trade is still a loss, and painting it green reads as a win. */}
      {best && (
        <Row
          label="Best"
          value={`${best.r >= 0 ? '+' : ''}${best.r.toFixed(2)}R`}
          tint={best.r >= 0 ? theme.bull : theme.bear}
        />
      )}
      {worst && (
        <Row
          label="Worst"
          value={`${worst.r >= 0 ? '+' : ''}${worst.r.toFixed(2)}R`}
          tint={worst.r >= 0 ? theme.bull : theme.bear}
        />
      )}

      {nearMisses.length > 0 && (
        <Row
          label="Stopped after being in profit"
          value={String(nearMisses.length)}
          tint={theme.bad}
          note={`Best was +${Math.max(...nearMisses.map((t) => t.maxFavourableR)).toFixed(2)}R before it turned.`}
        />
      )}

      {p.missed > 0 && (
        <Row
          label="Setups missed while fast-forwarding"
          value={String(p.missed)}
          tint={theme.bad}
          note="They do not wait. That is what holding costs."
        />
      )}

      {p.trades.length === 0 && (
        <Text style={styles.lesson}>
          No trades all session. Sometimes that is exactly right — but check the summary above
          before you decide it was.
        </Text>
      )}

      <View style={styles.actions}>
        <HoldButton label="REPLAY" onTap={p.onReplay} tint={theme.textDim} fill={theme.surface} />
        <HoldButton label="NEXT SESSION" onTap={p.onNext} tint={theme.text} fill={theme.surfaceHi} flex={1.4} />
      </View>
    </ScrollView>
  );
}

function Row({ label, value, tint = theme.text, note }: { label: string; value: string; tint?: string; note?: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {note ? <Text style={styles.rowNote}>{note}</Text> : null}
      </View>
      <Text style={[styles.rowValue, { color: tint }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: theme.text, fontSize: 24, fontWeight: '800', marginTop: 2, marginBottom: 18 },
  headline: { flexDirection: 'row', marginBottom: 14 },
  big: { flex: 1 },
  bigValue: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bigCaption: { color: theme.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  lesson: {
    color: theme.textDim,
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: theme.surface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 14,
  },
  unlock: {
    backgroundColor: theme.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: theme.magnetKey,
  },
  unlockTitle: { color: theme.magnetKey, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  unlockRow: { marginBottom: 8 },
  unlockName: { color: theme.text, fontSize: 13, fontWeight: '700' },
  unlockWhy: { color: theme.textDim, fontSize: 11, lineHeight: 15, marginTop: 2 },
  track: { height: 4, backgroundColor: theme.surfaceHi, borderRadius: 2, overflow: 'hidden', marginBottom: 18 },
  fill: { height: 4, backgroundColor: theme.xp },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  rowLabel: { color: theme.textDim, fontSize: 12 },
  rowNote: { color: theme.textFaint, fontSize: 10, marginTop: 2 },
  rowValue: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', marginTop: 24 },
});
