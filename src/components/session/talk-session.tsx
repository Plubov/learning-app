import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Vibration, View } from 'react-native';

import { Button } from '@/components/button';
import { GoalCelebration } from '@/components/goal-celebration';
import { KoreanTextField } from '@/components/korean-text-field';
import { Confetti } from '@/components/session/confetti';
import { FeedbackBar } from '@/components/session/feedback-bar';
import { Appear, usePop, useNativeDriver } from '@/components/session/motion';
import { ResultSummary } from '@/components/session/result-summary';
import { SessionLayout } from '@/components/session/session-layout';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSoundSetting } from '@/hooks/use-sound-setting';
import { useTheme } from '@/hooks/use-theme';
import type { StoredConversation } from '@/lib/course-content';
import { getDeviceId } from '@/lib/device-id';
import { praise } from '@/lib/exercises';
import { useT } from '@/lib/i18n';
import { playSound } from '@/lib/sounds';
import { speakSegments, stopSpeaking } from '@/lib/speech';
import { canListen, startListening, type Listening } from '@/lib/speech-recognition';
import { targetSpeech } from '@/lib/speech-text';
import { supabase } from '@/lib/supabase';
import { judgeAnswer, type Judgement } from '@/lib/talk';
import { cleanText } from '@/lib/text';
import { deviceTimeZone } from '@/lib/time-zone';

type Props = {
  lessonId: string;
  conversation: StoredConversation;
  /** The language being learned ('ko', ...). */
  targetLang: string;
  /** Called once when the last turn is done, before the result page shows. */
  onFinished: () => void;
  /** The buttons at the bottom of the result page. */
  resultFooter: ReactNode;
  onClose: () => void;
};

/** A turn tries this many times before it moves on. */
const ATTEMPTS = 2;

/** What happens in the current turn; `attempts` counts the answers judged so far. */
type Phase =
  | { kind: 'answering'; attempts: number }
  | { kind: 'listening'; attempts: number }
  | { kind: 'judged'; judgement: Judgement; attempts: number; gaveUp: boolean };

/** What record_quiz_answer returns (see the points migration). */
type AnswerResult = { points: number; goal_reached: boolean };

/**
 * A simulated conversation: the partner says a line (read aloud), the
 * learner answers by speaking, where the browser can recognise speech, or
 * by typing. The app compares the answer with the answers that fit
 * (src/lib/talk.ts); a wrong one may be tried once more. Earlier turns stay
 * on screen as chat bubbles, and the session ends with the result page.
 * Every answer is stored like a practice answer (exercise "talk").
 */
