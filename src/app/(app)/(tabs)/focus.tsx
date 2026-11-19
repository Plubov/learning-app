import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, share, todayGoalMs } from '@/lib/focus';
import { loadFocusProjects, type FocusProject } from '@/lib/focus-data';
import { useT } from '@/lib/i18n';
import { toIsoDate } from '@/lib/streak';

const MINUTE = 60_000;

/**
 * The Focus tab: every course and project with the time worked on it today
 * and this week, measured against its goals, and a button that starts the
 * timer. Only what was achieved is shown, never what is still missing.
 */
export default function FocusScreen() {
  const { t } = useT();
  const theme = useTheme();
  const load = useCallback(
    () =>
      loadFocusProjects().then(
        (data) => ({ data, error: null }),
        (reason: unknown) => ({ data: null, error: { message: String(reason) } }),
      ),
    [],
  );
  const { data: projects, error, loading } = useFocusQuery(load);
  const total = (projects ?? []).reduce((sum, p) => sum + p.weekMs, 0);

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">{t('focus.subtitle')}</ThemedText>
      {projects && projects.length > 0 && (
        <ThemedText type="smallBold">{t('focus.weekTotal', { time: formatDuration(total) })}</ThemedText>
      )}
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
      {loading && !projects && <ThemedText themeColor="textSecondary">{t('common.loading')}</ThemedText>}

      {projects?.length === 0 && (
        <ThemedView type="tintSoft" style={styles.card}>
          <ThemedText style={styles.title}>{t('focus.empty.title')}</ThemedText>
          <ThemedText themeColor="textSecondary">{t('focus.empty.text')}</ThemedText>
        </ThemedView>
      )}

      {projects?.map((project) => <ProjectCard key={project.id} project={project} />)}

      <Button title={t('focus.newProject')} variant="secondary" onPress={() => router.push('/projects/new')} />
    </Screen>
  );
}

function ProjectCard({ project }: { project: FocusProject }) {
  const { t } = useT();
  const theme = useTheme();
  const goalToday = todayGoalMs(
    project.weeklyMinutes,
    project.weekMs - project.todayMs,
    toIsoDate(new Date()),
  );
  const weekGoal = project.weeklyMinutes === null ? null : project.weeklyMinutes * MINUTE;
  const weekMet = weekGoal !== null && project.weekMs >= weekGoal;
  const icon = project.kind === 'project' ? '💼' : project.kind === 'study' ? '🎓' : '📘';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('focus.settings', { name: project.title })}
        onPress={() => router.push(`/projects/${project.id}`)}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}>
        <ThemedText style={styles.icon}>{icon}</ThemedText>
        <View style={styles.grow}>
          <ThemedText style={styles.title} numberOfLines={2}>
            {project.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {project.kind === 'project' ? t('focus.kind.project') : t('focus.kind.course')}
          </ThemedText>
        </View>
        <ThemedText style={styles.chevron} themeColor="textSecondary">
          ⚙︎
        </ThemedText>
      </Pressable>

      {goalToday !== null && goalToday > 0 ? (
        <>
          <ThemedText type="smallBold">
            {t('focus.today', { done: formatDuration(project.todayMs), goal: formatDuration(goalToday) })}
          </ThemedText>
          <ProgressBar value={share(project.todayMs, goalToday)} />
        </>
      ) : (
        <ThemedText type="smallBold">{t('focus.todayDone', { done: formatDuration(project.todayMs) })}</ThemedText>
      )}

      {weekGoal !== null ? (
        <>
          <View style={styles.spread}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('focus.week', { done: formatDuration(project.weekMs), goal: formatDuration(weekGoal) })}
            </ThemedText>
            {weekMet && (
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                {t('focus.weekGoalMet')}
              </ThemedText>
            )}
          </View>
          <ProgressBar value={share(project.weekMs, weekGoal)} />
        </>
      ) : (
        <View style={styles.spread}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('focus.weekDone', { done: formatDuration(project.weekMs) })}
          </ThemedText>
          <Pressable
            accessibilityRole="link"
            hitSlop={Spacing.two}
            onPress={() => router.push(`/projects/${project.id}`)}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              {t('focus.setGoal')}
            </ThemedText>
          </Pressable>
        </View>
      )}

      <Button title={t('focus.workNow')} onPress={() => router.push(`/timer/${project.id}`)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pressed: { opacity: 0.7 },
  grow: { flex: 1 },
  icon: { fontSize: 28, lineHeight: 36 },
  title: { fontSize: 18, lineHeight: 26, fontWeight: 700 },
  chevron: { fontSize: 20, lineHeight: 28 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});
