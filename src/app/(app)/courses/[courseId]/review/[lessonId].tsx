import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { PracticeSession } from '@/components/session/practice-session';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { loadReviewData, markReviewDone, type ReviewData } from '@/lib/courses';
import { buildReviewExercises, REVIEW_ITEMS } from '@/lib/exercises';
import { useT } from '@/lib/i18n';
import type { FlowPage } from '@/lib/lesson-flow';

type Session = { data: ReviewData; pages: FlowPage[]; lessonOf: Map<string, string> };

/**
 * A review stop of the course path (after every third lesson): exercises on
 * the weakest items of all lessons so far, made from questions already
 * written for them, so no AI is needed. Full screen, like a lesson.
 * `lessonId` is the lesson the stop follows.
 */
export default function ReviewStopScreen() {
  const { courseId, lessonId } = useLocalSearchParams<{ courseId: string; lessonId: string }>();
  const theme = useTheme();
  const { t } = useT();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadReviewData(courseId, lessonId).then(
      (data) => {
        if (!active) return;
        const exercises = buildReviewExercises(data.items, data.questions, data.targetLang);
        // The words being reviewed, weakest first, as a look back before the exercises.
        const words = [...data.items].sort((a, b) => a.proficiency - b.proficiency).slice(0, REVIEW_ITEMS);
        setSession({
          data,
          pages:
            exercises.length === 0
              ? []
              : [
                  { kind: 'words', words: words.map(({ id, term, meaning }) => ({ id, term, meaning })) },
                  ...exercises.map((exercise) => ({ kind: 'exercise' as const, exercise, retry: false })),
                ],
          lessonOf: new Map(data.items.map((item) => [item.id, item.lessonId])),
        });
      },
      (reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [courseId, lessonId]);

  if (!session || session.pages.length === 0) {
    return (
      <Screen>
        {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
        {!session && !error && <ThemedText themeColor="textSecondary">{t('common.loading')}</ThemedText>}
        {session && <ThemedText themeColor="textSecondary">{t('stop.nothing')}</ThemedText>}
        <Button title={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <PracticeSession
      pages={session.pages}
      lessonOf={(itemId) => session.lessonOf.get(itemId)}
      lang={session.data.lang}
      targetLang={session.data.targetLang}
      calm={session.data.study}
      resultTitle={t('stop.done')}
      resultText={t('stop.text')}
      onFinished={() => markReviewDone(lessonId).catch((reason: unknown) => setError(String(reason)))}
      resultFooter={
        <>
          {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
          <Button title={t('common.continue')} tone="success" onPress={() => router.back()} />
        </>
      }
      onClose={() => router.back()}
    />
  );
}
