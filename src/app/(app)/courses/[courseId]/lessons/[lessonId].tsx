import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { LessonQuiz } from '@/components/lesson-quiz';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { generatePractice, prepareLesson } from '@/lib/ai';
import { loadLessonDetail } from '@/lib/courses';
import { proficiencyLevel } from '@/lib/proficiency';
import { supabase } from '@/lib/supabase';

/**
 * A lesson. The layout is a fixed template, the same for every lesson:
 *   1. goals   2. explanation   3. the items to learn   4. examples   5. quiz
 * AI only fills the slots: the explanation and items once (on "Start
 * lesson"), examples and quiz each time practice is requested, based on the
 * learner's current proficiency per item.
 */
export default function LessonScreen() {
  const { courseId, lessonId } = useLocalSearchParams<{ courseId: string; lessonId: string }>();
  const theme = useTheme();
  const [reload, setReload] = useState(0);
  const [working, setWorking] = useState<'prepare' | 'practice' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<'idle' | 'running'>('idle');
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null);

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

  async function runAi(kind: 'prepare' | 'practice', call: () => Promise<void>) {
    setWorking(kind);
    setAiError(null);
    try {
      await call();
      setReload((n) => n + 1);
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : String(reason));
    }
    setWorking(null);
  }

  function newPractice() {
    if (!lesson) return;
    const proficiency = Object.fromEntries(lesson.items.map((item) => [item.id, item.proficiency]));
    setScore(null);
    setQuiz('idle');
    runAi('practice', () => generatePractice(lesson.id, proficiency));
  }

  async function finishQuiz(correct: number, total: number) {
    setScore({ correct, total });
    setQuiz('idle');
    // The first finished quiz completes the lesson; later ones leave the date.
    const { error: saveError } = await supabase
      .from('lessons')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', lessonId)
      .is('completed_at', null);
    if (saveError) setAiError(saveError.message);
    setReload((n) => n + 1); // fresh proficiency
  }

  if (!lesson) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
        {loading && <ThemedText themeColor="textSecondary">Loading…</ThemedText>}
      </Screen>
    );
  }

  const practice = lesson.practice;
  return (
    <Screen>
      <Stack.Screen options={{ title: lesson.title }} />
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}

      <ThemedText>{lesson.summary}</ThemedText>
      <View style={styles.section}>
        <ThemedText type="smallBold">After this lesson you can</ThemedText>
        {lesson.objectives.map((objective) => (
          <ThemedText key={objective}>• {objective}</ThemedText>
        ))}
      </View>

      {!lesson.started && (
        <>
          {working === 'prepare' && (
            <ThemedText type="small" themeColor="textSecondary">
              Preparing the lesson. This happens once and takes a few seconds.
            </ThemedText>
          )}
          {aiError && <ThemedText style={{ color: theme.danger }}>{aiError}</ThemedText>}
          <Button
            title="Start lesson"
            onPress={() => runAi('prepare', () => prepareLesson(lesson.id))}
            busy={working === 'prepare'}
          />
        </>
      )}

      {lesson.explanation && (
        <>
          <View style={styles.section}>
            {lesson.explanation.intro.split(/\n+/).map((paragraph, i) => (
              <ThemedText key={i}>{paragraph}</ThemedText>
            ))}
          </View>
          <View style={styles.section}>
            <ThemedText type="smallBold">Key points</ThemedText>
            {lesson.explanation.key_points.map((point) => (
              <ThemedText key={point}>• {point}</ThemedText>
            ))}
          </View>
        </>
      )}

      {lesson.started && (
        <View style={styles.section}>
          <ThemedText type="smallBold">To remember</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            These are now in your daily reviews as cards.
          </ThemedText>
          {lesson.items.map((item) => (
            <ThemedView key={item.id} type="backgroundElement" style={styles.box}>
              <View style={styles.spread}>
                <ThemedText type="smallBold" style={styles.grow}>
                  {item.term}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {proficiencyLevel(item.proficiency)}
                </ThemedText>
              </View>
              <ThemedText>{item.meaning}</ThemedText>
              {item.notes && (
                <ThemedText type="small" themeColor="textSecondary">
                  {item.notes}
                </ThemedText>
              )}
            </ThemedView>
          ))}
        </View>
      )}

      {lesson.started && (
        <View style={styles.section}>
          <ThemedText type="smallBold">Practice</ThemedText>

          {practice && quiz === 'idle' && practice.examples.length > 0 && (
            <>
              {practice.examples.map((example) => (
                <ThemedView key={example.text} type="backgroundElement" style={styles.box}>
                  <ThemedText>{example.text}</ThemedText>
                  {example.explanation !== '' && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {example.explanation}
                    </ThemedText>
                  )}
                </ThemedView>
              ))}
            </>
          )}

          {practice && quiz === 'running' && (
            <LessonQuiz
              lessonId={lesson.id}
              questions={practice.questions}
              targetLang={lesson.targetLang}
              onFinished={finishQuiz}
            />
          )}

          {score && (
            <ThemedText type="smallBold">
              {score.correct} of {score.total} correct.
              {lesson.completed ? ' Lesson done ✓' : ''}
            </ThemedText>
          )}
          {working === 'practice' && (
            <ThemedText type="small" themeColor="textSecondary">
              Writing examples and questions for your current level…
            </ThemedText>
          )}
          {aiError && <ThemedText style={{ color: theme.danger }}>{aiError}</ThemedText>}

          {quiz === 'idle' && (
            <>
              {practice && !score && (
                <Button
                  title={`Start quiz (${practice.questions.length} questions)`}
                  onPress={() => setQuiz('running')}
                  disabled={working !== null}
                />
              )}
              <Button
                title={practice ? 'New practice for my level' : 'Create practice'}
                variant={practice && !score ? 'secondary' : 'primary'}
                onPress={newPractice}
                busy={working === 'practice'}
              />
              {score && (
                <Button
                  title="Back to the course"
                  variant="secondary"
                  onPress={() => router.dismissTo(`/courses/${courseId}`)}
                />
              )}
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  box: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.one },
  spread: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  grow: { flex: 1 },
});
