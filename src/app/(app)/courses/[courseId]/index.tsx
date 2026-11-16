import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { planCourse } from '@/lib/ai';
import { loadCourseOverview, type CourseLesson } from '@/lib/courses';
import { courseWeek } from '@/lib/proficiency';

function lessonStatus(lesson: CourseLesson): string {
  if (lesson.completed) return `Done · ${Math.round(lesson.proficiency * 100)}%`;
  if (lesson.started) return 'Started';
  return '';
}

export default function CourseScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const theme = useTheme();
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(
    () =>
      loadCourseOverview(courseId).then(
        (data) => ({ data, error: null }),
        (reason: unknown) => ({ data: null, error: { message: String(reason) } }),
      ),
    // `reload` is not read inside: changing it re-runs the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseId, reload],
  );
  const { data: course, error, loading } = useFocusQuery(load);

  async function plan() {
    setPlanning(true);
    setPlanError(null);
    try {
      await planCourse(courseId);
      setReload((n) => n + 1);
    } catch (reason) {
      setPlanError(reason instanceof Error ? reason.message : String(reason));
    }
    setPlanning(false);
  }

  if (!course) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
        {loading && <ThemedText themeColor="textSecondary">Loading…</ThemedText>}
      </Screen>
    );
  }

  // Planning failed or was interrupted on the "new course" screen.
  if (!course.plannedAt) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Course' }} />
        <ThemedText>{course.goal}</ThemedText>
        <ThemedText themeColor="textSecondary">This course has no plan yet.</ThemedText>
        {planError && <ThemedText style={{ color: theme.danger }}>{planError}</ThemedText>}
        <Button title="Create my plan" onPress={plan} busy={planning} />
      </Screen>
    );
  }

  const lessons = course.lessons;
  const done = lessons.filter((l) => l.completed).length;
  const next = lessons.find((l) => !l.completed);
  const totalWeeks = lessons.reduce((max, l) => Math.max(max, l.week), 1);
  const week = Math.min(courseWeek(course.plannedAt, new Date()), totalWeeks);
  // Lessons planned for earlier weeks that are not finished yet.
  const behind = lessons.filter((l) => !l.completed && l.week < week).length;

  return (
    <Screen>
      <Stack.Screen options={{ title: course.title ?? 'Course' }} />
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}

      {course.summary && <ThemedText>{course.summary}</ThemedText>}

      <ThemedView type="backgroundElement" style={styles.box}>
        <View style={styles.spread}>
          <ThemedText type="smallBold">
            Week {week} of {totalWeeks}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {done} of {lessons.length} lessons done
          </ThemedText>
        </View>
        <ProgressBar value={lessons.length === 0 ? 0 : done / lessons.length} />
        {next && (
          <ThemedText type="small" themeColor="textSecondary">
            {behind > 0
              ? `${behind} ${behind === 1 ? 'lesson' : 'lessons'} from earlier weeks still open.`
              : 'You are on schedule.'}
          </ThemedText>
        )}
      </ThemedView>

      {next ? (
        <Button
          title={`${next.started ? 'Continue' : 'Start'}: ${next.title}`}
          onPress={() => router.push(`/courses/${courseId}/lessons/${next.id}`)}
        />
      ) : (
        <ThemedText type="smallBold">All lessons done. Keep up the reviews.</ThemedText>
      )}
      <Button
        title="Ask the tutor or change the plan"
        variant="secondary"
        onPress={() => router.push(`/courses/${courseId}/chat`)}
      />

      {course.stages.map((stage, stageIndex) => (
        <View key={stageIndex} style={styles.stage}>
          <ThemedText type="smallBold">
            {stageIndex + 1}. {stage.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {stage.outcome}
          </ThemedText>
          {lessons
            // A lesson kept from an older plan may point past the end of a
            // shorter new roadmap; it is then shown in the last stage.
            .filter((lesson) => Math.min(lesson.stage, course.stages.length - 1) === stageIndex)
            .map((lesson) => (
              <Link key={lesson.id} href={`/courses/${courseId}/lessons/${lesson.id}`} asChild>
                <Pressable accessibilityRole="button">
                  <ThemedView
                    type="backgroundElement"
                    style={[
                      styles.box,
                      lesson.id === next?.id && { borderColor: theme.tint, borderWidth: 2 },
                    ]}>
                    <View style={styles.spread}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Week {lesson.week}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {lessonStatus(lesson)}
                      </ThemedText>
                    </View>
                    <ThemedText type="smallBold">{lesson.title}</ThemedText>
                    {lesson.started && <ProgressBar value={lesson.proficiency} />}
                  </ThemedView>
                </Pressable>
              </Link>
            ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.two },
  spread: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.two },
  stage: { gap: Spacing.two, marginTop: Spacing.two },
});
