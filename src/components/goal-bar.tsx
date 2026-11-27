import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { loadGoalStatus } from '@/lib/daily-goal';
import { useT } from '@/lib/i18n';
import { goalProgress } from '@/lib/streak';

/**
 * Today's goal as a slim bar, shown at the top of every tab. Either goal
 * (points or reviews) keeps the streak, so the bar fills with whichever is
 * further along. Tapping it opens the statistics, where the goals are set.
 * Reloads each time its tab comes into view, e.g. after a review session.
 */
export function GoalBar() {
  const theme = useTheme();
  const { t } = useT();
  const load = useCallback(
    () =>
      loadGoalStatus().then(
        (data) => ({ data, error: null }),
        (reason: unknown) => ({ data: null, error: { message: String(reason) } }),
      ),
    [],
  );
  const { data: goal } = useFocusQuery(load);
  if (!goal) return null;

  const progress = Math.max(
    goalProgress(goal.todayPoints, goal.pointsGoal),
    goalProgress(goal.todayReviews, goal.goal),
  );
  return (
    <Pressable
      onPress={() => router.push('/stats')}
      accessibilityRole="button"
      accessibilityHint={t('home.today.hint')}
      style={({ pressed }) => [
        styles.bar,
        { backgroundColor: goal.metToday ? theme.successSoft : theme.tintSoft },
        pressed && styles.pressed,
      ]}>
      <View style={styles.row}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.grow}>
          🎯 {t('home.today.points', { done: goal.todayPoints, goal: goal.pointsGoal })}
          {'  ·  '}
          {t('home.today.reviews', { done: goal.todayReviews, goal: goal.goal })}
        </ThemedText>
        {goal.metToday && (
          <ThemedText type="smallBold" style={{ color: theme.success }}>
            ✓
          </ThemedText>
        )}
      </View>
      <ProgressBar value={progress} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  pressed: { opacity: 0.8 },
});
