import { Link, router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { loadHomeworkList, verdictLabel } from '@/lib/study';
import { useT } from '@/lib/i18n';

/** The homework of a study course: every solution that was scanned, newest first. */
export default function HomeworkListScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const theme = useTheme();
  const { t } = useT();
  const load = useCallback(
    () =>
      loadHomeworkList(courseId).then(
        (data) => ({ data, error: null }),
        (reason: unknown) => ({ data: null, error: { message: String(reason) } }),
      ),
    [courseId],
  );
  const { data: list, error } = useFocusQuery(load);

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        {t('homework.intro')}
      </ThemedText>
      <Button
        title={t('homework.checkNew')}
        onPress={() => router.push(`/courses/${courseId}/homework/new`)}
      />
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}

      {list?.length === 0 && (
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          {t('homework.empty')}
        </ThemedText>
      )}

      {list?.map((homework) => {
        const label = homework.result ? verdictLabel(homework.result.verdict) : null;
        const graded = homework.result && homework.result.verdict !== 'open' && homework.result.verdict !== 'unreadable';
        return (
          <Link key={homework.id} href={`/courses/${courseId}/homework/${homework.id}`} asChild>
            <Pressable accessibilityRole="button">
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText style={styles.icon}>{label?.icon ?? '⏳'}</ThemedText>
                <View style={styles.grow}>
                  <ThemedText style={styles.title} numberOfLines={2}>
                    {homework.task ?? t('homework.fromPhoto')}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {label ? t(label.title) : t('homework.notChecked')} ·{' '}
                    {new Date(homework.createdAt).toLocaleDateString()}
                  </ThemedText>
                </View>
                {graded && homework.result && (
                  <ThemedText
                    style={[styles.score, { color: label?.good ? theme.success : theme.danger }]}>
                    {homework.result.score}
                  </ThemedText>
                )}
              </ThemedView>
            </Pressable>
          </Link>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  empty: { textAlign: 'center', paddingVertical: Spacing.four },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  icon: { fontSize: 28, lineHeight: 36 },
  title: { fontSize: 16, lineHeight: 24, fontWeight: 700 },
  score: { fontSize: 24, lineHeight: 32, fontWeight: 700 },
});
