import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Vibration } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { streakLabel } from '@/lib/streak';

/** How long the message stays before it fades out by itself. */
const SHOW_MS = 2200;
// The native driver runs the animation outside JavaScript on phones; the
// web has no native side, so it animates in JavaScript there.
const useNativeDriver = Platform.OS !== 'web';

type Props = {
  /** The streak including today; null while it is still loading. */
  streak: number | null;
  onDone: () => void;
};

/**
 * Shown over the review screen when an answer reaches the daily goal:
 * the flame pops in, the phone vibrates briefly, then it fades away.
 * Tapping closes it early.
 */
export function GoalCelebration({ streak, onDone }: Props) {
  // Created once per celebration; the animation changes them, React never does.
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    // Two short pulses on Android and in browsers that support it; iOS
    // ignores the pattern and vibrates once.
    Vibration.vibrate([0, 60, 80, 60]);
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver }),
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver }),
      ]),
      Animated.delay(SHOW_MS),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => animation.stop();
  }, [opacity, scale, onDone]);

  return (
    <Animated.View style={[styles.overlay, { opacity }]}>
      <Pressable
        style={styles.fill}
        onPress={onDone}
        accessibilityRole="button"
        accessibilityLabel="Daily goal reached. Close">
        <ThemedView type="backgroundElement" style={styles.box}>
          <Animated.Text style={[styles.flame, { transform: [{ scale }] }]}>🔥</Animated.Text>
          <ThemedText type="subtitle" style={styles.center}>
            Daily goal reached!
          </ThemedText>
          <ThemedText style={styles.center} themeColor="textSecondary">
            {streak === null ? ' ' : streakLabel(streak)}
          </ThemedText>
        </ThemedView>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Covers the whole screen above everything else.
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  box: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.four,
  },
  flame: { fontSize: 72, lineHeight: 88 },
  center: { textAlign: 'center' },
});
