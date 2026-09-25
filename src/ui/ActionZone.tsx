/**
 * The thumb zone.
 *
 * Flat, you get SELL / NOTHING / BUY. In a position, HOLD / EXIT. Either way a
 * tap reveals exactly one bar and a hold streams them past.
 *
 * The reward-to-risk to the next magnet is printed on the entry buttons rather
 * than tucked away, because with no fixed target in this game that number IS the
 * decision -- it is the left-hand side of the trader's equation, made
 * visible before the player commits instead of explained afterwards.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HoldButton } from './HoldButton';
import { theme } from '../render/theme';
import { signed } from '../core/format';
import type { LivePosition } from '../core/trade';
import type { MagnetLine } from '../core/magnets';

interface Props {
  phase: 'playing' | 'ended' | 'summary';
  position: LivePosition | null;
  unrealisedR: number;
  longRR: { magnet: MagnetLine; rr: number } | null;
  shortRR: { magnet: MagnetLine; rr: number } | null;
  target: MagnetLine | null;
  onAct: (a: 'long' | 'short' | 'pass') => void;
  onHold: () => void;
  onExit: () => void;
  onFastForward: (on: boolean) => void;
  onSummary: () => void;
}

const rr = (v: { magnet: MagnetLine; rr: number } | null) =>
  v && v.rr > 0 ? `${v.rr.toFixed(1)}R to ${v.magnet.label}` : 'no room';

export function ActionZone(p: Props) {
  if (p.phase === 'ended') {
    return (
      <View style={styles.wrap}>
        <View style={styles.row}>
          <HoldButton
            label="SEE RESULTS"
            onTap={p.onSummary}
            tint={theme.text}
            fill={theme.surfaceHi}
          />
        </View>
      </View>
    );
  }

  if (p.position) {
    const good = p.unrealisedR >= 0;
    return (
      <View style={styles.wrap}>
        <View style={styles.readout}>
          <Meta label="ENTRY" value={signed(p.position.entry)} />
          <Meta label="STOP" value={signed(p.position.stop)} tint={theme.stop} />
          <Meta
            label="OPEN"
            value={`${p.unrealisedR >= 0 ? '+' : ''}${p.unrealisedR.toFixed(2)}R`}
            tint={good ? theme.bull : theme.bear}
          />
          <Meta label="TARGET" value={p.target ? p.target.label : '--'} tint={theme.magnetKey} />
        </View>
        <View style={styles.row}>
          <HoldButton
            label="HOLD"
            sublabel="hold to fast-forward"
            onTap={p.onHold}
            onHoldStart={() => p.onFastForward(true)}
            onHoldEnd={() => p.onFastForward(false)}
            tint={theme.textDim}
            fill={theme.surface}
            flex={1.3}
          />
          <HoldButton
            label="EXIT"
            sublabel={`take ${p.unrealisedR >= 0 ? '+' : ''}${p.unrealisedR.toFixed(2)}R`}
            onTap={p.onExit}
            tint={good ? theme.bull : theme.bear}
            fill={theme.surfaceHi}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <HoldButton
          label="SELL"
          sublabel={rr(p.shortRR)}
          onTap={() => p.onAct('short')}
          tint={theme.bear}
          fill={theme.surface}
        />
        <HoldButton
          label="NOTHING"
          sublabel="hold to fast-forward"
          onTap={() => p.onAct('pass')}
          onHoldStart={() => p.onFastForward(true)}
          onHoldEnd={() => p.onFastForward(false)}
          tint={theme.textDim}
          fill={theme.surface}
          flex={1.15}
        />
        <HoldButton
          label="BUY"
          sublabel={rr(p.longRR)}
          onTap={() => p.onAct('long')}
          tint={theme.bull}
          fill={theme.surface}
        />
      </View>
    </View>
  );
}

function Meta({
  label,
  value,
  tint = theme.text,
}: {
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, { color: tint }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingBottom: 6, paddingTop: 4 },
  row: { flexDirection: 'row' },
  readout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  meta: { alignItems: 'center', flex: 1 },
  metaLabel: { color: theme.textFaint, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  metaValue: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 1 },
});
