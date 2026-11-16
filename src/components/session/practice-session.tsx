import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Vibration, View } from 'react-native';

import { Button } from '@/components/button';
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

export type PracticeExample = { text: string; explanation: string };

type Props = {
  lessonId: string;
  examples: PracticeExample[];
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
  | { kind: 'example'; example: PracticeExample }
  /** `retry`: asked a second time at the end, after a wrong answer. */
  | { kind: 'exercise'; exercise: Exercise; retry: boolean };

type Verdict = { correct: boolean; title: string; answer?: string; explanation?: string };

/**
 * A practice session, one page at a time: first the fresh examples, then the
 * exercises with feedback after each, then the result with a celebration.
 * An exercise answered wrongly comes back once at the end. Every answer is
 * appended to the learning record (review_events, through
 * record_quiz_answer) as structured data, so it counts towards proficiency.
 */
export function PracticeSession({
  lessonId,
  examples,
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
    ...examples.map((example): Page => ({ kind: 'example', example })),
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

  /**
   * An example: in a language course only its sentence in the language
   * being learned; in other courses the whole example, calmly for study courses.
   */
  function speakExample(text: string) {
    if (targetLang) speakTarget(text);
    else if (lang) speakSegments([{ text, lang, calm }]);
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
    if (page.kind === 'example') {
      speakExample(page.example.text);
    } else if (page.exercise.kind === 'listen') {
      speakTarget(page.exercise.term);
    }
    // Speaks when a new page appears or sound is switched on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, sound, finished]);

  async function record(itemId: string, correct: boolean, kind: Exercise['kind'], value: string) {
    const now = new Date();
    const { error } = await supabase.rpc('record_quiz_answer', {
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
    });
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
      { value: `${total === 0 ? 100 : Math.round((firstTry / total) * 100)}%`, label: t('session.accuracy') },
      { value: `🔥 ${bestStreak}`, label: t('session.bestStreak') },
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
      </View>
    );
  }

  let footer = null;
  if (page.kind === 'example') {
    footer = <Button title={t('common.continue')} onPress={next} />;
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
    <SessionLayout
      progress={index / queue.length}
      sound={sound}
      onToggleSound={toggleSound}
      onClose={onClose}
      footer={footer}>
      <Appear key={index} style={styles.page}>
        {page.kind === 'example' && (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
              {t('session.example')}
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.example}>
              <ThemedText style={styles.exampleText}>{page.example.text}</ThemedText>
              {page.example.explanation !== '' && (
                <ThemedText themeColor="textSecondary">{page.example.explanation}</ThemedText>
              )}
              {(targetLang ?? lang) && (
                <Pressable
                  onPress={() => {
                    speakExample(page.example.text);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.readAloud')}
                  hitSlop={Spacing.two}
                  style={styles.replay}>
                  <ThemedText style={styles.replayIcon}>🔊</ThemedText>
                </Pressable>
              )}
            </ThemedView>
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
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { gap: Spacing.three },
  label: { textTransform: 'uppercase', letterSpacing: 0.5 },
  example: { padding: Spacing.four, borderRadius: Spacing.three, gap: Spacing.three },
  exampleText: { fontSize: 22, lineHeight: 32, fontWeight: 600 },
  replay: { alignSelf: 'flex-start' },
  replayIcon: { fontSize: 24, lineHeight: 32 },
  result: { alignItems: 'center', gap: Spacing.three },
  trophy: { fontSize: 88, lineHeight: 104 },
  center: { textAlign: 'center' },
  stats: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch' },
  stat: { flex: 1, alignItems: 'center', padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
  statValue: { fontSize: 22, lineHeight: 30, fontWeight: 700 },
});
