import { useCallback, useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Vibration, View } from 'react-native';

import { Button } from '@/components/button';
import { GoalCelebration } from '@/components/goal-celebration';
import { Confetti } from '@/components/session/confetti';
import {
  BuildExercise,
  ChoiceExercise,
  MatchExercise,
  TypedExercise,
} from '@/components/session/exercises';
import { FeedbackBar } from '@/components/session/feedback-bar';
import { Appear, usePop } from '@/components/session/motion';
import { SessionLayout } from '@/components/session/session-layout';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSoundSetting } from '@/hooks/use-sound-setting';
import { useTheme } from '@/hooks/use-theme';
import { getDeviceId } from '@/lib/device-id';
import { useT } from '@/lib/i18n';
import { praise, type Exercise, type MatchPair } from '@/lib/exercises';
import { playSound } from '@/lib/sounds';
import { speakSegments, stopSpeaking } from '@/lib/speech';
import { targetSpeech } from '@/lib/speech-text';
import { supabase } from '@/lib/supabase';
import { cleanText } from '@/lib/text';
import { deviceTimeZone } from '@/lib/time-zone';

/** An item of the lesson, shown once more before the exercises. */
export type PracticeWord = { id: string; term: string; meaning: string };

type Props = {
  lessonId: string;
  words: PracticeWord[];
  exercises: Exercise[];
  /** The learner's language; null when unknown. */
  lang: string | null;
  /** The language being learned; null for other subjects. */
  targetLang: string | null;
  /** Read in the calm voice (study courses) instead of the lively one. */
  calm?: boolean;
  /** Whether finishing this session completes the lesson for the first time. */
  completesLesson: boolean;
  /** Called once when the last exercise is done, before the result page shows. */
  onFinished: () => void;
  /** "New exercises": the screen makes a new session and replaces this one. */
  onAgain: () => void;
  againBusy: boolean;
  againError: string | null;
  onClose: () => void;
};

type Page =
  /** The lesson's items at a glance, before the first exercise. */
  | { kind: 'words' }
  /** `retry`: asked a second time at the end, after a wrong answer. */
  | { kind: 'exercise'; exercise: Exercise; retry: boolean };

/** What record_quiz_answer returns (see the points migration). */
type AnswerResult = { points: number; goal_reached: boolean };

type Verdict = { correct: boolean; title: string; answer?: string; explanation?: string };

/**
 * A practice session, one page at a time: first the lesson's items once more
 * on a single page, then the exercises with feedback after each, then the
 * result with a celebration.
 * An exercise answered wrongly comes back once at the end. Every answer is
 * appended to the learning record (review_events, through
 * record_quiz_answer) as structured data, so it counts towards proficiency,
 * and earns points by the kind of exercise (decided in the database).
 */
