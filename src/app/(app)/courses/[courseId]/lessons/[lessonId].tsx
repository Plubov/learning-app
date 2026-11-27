import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { PracticeSession } from '@/components/session/practice-session';
import { TalkSession } from '@/components/session/talk-session';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { generatePractice, prepareConversation, prepareLesson } from '@/lib/ai';
import type { StoredConversation } from '@/lib/course-content';
import { loadLessonDetail, markLessonLearned, type LessonDetail } from '@/lib/courses';
import { buildExercises } from '@/lib/exercises';
import { useT } from '@/lib/i18n';
import { buildFlow, explanationSteps, type FlowPage } from '@/lib/lesson-flow';
import { proficiencyLevel } from '@/lib/proficiency';
import { supabase } from '@/lib/supabase';

/**
 * What the screen shows. The lesson page is a short overview; learning and
 * practising each open as a full-screen session, one page at a time. A
 * session's pages are built once when it opens (they are shuffled), so a
 * reload of the lesson in the background cannot reorder them.
 */
type View_ =
  | { kind: 'overview' }
  | {
      kind: 'learn' | 'practice';
      /** Changes with every new session, so its state starts fresh. */
      key: number;
      pages: FlowPage[];
      lang: string | null;
      /** Practice only: finishing it completes the lesson for the first time. */
      completesLesson: boolean;
    }
  | { kind: 'talk'; key: number; conversation: StoredConversation };

type Working = 'prepare' | 'practice' | 'talk' | null;

/**
 * A lesson. The template is the same for every lesson:
 *   1. goals   2. Learn: the guided run (introduction steps, new items,
 *   quick checks)   3. Practice: the items once more, then exercises for the
 *   learner's level   4. the words of the lesson with their proficiency.
 * AI only fills the slots: the introduction and items once (on "Start
 * lesson"), the questions each time new practice is requested.
 */
