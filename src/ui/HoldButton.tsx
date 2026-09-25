/**
 * A button that means one thing on a tap and another when held.
 *
 * Tap advances a single bar. Hold streams them past. Setups go by while you
 * hold, and nothing pauses for them -- impatience is meant to have a cost, and
 * that cost is the lesson.
 */

import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../render/theme';

/** Held longer than this and it is a hold, not a tap. */
const HOLD_MS = 260;

interface Props {
  label: string;
  sublabel?: string;
  onTap: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
  tint?: string;
  fill?: string;
  disabled?: boolean;
  flex?: number;
  style?: ViewStyle;
}

export function HoldButton({
  label,
  sublabel,
  onTap,
  onHoldStart,
  onHoldEnd,
  tint = theme.text,
  fill = theme.surfaceHi,
  disabled,
  flex = 1,
  style,
}: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const pressIn = useCallback(() => {
    if (disabled) return;
    held.current = false;
    if (!onHoldStart) return;
    timer.current = setTimeout(() => {
      held.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      onHoldStart();
    }, HOLD_MS);
  }, [disabled, onHoldStart]);

  const pressOut = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (disabled) return;
    if (held.current) {
      held.current = false;
      onHoldEnd?.();
    } else {
      onTap();
    }
  }, [disabled, onHoldEnd, onTap]);

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        // flexBasis 0 + minWidth 0 so the three buttons SHARE the row. Left to
        // size themselves the sublabels push the last button off the screen edge.
        { flexGrow: flex, flexBasis: 0, minWidth: 0, backgroundColor: fill, borderColor: tint },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View pointerEvents="none" style={styles.inner}>
        <Text style={[styles.label, { color: tint }]}>{label}</Text>
        {sublabel ? (
          <Text style={styles.sublabel} numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 62,
    borderRadius: 12,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  pressed: { opacity: 0.65, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.3 },
  label: { fontSize: 15, fontWeight: '800', letterSpacing: 0.6, textAlign: 'center' },
  sublabel: { fontSize: 9, color: theme.textDim, textAlign: 'center', marginTop: 2 },
  inner: { paddingHorizontal: 2, width: '100%' },
});