export function PracticeSession({
  lessonId,
  words,
  exercises,
  lang,
  targetLang,
  calm,
  completesLesson,
  onFinished,
  onAgain,
  againBusy,
  againError,
  onClose,
}: Props) {
  const theme = useTheme();
  const { t } = useT();
  const { sound, toggleSound } = useSoundSetting();
  const [queue, setQueue] = useState<Page[]>(() => [
    ...(words.length > 0 ? [{ kind: 'words' } as Page] : []),
    ...exercises.map((exercise): Page => ({ kind: 'exercise', exercise, retry: false })),
  ]);
  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [firstTry, setFirstTry] = useState(0); // exercises right at the first attempt
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [points, setPoints] = useState(0); // earned in this session
  const [goalReached, setGoalReached] = useState(false);
  // Stable function, so the running celebration is not restarted on re-render.
  const endCelebration = useCallback(() => setGoalReached(false), []);
  // When the current page appeared, for the answer time.
  const [shownAt, setShownAt] = useState(() => new Date().getTime());
  const { scale, pop } = usePop();

  const page = queue[index];
  const last = index === queue.length - 1;
  const exercise = page.kind === 'exercise' ? page.exercise : null;

  /** Reads only what is in the language being learned (never a translation). */
  function speakTarget(text: string) {
    if (!targetLang) return;
    const korean = targetSpeech(text, targetLang);
    if (korean !== '') speakSegments([{ text: korean, lang: targetLang, slow: true }]);
  }

  /** A word of the list: the term in a language course, otherwise term and meaning. */
  function speakWord(word: PracticeWord) {
    if (targetLang) speakTarget(word.term);
    else if (lang) speakSegments([{ text: `${word.term}: ${word.meaning}`, lang, calm }]);
  }

  useEffect(
    () => () => {
      stopSpeaking();
    },
    [],
  );

  // What is heard when a page appears.
  useEffect(() => {
    if (!sound || finished) return;
    // The word list is not read out: it is a look back, heard by tapping a word.
    if (page.kind === 'exercise' && page.exercise.kind === 'listen') {
      speakTarget(page.exercise.term);
    }
    // Speaks when a new page appears or sound is switched on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, sound, finished]);

  async function record(itemId: string, correct: boolean, kind: Exercise['kind'], value: string) {
    const now = new Date();
    const { data, error } = await supabase.rpc('record_quiz_answer', {
      p_lesson_id: lessonId,
      p_item_id: itemId,
      p_correct: correct,
      p_response: {
        type: kind === 'typed' || kind === 'build' ? 'text' : 'choice',
        value: cleanText(value),
        exercise: kind,
      },
      p_reviewed_at: now.toISOString(),
      p_duration_ms: now.getTime() - shownAt,
      p_device_id: await getDeviceId(),
      p_time_zone: deviceTimeZone(),
    });
    // jsonb arrives typed only as "Json"; its shape is fixed by the migration.
    const result = data as unknown as AnswerResult | null;
    if (result) {
      // Added to the latest value: answers to pairs can arrive close together.
      setPoints((sum) => sum + result.points);
      if (result.goal_reached) setGoalReached(true);
    }
    setSaveError(error ? t('session.saveError', { message: error.message }) : null);
  }

  /** Sound, vibration and score for a finished exercise. */
  function settle(correct: boolean, result: Verdict) {
    if (sound) playSound(correct ? 'correct' : 'wrong');
    if (!correct) Vibration.vibrate(60);
    const nextStreak = correct ? streak + 1 : 0;
    setStreak(nextStreak);
    setBestStreak(Math.max(bestStreak, nextStreak));
    if (correct && page.kind === 'exercise' && !page.retry) setFirstTry(firstTry + 1);
    setVerdict({
      ...result,
      title:
        correct && nextStreak >= 3
          ? t('feedback.inARow', { title: result.title, n: nextStreak })
          : result.title,
    });
  }

  function answer(value: string, correct: boolean) {
    if (!exercise || exercise.kind === 'match' || verdict) return;
    setGiven(value);
    record(exercise.itemId, correct, exercise.kind, value);
    const comesBack = !correct && page.kind === 'exercise' && !page.retry;
    if (comesBack) setQueue([...queue, { kind: 'exercise', exercise, retry: true }]);
    settle(correct, {
      correct,
      title: t(correct ? praise() : comesBack ? 'feedback.comesBack' : 'feedback.notQuite'),
      answer: correct ? undefined : exercise.answer,
      explanation: exercise.kind === 'listen' ? undefined : exercise.explanation,
    });
    // Hearing the right answer once more helps it stick.
    if (sound && exercise.kind !== 'choice') {
      speakTarget(exercise.kind === 'listen' ? exercise.term : exercise.answer);
    }
  }

  function pairTried(pair: MatchPair, meaning: string, correct: boolean) {
    record(pair.itemId, correct, 'match', meaning);
    if (sound) playSound(correct ? 'correct' : 'wrong');
    if (!correct) Vibration.vibrate(60);
  }

  function pairsDone(mistakes: number) {
    const correct = mistakes === 0;
    // The pairs already made their sounds; only the score is settled here.
    const nextStreak = correct ? streak + 1 : 0;
    setStreak(nextStreak);
    setBestStreak(Math.max(bestStreak, nextStreak));
    if (correct) setFirstTry(firstTry + 1);
    setVerdict({
      correct: true,
      title: correct ? t('feedback.allPairs') : t('feedback.pairsSlips', { n: mistakes }),
    });
  }

  function next() {
    stopSpeaking();
    if (last) {
      setFinished(true);
      if (sound) playSound('complete');
      Vibration.vibrate([0, 60, 80, 60]);
      pop();
      onFinished();
      return;
    }
    setIndex(index + 1);
    setGiven(null);
    setVerdict(null);
    setShownAt(new Date().getTime());
  }

  if (finished) {
    const total = exercises.length;
    const stats = [
      { value: `${firstTry}/${total}`, label: t('session.firstTry') },
      { value: `🔥 ${bestStreak}`, label: t('session.bestStreak') },
      { value: `⭐ ${points}`, label: t('session.points') },
    ];
    return (
      <View style={styles.fill}>
        <SessionLayout
          progress={1}
          sound={sound}
          onToggleSound={toggleSound}
          onClose={onClose}
          footer={
            <>
              {againError && <ThemedText style={{ color: theme.danger }}>{againError}</ThemedText>}
              {againBusy && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('session.writingNew')}
                </ThemedText>
              )}
              <Button title={t('common.continue')} tone="success" onPress={onClose} disabled={againBusy} />
              <Button title={t('session.again')} variant="secondary" onPress={onAgain} busy={againBusy} />
            </>
          }>
          <View style={styles.result}>
            <Animated.Text style={[styles.trophy, { transform: [{ scale }] }]}>
              {firstTry === total ? '🏆' : '🎉'}
            </Animated.Text>
            <ThemedText type="subtitle" style={styles.center}>
              {completesLesson ? t('session.lessonComplete') : t('session.practiceComplete')}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {firstTry === total ? t('session.allRight') : t('session.inReviews')}
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
        </SessionLayout>
        <Confetti />
        {goalReached && <GoalCelebration streak={null} onDone={endCelebration} />}
      </View>
    );
  }

  let footer = null;
  if (page.kind === 'words') {
    footer = <Button title={t('flow.startPractising')} onPress={next} />;
  } else if (verdict) {
    footer = (
      <>
        {saveError && <ThemedText style={{ color: theme.danger }}>{saveError}</ThemedText>}
        <FeedbackBar
          {...verdict}
          buttonTitle={last ? t('common.finish') : t('common.continue')}
          onContinue={next}
        />
      </>
    );
  }

  return (
    <View style={styles.fill}>
      <SessionLayout
        progress={index / queue.length}
        sound={sound}
        onToggleSound={toggleSound}
        onClose={onClose}
        footer={footer}>
        {page.kind === 'exercise' && (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.points}>
            ⭐ {points}
          </ThemedText>
        )}
        <Appear key={index} style={styles.page}>
        {page.kind === 'words' && (
          <>
            <ThemedText style={styles.wordsTitle}>{t('session.wordsTitle')}</ThemedText>
            {(targetLang ?? lang) && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('session.wordsHint')}
              </ThemedText>
            )}
            <View style={styles.words}>
              {words.map((word) => (
                <Pressable
                  key={word.id}
                  onPress={() => speakWord(word)}
                  accessibilityRole="button"
                  accessibilityLabel={`${word.term}: ${word.meaning}`}
                  style={({ pressed }) => [
                    styles.word,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.dimmed,
                  ]}>
                  <ThemedText style={[styles.wordTerm, { color: theme.tint }]}>{word.term}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.wordMeaning}>
                    {word.meaning}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {page.kind === 'exercise' && page.retry && (
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            {t('session.onceMore')}
          </ThemedText>
        )}
        {exercise?.kind === 'choice' && (
          <ChoiceExercise
            instruction={t('ex.choose')}
            prompt={exercise.prompt}
            options={exercise.options}
            answer={exercise.answer}
            given={given}
            onAnswer={answer}
          />
        )}
        {exercise?.kind === 'listen' && (
          <ChoiceExercise
            instruction={t('ex.hear')}
            options={exercise.options}
            answer={exercise.answer}
            onListen={() => speakTarget(exercise.term)}
            given={given}
            onAnswer={answer}
          />
        )}
        {exercise?.kind === 'typed' && (
          <TypedExercise
            prompt={exercise.prompt}
            answer={exercise.answer}
            korean={targetLang === 'ko'}
            given={given}
            onAnswer={answer}
          />
        )}
        {exercise?.kind === 'build' && (
          <BuildExercise
            prompt={exercise.prompt}
            tiles={exercise.tiles}
            answer={exercise.answer}
            given={given}
            onAnswer={answer}
          />
        )}
        {exercise?.kind === 'match' && (
          <MatchExercise
            pairs={exercise.pairs}
            meanings={exercise.meanings}
            onPair={pairTried}
            onDone={pairsDone}
          />
        )}
        </Appear>
      </SessionLayout>
      {goalReached && <GoalCelebration streak={null} onDone={endCelebration} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  points: { alignSelf: 'flex-end' },
  page: { gap: Spacing.three },
  label: { textTransform: 'uppercase', letterSpacing: 0.5 },
  wordsTitle: { fontSize: 26, lineHeight: 34, fontWeight: 700 },
  words: { gap: Spacing.two },
  word: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  wordTerm: { flex: 1, fontSize: 20, lineHeight: 28, fontWeight: 700 },
  wordMeaning: { flex: 1, textAlign: 'right' },
  dimmed: { opacity: 0.6 },
  result: { alignItems: 'center', gap: Spacing.three },
  trophy: { fontSize: 88, lineHeight: 104 },
  center: { textAlign: 'center' },
  stats: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch' },
  stat: { flex: 1, alignItems: 'center', padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
  statValue: { fontSize: 22, lineHeight: 30, fontWeight: 700 },
});
