import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { levelProgress } from '../core/scoring';
import { theme } from '../render/theme';

interface Props {
  xp: number;
  streak: number;
  sessionR: number;
  bar: number;
  total: number;
  clock: string;
  open: boolean;
}

export function Hud({ xp, streak, sessionR, bar, total, clock, open }: Props) {
  const { level, frac } = levelProgress(xp);
  const rColor = sessionR > 0 ? theme.bull : sessionR < 0 ? theme.bear : theme.textDim;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Text style={styles.value}>
            LVL {level}
            {streak > 1 ? <Text style={{ color: theme.bad }}>{`  ${streak}×`}</Text> : null}
          </Text>
          <Text style={styles.caption}>{clock}</Text>
        </View>

        <View style={[styles.cell, styles.center]}>
          <Text style={styles.value}>
            {bar}
            <Text style={styles.caption}> / {total}</Text>
          </Text>
          <Text style={styles.caption}>{open ? 'IN TRADE' : 'FLAT'}</Text>
        </View>

        <View style={[styles.cell, styles.right]}>
          <Text style={[styles.value, { color: rColor }]}>
            {sessionR >= 0 ? '+' : ''}
            {sessionR.toFixed(2)}R
          </Text>
          <Text style={styles.caption}>session</Text>
        </View>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(frac * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  cell: { flex: 1 },
  center: { alignItems: 'center' },
  right: { alignItems: 'flex-end' },
  value: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  caption: { color: theme.textFaint, fontSize: 9, fontWeight: '600', letterSpacing: 0.6 },
  track: {
    height: 3,
    backgroundColor: theme.surfaceHi,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  fill: { height: 3, backgroundColor: theme.xp, borderRadius: 2 },
});