export function TalkSession({ lessonId, conversation, targetLang, onFinished, resultFooter, onClose }: Props) {
  const theme = useTheme();
  const { t } = useT();
  const { sound, toggleSound } = useSoundSetting();
  const { scale, pop } = usePop();
  const micAvailable = canListen();
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'answering', attempts: 0 });
  const [typing, setTyping] = useState(!micAvailable);
  const [typed, setTyped] = useState('');
  const [showTranslation, setShowTranslation] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [micMessage, setMicMessage] = useState<string | null>(null);
  // The answers given so far, shown as the learner's bubbles.
  const [said, setSaid] = useState<string[]>([]);
  const [firstTry, setFirstTry] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [points, setPoints] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [goalReached, setGoalReached] = useState(false);
  const endCelebration = useCallback(() => setGoalReached(false), []);
  const [shownAt, setShownAt] = useState(() => new Date().getTime());
  const listening = useRef<Listening | null>(null);

  const turns = conversation.turns;
  const turn = turns[index];
  const last = index === turns.length - 1;

  function speakTarget(text: string) {
    const spoken = targetSpeech(text, targetLang);
    if (spoken !== '') speakSegments([{ text: spoken, lang: targetLang, slow: true }]);
  }

  // The partner speaks when the turn appears.
  useEffect(() => {
    if (started && !finished && sound) speakTarget(turn.partner);
    // Speaks when a new turn appears or sound is switched on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, index, sound, finished]);

  useEffect(
    () => () => {
      listening.current?.stop();
      stopSpeaking();
    },
    [],
  );

  // The microphone button breathes while listening.
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (phase.kind !== 'listening') return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver }),
        Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [phase.kind, pulse]);

  async function record(correct: boolean, value: string, spoken: boolean) {
    const now = new Date();
    const { data, error } = await supabase.rpc('record_quiz_answer', {
      p_lesson_id: lessonId,
      p_item_id: turn.item_id,
      p_correct: correct,
      p_response: { type: spoken ? 'speech' : 'text', value: cleanText(value), exercise: 'talk' },
      p_reviewed_at: now.toISOString(),
      p_duration_ms: now.getTime() - shownAt,
      p_device_id: await getDeviceId(),
      p_time_zone: deviceTimeZone(),
    });
    // jsonb arrives typed only as "Json"; its shape is fixed by the migration.
    const result = data as unknown as AnswerResult | null;
    if (result) {
      setPoints((sum) => sum + result.points);
      if (result.goal_reached) setGoalReached(true);
    }
    setSaveError(error ? t('session.saveError', { message: error.message }) : null);
  }

  /** Judges what was said or typed (several alternatives from the recogniser). */
  function judge(heard: string[], spoken: boolean) {
    const judgement = judgeAnswer(heard, turn.answers);
    const attempts = phase.attempts + 1;
    setPhase({ kind: 'judged', judgement, attempts, gaveUp: false });
    record(judgement.correct, judgement.heard, spoken);
    if (sound) playSound(judgement.correct ? 'correct' : 'wrong');
    if (!judgement.correct) Vibration.vibrate(60);
    const nextStreak = judgement.correct ? streak + 1 : 0;
    setStreak(nextStreak);
    setBestStreak(Math.max(bestStreak, nextStreak));
    if (judgement.correct && attempts === 1) setFirstTry(firstTry + 1);
    // Hearing the answer that fits helps when it was not right.
    if (!judgement.correct && sound) speakTarget(judgement.closest);
  }

  function listen() {
    stopSpeaking();
    setMicMessage(null);
    const session = startListening(targetLang, {
      onResult: (alternatives) => {
        listening.current = null;
        judge(alternatives, true);
      },
      onEnd: () => {
        listening.current = null;
        setPhase((current) =>
          current.kind === 'listening' ? { kind: 'answering', attempts: current.attempts } : current,
        );
      },
      onError: (reason) => {
        listening.current = null;
        if (reason === 'denied') {
          setMicMessage(t('talk.micDenied'));
          setTyping(true);
        } else {
          setMicMessage(t(reason === 'silence' ? 'talk.silence' : 'talk.micError'));
        }
      },
    });
    if (!session) {
      setTyping(true);
      return;
    }
    listening.current = session;
    setPhase({ kind: 'listening', attempts: phase.attempts });
  }

  function giveUp() {
    listening.current?.stop();
    const judgement: Judgement = { correct: false, closest: turn.answers[0], heard: '', score: 0 };
    setPhase({ kind: 'judged', judgement, attempts: ATTEMPTS, gaveUp: true });
    record(false, '', false);
    setStreak(0);
    if (sound) speakTarget(turn.answers[0]);
  }

  /** Back to answering, keeping the count of attempts. */
  function tryAgain() {
    setTyped('');
    setPhase({ kind: 'answering', attempts: phase.attempts });
  }

  function next() {
    stopSpeaking();
    if (phase.kind === 'judged') {
      setSaid([...said, phase.judgement.correct ? phase.judgement.heard : phase.judgement.closest]);
    }
    if (last) {
      setFinished(true);
      if (sound) playSound('complete');
      Vibration.vibrate([0, 60, 80, 60]);
      pop();
      onFinished();
      return;
    }
    setIndex(index + 1);
    setPhase({ kind: 'answering', attempts: 0 });
    setTyped('');
    setShowTranslation(false);
    setShowHint(false);
    setMicMessage(null);
    setShownAt(new Date().getTime());
  }

  const header = (progress: number, footer: ReactNode, children: ReactNode) => (
    <View style={styles.fill}>
      <SessionLayout progress={progress} sound={sound} onToggleSound={toggleSound} onClose={onClose} footer={footer}>
        {children}
      </SessionLayout>
      {goalReached && <GoalCelebration streak={null} onDone={endCelebration} />}
    </View>
  );

  if (finished) {
    return (
      <View style={styles.fill}>
        {header(
          1,
          resultFooter,
          <ResultSummary
            perfect={firstTry === turns.length}
            title={t('talk.done')}
            text={firstTry === turns.length ? t('session.allRight') : t('talk.doneText')}
            stats={[
              { value: `${firstTry}/${turns.length}`, label: t('session.firstTry') },
              { value: `🔥 ${bestStreak}`, label: t('session.bestStreak') },
              { value: `⭐ ${points}`, label: t('session.points') },
            ]}
            scale={scale}
          />,
        )}
        <Confetti />
      </View>
    );
  }

  if (!started) {
    return header(
      0,
      <Button title={t('talk.start')} tone="success" onPress={() => setStarted(true)} />,
      <Appear style={styles.page}>
        <ThemedText style={styles.sceneIcon}>🎭</ThemedText>
        <ThemedText style={styles.scenario}>{conversation.scenario}</ThemedText>
        <ThemedText themeColor="textSecondary">{t('talk.partner', { name: conversation.partner })}</ThemedText>
        <ThemedView type="tintSoft" style={styles.note}>
          <ThemedText>{micAvailable ? t('talk.micNote') : t('talk.typeNote')}</ThemedText>
        </ThemedView>
      </Appear>,
    );
  }

  const judged = phase.kind === 'judged' ? phase : null;
  const canRetry = judged !== null && !judged.judgement.correct && !judged.gaveUp && judged.attempts < ATTEMPTS;

  let footer: ReactNode = null;
  if (judged) {
    footer = (
      <>
        {saveError && <ThemedText style={{ color: theme.danger }}>{saveError}</ThemedText>}
        {canRetry && <Button title={t('talk.tryAgain')} variant="secondary" onPress={tryAgain} />}
        <FeedbackBar
          correct={judged.judgement.correct}
          title={
            judged.judgement.correct
              ? streak >= 3
                ? t('feedback.inARow', { title: t(praise()), n: streak })
                : t(praise())
              : t('feedback.notQuite')
          }
          answer={judged.judgement.correct ? undefined : judged.judgement.closest}
          buttonTitle={last ? t('common.finish') : t('common.continue')}
          onContinue={next}
        />
      </>
    );
  } else if (typing) {
    const submit = () => {
      if (cleanText(typed) !== '') judge([typed], false);
    };
    const Field = targetLang === 'ko' ? KoreanTextField : TextField;
    footer = (
      <>
        <Field
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={submit}
          placeholder={t('talk.typeHere')}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          submitBehavior="submit"
        />
        <Button title={t('common.check')} onPress={submit} disabled={cleanText(typed) === ''} />
        <View style={styles.links}>
          {micAvailable && (
            <Pressable onPress={() => setTyping(false)} accessibilityRole="button" hitSlop={Spacing.two}>
              <ThemedText type="small" style={{ color: theme.tint }}>
                🎙️ {t('talk.speakInstead')}
              </ThemedText>
            </Pressable>
          )}
          <Pressable onPress={giveUp} accessibilityRole="button" hitSlop={Spacing.two}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('review.dontKnow')}
            </ThemedText>
          </Pressable>
        </View>
      </>
    );
  } else {
    const isListening = phase.kind === 'listening';
    footer = (
      <View style={styles.micArea}>
        {micMessage && <ThemedText style={{ color: theme.danger }}>{micMessage}</ThemedText>}
        <Pressable
          onPress={() => (isListening ? listening.current?.stop() : listen())}
          accessibilityRole="button"
          accessibilityLabel={isListening ? t('talk.stop') : t('talk.speak')}
          style={({ pressed }) => pressed && styles.pressed}>
          <Animated.View
            style={[
              styles.mic,
              {
                backgroundColor: isListening ? theme.danger : theme.tint,
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
              },
            ]}>
            <ThemedText style={styles.micIcon}>🎙️</ThemedText>
          </Animated.View>
        </Pressable>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {isListening ? t('talk.listening') : phase.attempts > 0 ? t('talk.speakAgain') : t('talk.speak')}
        </ThemedText>
        <View style={styles.links}>
          <Pressable onPress={() => setTyping(true)} accessibilityRole="button" hitSlop={Spacing.two}>
            <ThemedText type="small" style={{ color: theme.tint }}>
              ⌨️ {t('talk.typeInstead')}
            </ThemedText>
          </Pressable>
          <Pressable onPress={giveUp} accessibilityRole="button" hitSlop={Spacing.two}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('review.dontKnow')}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  return header(
    (index + (judged ? 1 : 0)) / turns.length,
    footer,
    <>
      <View style={styles.scoreRow}>
        {streak >= 2 && (
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            {t('session.combo', { n: streak })}
          </ThemedText>
        )}
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.points}>
          ⭐ {points}
        </ThemedText>
      </View>

      {/* The conversation so far, as chat bubbles. */}
      {turns.slice(0, index).map((earlier, i) => (
        <View key={i} style={styles.history}>
          <Bubble side="partner" text={earlier.partner} />
          {said[i] !== undefined && <Bubble side="me" text={said[i]} />}
        </View>
      ))}

      <Appear key={index} style={styles.page}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
          {conversation.partner}
        </ThemedText>
        <ThemedView type="backgroundElement" style={styles.line}>
          <ThemedText style={styles.lineText}>{turn.partner}</ThemedText>
          {showTranslation && <ThemedText themeColor="textSecondary">{turn.partner_translation}</ThemedText>}
          <View style={styles.links}>
            <Pressable
              onPress={() => speakTarget(turn.partner)}
              accessibilityRole="button"
              accessibilityLabel={t('ex.playAgain')}
              hitSlop={Spacing.two}>
              <ThemedText style={styles.replay}>🔊</ThemedText>
            </Pressable>
            {!showTranslation && (
              <Pressable onPress={() => setShowTranslation(true)} accessibilityRole="button" hitSlop={Spacing.two}>
                <ThemedText type="small" style={{ color: theme.tint }}>
                  {t('talk.translate')}
                </ThemedText>
              </Pressable>
            )}
          </View>
        </ThemedView>

        {showHint || judged ? (
          <ThemedText themeColor="textSecondary">💡 {turn.hint}</ThemedText>
        ) : (
          <Pressable onPress={() => setShowHint(true)} accessibilityRole="button" hitSlop={Spacing.two}>
            <ThemedText type="small" style={{ color: theme.tint }}>
              💡 {t('talk.hint')}
            </ThemedText>
          </Pressable>
        )}

        {judged && judged.judgement.heard !== '' && <Bubble side="me" text={judged.judgement.heard} />}
      </Appear>
    </>,
  );
}

function Bubble({ side, text }: { side: 'partner' | 'me'; text: string }) {
  const mine = side === 'me';
  return (
    <ThemedView
      type={mine ? 'tintSoft' : 'backgroundElement'}
      style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      <ThemedText>{text}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { gap: Spacing.three },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  points: { marginLeft: 'auto' },
  label: { textTransform: 'uppercase', letterSpacing: 0.5 },
  sceneIcon: { fontSize: 64, lineHeight: 80, textAlign: 'center' },
  scenario: { fontSize: 22, lineHeight: 32, fontWeight: 700, textAlign: 'center' },
  note: { padding: Spacing.three, borderRadius: Spacing.three },
  history: { gap: Spacing.two, opacity: 0.7 },
  bubble: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Spacing.three, maxWidth: '85%' },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  line: { padding: Spacing.four, borderRadius: Spacing.four, gap: Spacing.two },
  lineText: { fontSize: 24, lineHeight: 34, fontWeight: 700 },
  replay: { fontSize: 24, lineHeight: 32 },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
  micArea: { alignItems: 'center', gap: Spacing.two },
  mic: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  micIcon: { fontSize: 40, lineHeight: 52 },
  pressed: { opacity: 0.75 },
});