export default function LessonScreen() {
  const { courseId, lessonId } = useLocalSearchParams<{ courseId: string; lessonId: string }>();
  const theme = useTheme();
  const { t } = useT();
  const [reload, setReload] = useState(0);
  const [working, setWorking] = useState<Working>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [view, setView] = useState<View_>({ kind: 'overview' });

  const load = useCallback(
    () =>
      loadLessonDetail(lessonId).then(
        (data) => ({ data, error: null }),
        (reason: unknown) => ({ data: null, error: { message: String(reason) } }),
      ),
    // `reload` is not read inside: changing it re-runs the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessonId, reload],
  );
  const { data: lesson, error, loading } = useFocusQuery(load);

  function openLearn(from: LessonDetail) {
    if (!from.explanation) return;
    setView({
      kind: 'learn',
      key: new Date().getTime(),
      pages: buildFlow(from.explanation, from.items, from.targetLang),
      lang: explanationSteps(from.explanation).lang,
      completesLesson: false,
    });
  }

  function openPractice(from: LessonDetail) {
    if (!from.practice) return;
    const exercises = buildExercises(from.practice.questions, from.items, from.targetLang);
    if (exercises.length === 0) return;
    setView({
      kind: 'practice',
      key: new Date().getTime(),
      pages: [
        { kind: 'words', words: from.items.map(({ id, term, meaning }) => ({ id, term, meaning })) },
        ...exercises.map((exercise) => ({ kind: 'exercise' as const, exercise, retry: false })),
      ],
      lang: from.explanation ? explanationSteps(from.explanation).lang : null,
      completesLesson: !from.completed,
    });
  }

  function openTalk(from: LessonDetail) {
    if (!from.conversation) return;
    setView({ kind: 'talk', key: new Date().getTime(), conversation: from.conversation });
  }

  /** Runs an AI task, then opens the session it was for with the fresh lesson. */
  async function runAi(kind: 'prepare' | 'practice' | 'talk', call: () => Promise<void>) {
    setWorking(kind);
    setAiError(null);
    try {
      await call();
      const fresh = await loadLessonDetail(lessonId);
      if (kind === 'prepare') openLearn(fresh);
      else if (kind === 'talk') openTalk(fresh);
      else openPractice(fresh);
      setReload((n) => n + 1);
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : String(reason));
    }
    setWorking(null);
  }

  function newPractice(from: LessonDetail) {
    const proficiency = Object.fromEntries(from.items.map((item) => [item.id, item.proficiency]));
    runAi('practice', () => generatePractice(from.id, proficiency));
  }

  function newTalk(from: LessonDetail) {
    runAi('talk', () => prepareConversation(from.id));
  }

  async function practiceFinished() {
    // The first finished practice completes the lesson; later ones leave the date.
    const { error: saveError } = await supabase
      .from('lessons')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', lessonId)
      .is('completed_at', null);
    if (saveError) setAiError(saveError.message);
    setReload((n) => n + 1); // fresh proficiency
  }

  function closeSession() {
    setView({ kind: 'overview' });
    setReload((n) => n + 1);
  }

  if (!lesson) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
        {loading && <ThemedText themeColor="textSecondary">{t('common.loading')}</ThemedText>}
      </Screen>
    );
  }

  if (view.kind === 'learn') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <PracticeSession
          key={view.key}
          pages={view.pages}
          lessonOf={() => lesson.id}
          lang={view.lang}
          targetLang={lesson.targetLang}
          calm={lesson.study}
          resultTitle={t('session.lessonLearned')}
          resultText={t('session.inReviews')}
          // Reaching the end is what counts as learned; closing early does not.
          onFinished={() =>
            markLessonLearned(lesson.id).then(
              () => setReload((n) => n + 1),
              (reason: unknown) => setAiError(reason instanceof Error ? reason.message : String(reason)),
            )
          }
          resultFooter={
            <>
              <Button
                title={t('flow.startPractising')}
                tone="success"
                onPress={() => {
                  closeSession();
                  if (lesson.practice && !lesson.completed) openPractice(lesson);
                  else newPractice(lesson);
                }}
              />
              <Button title={t('flow.later')} variant="secondary" onPress={closeSession} />
            </>
          }
          onClose={closeSession}
        />
      </>
    );
  }

  if (view.kind === 'practice') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <PracticeSession
          key={view.key}
          pages={view.pages}
          lessonOf={() => lesson.id}
          lang={view.lang}
          targetLang={lesson.targetLang}
          calm={lesson.study}
          resultTitle={view.completesLesson ? t('session.lessonComplete') : t('session.practiceComplete')}
          resultText={t('session.inReviews')}
          onFinished={practiceFinished}
          resultFooter={
            <>
              {aiError && <ThemedText style={{ color: theme.danger }}>{aiError}</ThemedText>}
              {working === 'practice' && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('session.writingNew')}
                </ThemedText>
              )}
              <Button
                title={t('common.continue')}
                tone="success"
                onPress={closeSession}
                disabled={working === 'practice'}
              />
              <Button
                title={t('session.again')}
                variant="secondary"
                onPress={() => newPractice(lesson)}
                busy={working === 'practice'}
              />
            </>
          }
          onClose={closeSession}
        />
      </>
    );
  }

  if (view.kind === 'talk' && lesson.targetLang) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <TalkSession
          key={view.key}
          lessonId={lesson.id}
          conversation={view.conversation}
          targetLang={lesson.targetLang}
          onFinished={() => setReload((n) => n + 1)}
          resultFooter={
            <>
              {aiError && <ThemedText style={{ color: theme.danger }}>{aiError}</ThemedText>}
              {working === 'talk' && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('talk.writing')}
                </ThemedText>
              )}
              <Button title={t('common.continue')} tone="success" onPress={closeSession} disabled={working === 'talk'} />
              <Button
                title={t('talk.again')}
                variant="secondary"
                onPress={() => newTalk(lesson)}
                busy={working === 'talk'}
              />
            </>
          }
          onClose={closeSession}
        />
      </>
    );
  }

  const stepCount = lesson.explanation ? explanationSteps(lesson.explanation).steps.length : 0;
  return (
    <Screen>
      <Stack.Screen options={{ title: lesson.title, headerShown: true }} />
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}

      <ThemedText>{lesson.summary}</ThemedText>
      <ThemedView type="backgroundElement" style={styles.box}>
        <ThemedText type="smallBold">{t('lesson.objectives')}</ThemedText>
        {lesson.objectives.map((objective) => (
          <ThemedText key={objective}>• {objective}</ThemedText>
        ))}
      </ThemedView>

      {aiError && <ThemedText style={{ color: theme.danger }}>{aiError}</ThemedText>}

      {!lesson.started && (
        <>
          {working === 'prepare' && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('lesson.preparing')}
            </ThemedText>
          )}
          <Button
            title={t('step.start')}
            onPress={() => runAi('prepare', () => prepareLesson(lesson.id))}
            busy={working === 'prepare'}
          />
        </>
      )}

      {lesson.started && (
        <>
          <ActionCard
            icon={lesson.learned ? '✅' : '📖'}
            title={lesson.learned ? t('lesson.learnAgain') : t('lesson.learn')}
            subtitle={`${lesson.learned ? t('lesson.doneMark') : ''}${t('lesson.learnSub', {
              steps: stepCount,
              items: lesson.items.length,
            })}`}
            highlighted={!lesson.learned && !lesson.completed}
            onPress={() => openLearn(lesson)}
            disabled={working !== null}
          />
          <ActionCard
            icon={lesson.completed ? '✅' : '💪'}
            title={lesson.completed ? t('lesson.practiseAgain') : t('lesson.practise')}
            subtitle={
              working === 'practice'
                ? t('lesson.writing')
                : lesson.completed
                  ? t('lesson.practiseSubDone')
                  : t('lesson.practiseSub')
            }
            highlighted={lesson.learned && !lesson.completed}
            busy={working === 'practice'}
            disabled={working !== null}
            // A finished lesson gets fresh exercises; an open one continues
            // with the exercises already written for it.
            onPress={() =>
              lesson.practice && !lesson.completed ? openPractice(lesson) : newPractice(lesson)
            }
          />
          {lesson.targetLang && (
            <ActionCard
              icon="🗣️"
              title={t('talk.title')}
              subtitle={working === 'talk' ? t('talk.writing') : t('talk.sub')}
              busy={working === 'talk'}
              disabled={working !== null}
              // The conversation already written is kept until a new one is asked for.
              onPress={() => (lesson.conversation ? openTalk(lesson) : newTalk(lesson))}
            />
          )}

          <View style={styles.section}>
            <ThemedText type="smallBold">{t('lesson.inThis')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('lesson.inReviews')}
            </ThemedText>
            {lesson.items.map((item) => (
              <ThemedView key={item.id} type="backgroundElement" style={styles.item}>
                <View style={styles.spread}>
                  <ThemedText style={styles.itemTerm}>{item.term}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t(`level.${proficiencyLevel(item.proficiency)}`)}
                  </ThemedText>
                </View>
                <ThemedText themeColor="textSecondary">{item.meaning}</ThemedText>
                <ProgressBar value={item.proficiency} />
              </ThemedView>
            ))}
          </View>

          <Button
            title={t('lesson.backToCourse')}
            variant="secondary"
            onPress={() => router.dismissTo(`/courses/${courseId}`)}
          />
        </>
      )}
    </Screen>
  );
}

/** A large tappable card that opens a session. */
function ActionCard({
  icon,
  title,
  subtitle,
  onPress,
  highlighted,
  busy,
  disabled,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  highlighted?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: theme.backgroundElement, borderColor: highlighted ? theme.tint : theme.border },
        (pressed || (disabled && !busy)) && styles.dimmed,
      ]}>
      <ThemedText style={styles.actionIcon}>{icon}</ThemedText>
      <View style={styles.grow}>
        <ThemedText style={styles.actionTitle}>{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      </View>
      {busy ? (
        <ActivityIndicator color={theme.tint} />
      ) : (
        <ThemedText style={styles.chevron} themeColor="textSecondary">
          ›
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  box: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
  item: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  itemTerm: { flex: 1, fontSize: 18, lineHeight: 26, fontWeight: 700 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  grow: { flex: 1 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  actionIcon: { fontSize: 32, lineHeight: 40 },
  actionTitle: { fontSize: 18, lineHeight: 26, fontWeight: 700 },
  chevron: { fontSize: 28, lineHeight: 32 },
  dimmed: { opacity: 0.6 },
});
