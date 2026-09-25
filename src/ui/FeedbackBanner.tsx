/**
 * The line that appears the instant a decision is made.
 *
 * It has to land fast -- the whole reinforcement loop depends on feedback
 * arriving before attention moves on -- so it is a single strip, never a modal,
 * and it never blocks the next tap.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { theme } from '../render/theme';
import type { Feedback } from '../state/gameStore';
import { wasNearMiss } from '../core/trade';

export function FeedbackBanner({ feedback }: { feedback: Feedback | null }) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!feedback) return;
    fade.setValue(0);
    Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(fade, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [feedback?.id, fade]);

  if (!feedback) return <View style={styles.spacer} />;

  const near = feedback.trade ? wasNearMiss(feedback.trade, 0.5) : false;

  // A stop-out is sound process, so scoreExit marks it good -- but painting
  // "Stopped -1.00R" green reads as a win and undercuts the message. Exits are
  // coloured by what they made; decisions by whether they were the right call.
  const tint = feedback.trade
    ? near
      ? theme.bad
      : feedback.trade.r > 0
        ? theme.good
        : theme.bear
    : feedback.good
      ? theme.good
      : theme.bad;

  return (
    <Animated.View style={[styles.wrap, { opacity: fade, borderLeftColor: tint }]}>
      <Text style={[styles.verdict, { color: tint }]} numberOfLines={1}>
        {feedback.verdict}
      </Text>
      {feedback.detail.length > 0 && (
        <Text style={styles.detail} numberOfLines={2}>
          {feedback.detail.join(' · ')}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  spacer: { height: 44 },
  wrap: {
    height: 44,
    justifyContent: 'center',
    marginHorizontal: 12,
    paddingLeft: 10,
    paddingRight: 8,
    borderLeftWidth: 3,
    backgroundColor: theme.surface,
    borderRadius: 4,
  },
  verdict: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  detail: { color: theme.textDim, fontSize: 10, marginTop: 1, lineHeight: 13 },
});
