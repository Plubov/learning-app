import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CoursePath } from '@/components/course-path';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { planCourse } from '@/lib/ai';
import { stepLabel } from '@/lib/course-progress';
import { loadCourseOverview, removeSchedule, updateDeck } from '@/lib/courses';
import { daysUntil, isValidDate } from '@/lib/exam';
import { useT } from '@/lib/i18n';
import { courseWeek } from '@/lib/proficiency';

/**
 * A course: where the learner stands, the button into the next lesson, the
 * tools of the course (tutor; material and homework for study courses), and
 * the whole course as a path of stops.
 */
export default function CourseScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const theme = useTheme();
  const { t } = useT();
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // The exam date as typed; null until the learner edits it (then the stored one shows).
  const [examDraft, setExamDraft] = useState<string | null>(null);

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

  async function dropSchedule() {
    setPlanError(null);
    try {
      await removeSchedule(courseId);
      setReload((n) => n + 1);
    } catch (reason) {
      setPlanError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  /** Changes a setting of the course's deck: priority, in the daily reviews, exam date. */
  async function changeDeck(change: Parameters<typeof updateDeck>[1]) {
    if (!course?.deck) return;
    setPlanError(null);
    try {
      await updateDeck(course.deck.id, change);
      setExamDraft(null);
      setReload((n) => n + 1);
    } catch (reason) {
      setPlanError(reason instanceof Error ? reason.message : String(reason));
    }
  }

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
        {loading && <ThemedText themeColor="textSecondary">{t('common.loading')}</ThemedText>}
      </Screen>
    );
  }

  const study = course.kind === 'study';

  // No plan yet: a study course waits for its material first; otherwise
  // planning failed or was interrupted on the "new course" screen.
  if (!course.plannedAt) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('course.title') }} />
        <ThemedText style={styles.title}>{course.goal}</ThemedText>
        {study ? (
          <>
            <ThemedText themeColor="textSecondary">
              {t('course.twoSteps')}
            </ThemedText>
            <ToolCard
              icon="📚"
              title={t('course.addMaterial')}
              subtitle={t('course.addMaterialSub')}
              onPress={() => router.push(`/courses/${courseId}/materials`)}
            />
            {planning && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('course.planning')}
              </ThemedText>
            )}
            {planError && <ThemedText style={{ color: theme.danger }}>{planError}</ThemedText>}
            <Button title={t('course.createPlan2')} onPress={plan} busy={planning} />
          </>
        ) : (
          <>
            <ThemedText themeColor="textSecondary">{t('course.noPlan')}</ThemedText>
            {planError && <ThemedText style={{ color: theme.danger }}>{planError}</ThemedText>}
            <Button title={t('course.createPlan')} onPress={plan} busy={planning} />
          </>
        )}
      </Screen>
    );
  }

  const lessons = course.lessons;
  const done = lessons.filter((l) => l.completed).length;
  const next = lessons.find((l) => !l.completed) ?? null;
  const totalWeeks = lessons.reduce((max, l) => Math.max(max, l.week), 1);
  const week = Math.min(courseWeek(course.plannedAt, new Date()), totalWeeks);
  // Lessons planned for earlier weeks that are not finished yet.
  const behind = lessons.filter((l) => !l.completed && l.week < week).length;
  const deck = course.deck;
  const examText = examDraft ?? deck?.examDate ?? '';
  const examValid = examText.trim() === '' || isValidDate(examText.trim());
  const examDays = deck?.examDate ? daysUntil(deck.examDate, new Date()) : null;
  const openLesson = (lessonId: string) => router.push(`/courses/${courseId}/lessons/${lessonId}`);

  return (
    <Screen>
      <Stack.Screen options={{ title: course.title ?? t('course.title') }} />
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}

      <View style={[styles.hero, { backgroundColor: theme.hero }]}>
        <View style={styles.spread}>
          <ThemedText style={[styles.heroCount, styles.onHero]}>
            {done} / {lessons.length}
          </ThemedText>
          <ThemedText type="small" style={styles.onHero}>
            {course.scheduled ? `${t('course.week', { week, total: totalWeeks })} · ` : ''}
            {t('course.lessonsDoneLabel')}
          </ThemedText>
        </View>
        <View style={styles.heroTrack}>
          <View
            style={[styles.heroBar, { width: `${Math.round((done / Math.max(1, lessons.length)) * 100)}%` }]}
          />
        </View>
        {course.scheduled && next && (
          <ThemedText type="small" style={styles.onHero}>
            {behind > 0 ? t('course.behind', { n: behind }) : t('course.onSchedule')}
          </ThemedText>
        )}
        {next ? (
          <>
            <ThemedText style={[styles.heroNext, styles.onHero]} numberOfLines={2}>
              {t('common.lessonTitle', { n: next.position, title: next.title })}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => openLesson(next.id)}
              style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}>
              <ThemedText style={[styles.heroButtonText, { color: theme.hero }]}>
                {t(stepLabel(next.learned ? 'practise' : next.started ? 'learn' : 'start'))} ›
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <ThemedText style={[styles.heroNext, styles.onHero]}>
            {t('course.allDone')}
          </ThemedText>
        )}
      </View>

      {planError && <ThemedText style={{ color: theme.danger }}>{planError}</ThemedText>}

      <View style={styles.tools}>
        {deck && (
          <ToolCard
            icon="🗂️"
            title={t('course.flashcards')}
            subtitle={t('course.flashcardsSub')}
            onPress={() => router.push({ pathname: '/review', params: { deckId: deck.id } })}
          />
        )}
        <ToolCard
          icon="💬"
          title={t('course.tutor')}
          subtitle={t('course.tutorSub')}
          onPress={() => router.push(`/courses/${courseId}/chat`)}
        />
        {study && (
          <>
            <ToolCard
              icon="📚"
              title={t('course.material')}
              subtitle={t('course.materialSub')}
              onPress={() => router.push(`/courses/${courseId}/materials`)}
            />
            <ToolCard
              icon="📝"
              title={t('course.homework')}
              subtitle={t('course.homeworkSub')}
              onPress={() => router.push(`/courses/${courseId}/homework`)}
            />
          </>
        )}
      </View>

      {course.summary && (
        <ThemedText type="small" themeColor="textSecondary">
          {course.summary}
        </ThemedText>
      )}

      <CoursePath
        stages={course.stages}
        lessons={lessons}
        nextId={next?.id ?? null}
        onOpen={(lesson) => openLesson(lesson.id)}
      />

      {deck && (
        <ThemedView type="backgroundElement" style={styles.settings}>
          <ThemedText style={styles.toolTitle}>{t('course.settings')}</ThemedText>
          <Button
            title={deck.priority ? t('course.priorityOn') : t('course.priorityOff')}
            variant="secondary"
            onPress={() => changeDeck({ priority: !deck.priority })}
          />
          <Button
            title={deck.active ? t('course.activeOn') : t('course.activeOff')}
            variant="secondary"
            onPress={() => changeDeck({ active: !deck.active })}
          />
          <TextField
            label={t('course.exam')}
            placeholder="2027-02-14"
            value={examText}
            onChangeText={setExamDraft}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ThemedText type="small" themeColor={examValid ? 'textSecondary' : 'danger'}>
            {!examValid
              ? t('course.examInvalid')
              : examDraft === null && examDays !== null
                ? examDays > 0
                  ? t('course.examIn', { n: examDays })
                  : examDays === 0
                    ? t('course.examToday')
                    : t('course.examPast')
                : t('course.examHint')}
          </ThemedText>
          {examDraft !== null && (
            <Button
              title={t('course.examSave')}
              disabled={!examValid}
              onPress={() => changeDeck({ exam_date: examText.trim() === '' ? null : examText.trim() })}
            />
          )}
        </ThemedView>
      )}

      {course.scheduled && (
        // No AI needed for this: the lessons and their order stay as they are.
        <Button title={t('course.hideWeeks')} variant="secondary" onPress={dropSchedule} />
      )}
    </Screen>
  );
}

/** A tappable card for one of the course's tools. */
function ToolCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.tool,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <ThemedText style={styles.toolIcon}>{icon}</ThemedText>
      <View style={styles.grow}>
        <ThemedText style={styles.toolTitle}>{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {subtitle}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: 0.8 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.two },
  title: { fontSize: 22, lineHeight: 30, fontWeight: 700 },

  hero: { padding: Spacing.four, borderRadius: Spacing.four, gap: Spacing.two },
  onHero: { color: '#ffffff' },
  heroCount: { fontSize: 28, lineHeight: 36, fontWeight: 700 },
  heroTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.3)', overflow: 'hidden' },
  heroBar: { height: '100%', borderRadius: 4, backgroundColor: '#ffffff' },
  heroNext: { fontSize: 18, lineHeight: 26, fontWeight: 700, marginTop: Spacing.two },
  heroButton: {
    backgroundColor: '#ffffff',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  heroButtonText: { fontSize: 18, lineHeight: 26, fontWeight: 700 },

  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tool: {
    flexGrow: 1,
    flexBasis: 200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  toolIcon: { fontSize: 28, lineHeight: 36 },
  settings: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  toolTitle: { fontSize: 16, lineHeight: 24, fontWeight: 700 },
});
