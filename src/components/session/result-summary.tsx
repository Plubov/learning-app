import { Animated, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * The rewarding end of a session (lesson, practice, review, conversation):
 * a trophy that pops in, the headline, one line, and a row of numbers.
 * Shown inside a SessionLayout, with confetti over it.
 */
export function ResultSummary({
  perfect,
  title,
  text,
  stats,
  scale,
}: {
  /** Everything right at the first try: a trophy instead of the party popper. */
  perfect: boolean;
  title: string;
  text: string;
  stats: { value: string; label: string }[];
  /** The pop animation of the trophy (usePop). */
  scale: Animated.Value;
}) {
  return (
    <View style={styles.result}>
      <Animated.Text style={[styles.trophy, { transform: [{ scale }] }]}>{perfect ? '🏆' : '🎉'}</Animated.Text>
      <ThemedText type="subtitle" style={styles.center}>
        {title}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.center}>
        {text}
      </ThemedText>
      <View style={styles.stats}>
        {stats.map((stat) => (
          <ThemedView key={stat.label} type="backgroundElement" style={styles.stat}>
            <ThemedText style={styles.statValue}>{stat.value}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {stat.label}
            </ThemedText>
          </ThemedView>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  result: { alignItems: 'center', gap: Spacing.three },
  trophy: { fontSize: 88, lineHeight: 104 },
  center: { textAlign: 'center' },
  stats: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch' },
  stat: { flex: 1, alignItems: 'center', padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
  statValue: { fontSize: 22, lineHeight: 30, fontWeight: 700 },
});
