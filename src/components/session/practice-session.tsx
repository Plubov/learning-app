import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Vibration, View } from 'react-native';

import { Button } from '@/components/button';
import { GoalCelebration } from '@/components/goal-celebration';
import { Confetti } from '@/components/session/confetti';
import {
  BuildExercise,
  ChoiceExercise,
  ClozeExercise,
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
import { filledGap, praise, type Exercise, type MatchPair } from '@/lib/exercises';
import { useT } from '@/lib/i18n';
import { speechForPage, type FlowPage } from '@/lib/lesson-flow';
import { playSound } from '@/lib/sounds';
import { speakSegments, stopSpeaking } from '@/lib/speech';
import { targetSpeech } from '@/lib/speech-text';
import { supabase } from '@/lib/supabase';
import { cleanText } from '@/lib/text';
import { deviceTimeZone } from '@/lib/time-zone';

/** An item shown on the "words" page. */
export type PracticeWord = { id: string; term: string; meaning: string };

type Props = {
  pages: FlowPage[];
  /** The lesson an item belongs to, for the learning record (reviews mix lessons). */
  lessonOf: (itemId: string) => string | undefined;
  /** The learner's language; null when unknown. */
  lang: string | null;
  /** The language being learned; null for other subjects. */
  targetLang: string | null;
  /** Read in the calm voice (study courses) instead of the lively one. */
  calm?: boolean;
  /** The headline of the result page ("Lesson complete!"). */
  resultTitle: string;
  /** The line under it when not everything was right at the first try. */
  resultText: string;
  /** Called once when the last page is done, before the result page shows. */
  onFinished: () => void;
  /** The buttons (and any message) at the bottom of the result page. */
  resultFooter: ReactNode;
  onClose: () => void;
};

/** What record_quiz_answer returns (see the points migration). */
type AnswerResult = { points: number; goal_reached: boolean };

type Verdict = { correct: boolean; title: string; answer?: string; explanation?: string };

/**
 * A session, one page at a time, used for lessons, practice and reviews:
 * introduction cards, new items and the recap are read and passed with
 * "Continue"; exercises get feedback with sound, a combo counter for answers
 * right in a row, and points. An exercise answered wrongly comes back once
 * at the end. The session ends with a result page and confetti.
 *
 * Every answer is appended to the learning record (review_events, through
 * record_quiz_answer) as structured data, so it counts towards proficiency
 * and the daily goal, and earns points by the kind of exercise (decided in
 * the database).
 */
export function PracticeSession({
  pages,
  lessonOf,
  lang,
  targetLang,
  calm,
  resultTitle,
  resultText,
  onFinished,
  resultFooter,
  onClose,
}: Props) {
  const theme = useTheme();
  const { t } = useT();
  const { sound, toggleSound } = useSoundSetting();
  const [queue, setQueue] = useState<FlowPage[]>(pages);
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
  const exerciseCount = pages.filter((p) => p.kind === 'exercise').length;

  /** Reads only what is in the language being learned (never a translation). */
  function speakTarget(text: string) {
    if (!targetLang) return;
    const spoken = targetSpeech(text, targetLang);
    if (spoken !== '') speakSegments([{ text: spoken, lang: targetLang, slow: true }]);
  }

  /** A word of the list: the term in a language course, otherwise term and meaning. */
  function speakWord(word: PracticeWord) {
    if (targetLang) speakTarget(word.term);
    else if (lang) speakSegments([{ text: `${word.term}: ${word.meaning}`, lang, calm }]);
  }

  /** What a lesson page says (cards, items, recap), each stretch in its language's voice. */
  function speakPage() {
    speakSegments(
      speechForPage(page, lang, targetLang).map((segment) => ({
        ...segment,
        slow: segment.lang === targetLang,
        calm,
      })),
    );
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
    if (page.kind === 'exercise') {
      const shown = page.exercise;
      if (shown.kind === 'listen') speakTarget(shown.term);
      // A prompt in the language being learned is read; one in the learner's language is not.
      else if (shown.kind === 'choice' || shown.kind === 'build' || shown.kind === 'cloze') speakTarget(shown.prompt);
    } else if (page.kind !== 'words') {
      // The word list is not read out: it is a look back, heard by tapping a word.
      speakPage();
    }
    // Speaks when a new page appears or sound is switched on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, sound, finished]);

  async function record(itemId: string, correct: boolean, kind: Exercise['kind'], value: string) {
    const lessonId = lessonOf(itemId);
    if (!lessonId) return;
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
      explanation: exercise.kind === 'listen' || exercise.explanation === '' ? undefined : exercise.explanation,
    });
    // Hearing the right answer once more helps it stick.
    if (sound) {
      if (exercise.kind === 'listen') speakTarget(exercise.term);
      else if (exercise.kind === 'cloze') speakTarget(filledGap(exercise.prompt, exercise.answer));
      else if (exercise.kind !== 'choice') speakTarget(exercise.answer);
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

  function go(to: number) {
    stopSpeaking();
    setIndex(to);
    setGiven(null);
    setVerdict(null);
    setShownAt(new Date().getTime());
  }

  function next() {
    if (last) {
      stopSpeaking();
      setFinished(true);
      if (sound) playSound('complete');
      Vibration.vibrate([0, 60, 80, 60]);
      pop();
      onFinished();
      return;
    }
    go(index + 1);
  }

  if (finished) {
    const perfect = exerciseCount > 0 && firstTry === exerciseCount;
    const stats = [
      ...(exerciseCount > 0 ? [{ value: `${firstTry}/${exerciseCount}`, label: t('session.firstTry') }] : []),
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
          footer={resultFooter}>
          <View style={styles.result}>
            <Animated.Text style={[styles.trophy, { transform: [{ scale }] }]}>
              {perfect ? '🏆' : '🎉'}
            </Animated.Text>
            <ThemedText type="subtitle" style={styles.center}>
              {resultTitle}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {perfect ? t('session.allRight') : resultText}
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

  // Lesson pages go back one page, as long as the page before is not an exercise.
  const previous = queue[index - 1];
  const canGoBack = page.kind !== 'exercise' && previous !== undefined && previous.kind !== 'exercise';
  let footer = null;
  if (page.kind !== 'exercise') {
    footer = (
      <>
        <Button
          title={page.kind === 'words' ? t('flow.startPractising') : last ? t('common.finish') : t('common.continue')}
          onPress={next}
        />
        {canGoBack && <Button title={t('common.back')} variant="secondary" onPress={() => go(index - 1)} />}
      </>
    );
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
  const hasSound = page.kind !== 'exercise' && page.kind !== 'words' && speechForPage(page, lang, targetLang).length > 0;

  return (
    <View style={styles.fill}>
      <SessionLayout
        progress={index / queue.length}
        sound={sound}
        onToggleSound={toggleSound}
        onClose={onClose}
        footer={footer}>
        <View style={styles.scoreRow}>
          {/* The combo: answers right in a row. */}
          {streak >= 2 && (
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              {t('session.combo', { n: streak })}
            </ThemedText>
          )}
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.points}>
            ⭐ {points}
          </ThemedText>
        </View>
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
                {page.words.map((word) => (
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

          {page.kind === 'item' && (
            <ThemedText type="smallBold" style={[styles.label, { color: theme.tint }]}>
              {t('flow.new')}
            </ThemedText>
          )}
          {(page.kind === 'step' || page.kind === 'item' || page.kind === 'recap') && (
            <ThemedView type="backgroundElement" style={styles.card}>
              {page.kind === 'step' && (
                <>
                  {page.step.title && <ThemedText style={styles.stepTitle}>{page.step.title}</ThemedText>}
                  <ThemedText style={page.step.title ? styles.stepLine : styles.stepText}>
                    {page.step.parts.map((part, i) =>
                      part.target ? (
                        <ThemedText
                          key={i}
                          style={[
                            page.step.title ? styles.stepLine : styles.stepText,
                            styles.target,
                            { color: theme.tint },
                          ]}>
                          {part.text}
                        </ThemedText>
                      ) : (
                        part.text
                      ),
                    )}
                  </ThemedText>
                  {page.step.example && (
                    <View
                      style={[styles.example, { backgroundColor: theme.background, borderLeftColor: theme.tint }]}>
                      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
                        {t('flow.example')}
                      </ThemedText>
                      <ThemedText style={styles.exampleText}>{page.step.example.text}</ThemedText>
                      {page.step.example.note !== '' && (
                        <ThemedText themeColor="textSecondary">{page.step.example.note}</ThemedText>
                      )}
                    </View>
                  )}
                </>
              )}
              {page.kind === 'item' && (
                <>
                  <ThemedText style={styles.term}>{page.item.term}</ThemedText>
                  <ThemedText style={styles.stepText}>{page.item.meaning}</ThemedText>
                  {page.item.notes && <ThemedText themeColor="textSecondary">{page.item.notes}</ThemedText>}
                </>
              )}
              {page.kind === 'recap' && (
                <>
                  <ThemedText style={styles.recapTitle}>{t('flow.recap')}</ThemedText>
                  {page.keyPoints.map((point) => (
                    <ThemedText key={point} style={styles.point}>
                      • {point}
                    </ThemedText>
                  ))}
                </>
              )}
              {hasSound && (
                <Pressable
                  onPress={speakPage}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.readAloud')}
                  hitSlop={Spacing.two}
                  style={styles.listen}>
                  <ThemedText style={styles.listenIcon}>🔊</ThemedText>
                </Pressable>
              )}
            </ThemedView>
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
              translation={exercise.translation}
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
          {exercise?.kind === 'cloze' && (
            <ClozeExercise
              prompt={exercise.prompt}
              options={exercise.options}
              answer={exercise.answer}
              translation={exercise.translation}
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
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  points: { marginLeft: 'auto' },
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
  card: {
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.three,
    minHeight: 200,
    justifyContent: 'center',
  },
  stepText: { fontSize: 22, lineHeight: 32 },
  stepTitle: { fontSize: 26, lineHeight: 34, fontWeight: 700 },
  stepLine: { fontSize: 18, lineHeight: 27 },
  example: { padding: Spacing.three, borderRadius: Spacing.two, borderLeftWidth: 4, gap: Spacing.one },
  exampleText: { fontSize: 22, lineHeight: 32, fontWeight: 700 },
  target: { fontWeight: 700 },
  term: { fontSize: 36, lineHeight: 48, fontWeight: 700 },
  recapTitle: { fontSize: 20, lineHeight: 28, fontWeight: 700 },
  point: { fontSize: 17, lineHeight: 26 },
  listen: { alignSelf: 'flex-start' },
  listenIcon: { fontSize: 24, lineHeight: 32 },
  result: { alignItems: 'center', gap: Spacing.three },
  trophy: { fontSize: 88, lineHeight: 104 },
  center: { textAlign: 'center' },
  stats: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch' },
  stat: { flex: 1, alignItems: 'center', padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
  statValue: { fontSize: 22, lineHeight: 30, fontWeight: 700 },
});
