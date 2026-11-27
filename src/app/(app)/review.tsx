import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { GoalCelebration } from '@/components/goal-celebration';
import { Screen } from '@/components/screen';
import { KoreanTextField } from '@/components/korean-text-field';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadGoalStatus } from '@/lib/daily-goal';
import { getDeviceId } from '@/lib/device-id';
import { examSettings } from '@/lib/exam';
import { useT } from '@/lib/i18n';
import type { TextKey } from '@/lib/i18n/en';
import { isDueInSession, withoutListening } from '@/lib/review-session';
import {
  createScheduler,
  formatInterval,
  previewIntervals,
  REVIEW_RATINGS,
  reviewCard,
  type ReviewRating,
  type Scheduler,
} from '@/lib/scheduling';
import { loadSessionCards, type SessionCard } from '@/lib/session-cards';
import { getAutoplay, setAutoplay, speakKorean, stopSpeaking } from '@/lib/speech';
import { supabase } from '@/lib/supabase';
import { answersMatch, cleanText } from '@/lib/text';
import { deviceTimeZone } from '@/lib/time-zone';

const RATING_LABELS: Record<ReviewRating, TextKey> = {
  1: 'review.again',
  2: 'review.hard',
  3: 'review.good',
  4: 'review.easy',
};
/** The rating recorded for "I don't know". */
const AGAIN: ReviewRating = 1;
/** New words per deck added by "Learn more", beyond today's limit. */
const STUDY_MORE_COUNT = 10;

/** What is known once the answer side is showing. */
type Revealed = {
  intervals: Record<ReviewRating, number>;
  /**
   * Production cards only: what was typed and whether it matched.
   * `dontKnow`: "I don't know" was pressed instead of typing.
   */
  typed: { value: string; correct: boolean; dontKnow: boolean } | null;
};

/** What record_review returns (see count_activity in the points migration). */
type ReviewResult = { reviews_today: number; goal: number; points: number; goal_reached: boolean };

/** Shown while the celebration is up; streak is null until it has loaded. */
type Celebration = { streak: number | null };

export default function ReviewScreen() {
  const theme = useTheme();
  const { t } = useT();
  // With a deck id only that deck is studied; without, all active decks.
  const { deckId } = useLocalSearchParams<{ deckId?: string }>();
  const [scheduler, setScheduler] = useState<Scheduler | null>(null);
  // Schedulers with exam settings, by exam date: cards of a deck with an
  // exam ahead are scheduled with a shorter maximum interval (see exam.ts).
  const [examSchedulers, setExamSchedulers] = useState<Record<string, Scheduler>>({});
  const [queue, setQueue] = useState<SessionCard[] | null>(null); // null = loading
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [answer, setAnswer] = useState('');
  const [shownAt, setShownAt] = useState(0); // when the current card appeared
  const [saving, setSaving] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [points, setPoints] = useState(0); // earned in this session
  const [autoplay, setAutoplayState] = useState<boolean | null>(null); // null = loading
  // 0 = today's limit only; STUDY_MORE_COUNT after "Learn more".
  const [extraNew, setExtraNew] = useState(0);
  const [loadNumber, setLoadNumber] = useState(0); // increased to reload the queue
  const [moreNewAvailable, setMoreNewAvailable] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  // "Can't listen right now": listening cards taken out of this session.
  // Nothing is recorded for them, so they stay due for the next session.
  const [skippedListening, setSkippedListening] = useState<SessionCard[]>([]);
  // Read by the loading effect, so "Learn more" also leaves them out.
  const skipListeningRef = useRef(false);
  // Stable function, so the running animation is not restarted on re-render.
  const endCelebration = useCallback(() => setCelebration(null), []);

  function celebrate() {
    setCelebration({ streak: null });
    loadGoalStatus().then(
      (status) => setCelebration((c) => c && { streak: status.streak }),
      () => {}, // the message still shows, only without the streak number
    );
  }

  useEffect(() => {
    getAutoplay().then(setAutoplayState, () => setAutoplayState(true));
    return () => {
      stopSpeaking(); // no voice after leaving the screen
    };
  }, []);

  // Korean is on screen (or is the question): the front of a recognition or
  // listening card, or a production card after "Check". Read it aloud once
  // each time that happens.
  const current = queue?.[0];
  const koreanShown =
    current !== undefined && (current.card_type !== 'production' || revealed !== null);
  const currentTerm = current?.item.term;
  // Reading aloud and the Korean keyboard are for Korean decks only; cards
  // of other decks (e.g. a course on another subject) are plain text.
  const currentIsKorean = current?.item.target_lang === 'ko';
  useEffect(() => {
    if (autoplay && koreanShown && currentTerm && currentIsKorean) speakKorean(currentTerm);
  }, [autoplay, koreanShown, currentTerm, currentIsKorean, shownAt]);

  function toggleAutoplay() {
    const next = !autoplay;
    setAutoplayState(next);
    setAutoplay(next);
    if (!next) stopSpeaking();
  }

  useEffect(() => {
    let active = true;
    const now = new Date();
    Promise.all([createScheduler(), loadSessionCards(extraNew, deckId)])
      .then(async ([newScheduler, session]) => {
        const dates = [...new Set(session.cards.map((c) => c.item.exam_date))];
        const forExams: Record<string, Scheduler> = {};
        for (const date of dates) {
          const settings = examSettings(date, now);
          if (date && settings) forExams[date] = await createScheduler(settings);
        }
        return [newScheduler, session, forExams] as const;
      })
      .then(
      ([newScheduler, session, forExams]) => {
        if (!active) return;
        setScheduler(newScheduler);
        setExamSchedulers(forExams);
        if (skipListeningRef.current) {
          const { kept, skipped } = withoutListening(session.cards);
          setQueue(kept);
          setSkippedListening((before) => addCards(before, skipped));
        } else {
          setQueue(session.cards);
        }
        setMoreNewAvailable(session.moreNewAvailable);
        setShownAt(new Date().getTime());
      },
      (reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [extraNew, loadNumber, deckId]);

  function studyMore() {
    setQueue(null); // shows "Loading…" while the next words are fetched
    setError(null);
    // Each press asks for STUDY_MORE_COUNT words beyond those introduced so
    // far today (the ones just learned already count as introduced).
    setExtraNew(STUDY_MORE_COUNT);
    setLoadNumber((n) => n + 1);
  }

  /** Takes every listening card out of this session (see skippedListening). */
  function skipListening() {
    if (!queue) return;
    stopSpeaking();
    skipListeningRef.current = true;
    const { kept, skipped } = withoutListening(queue);
    setSkippedListening(addCards(skippedListening, skipped));
    setQueue(kept);
    setRevealed(null);
    setAnswer('');
    setError(null);
    setShownAt(new Date().getTime());
  }

  /** Puts the skipped listening cards back, at the end of this session. */
  function listenAfterAll() {
    skipListeningRef.current = false;
    setQueue([...(queue ?? []), ...skippedListening]);
    setSkippedListening([]);
    setShownAt(new Date().getTime());
  }

  if (error && !queue) {
    return (
      <Screen>
        <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>
      </Screen>
    );
  }
  if (!queue || !scheduler) {
    return (
      <Screen>
        <ThemedText themeColor="textSecondary">{t('common.loading')}</ThemedText>
      </Screen>
    );
  }

  // Over every screen state below: the goal may be reached by the last card.
  const overlay = celebration && (
    <GoalCelebration streak={celebration.streak} onDone={endCelebration} />
  );

  const card = queue[0];
  if (!card) {
    return (
      <View style={styles.fill}>
        <Screen>
          <ThemedText type="subtitle">{t('review.done')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {doneCount === 0 ? t('review.noneDue') : t('review.summary', { n: doneCount, points })}
            {moreNewAvailable && ` ${t('review.newDone')}`}
          </ThemedText>
          {skippedListening.length > 0 && (
            <>
              <ThemedText themeColor="textSecondary">
                {skippedListening.length === 1
                  ? t('review.listeningSaved1')
                  : t('review.listeningSaved', { n: skippedListening.length })}
              </ThemedText>
              <Button
                title={t('review.canListen')}
                variant="secondary"
                onPress={listenAfterAll}
              />
            </>
          )}
          {moreNewAvailable && (
            <Button title={t('review.learnMore', { n: STUDY_MORE_COUNT })} onPress={studyMore} />
          )}
          <Button
            title={t('common.back')}
            variant={moreNewAvailable ? 'secondary' : 'primary'}
            onPress={() => router.back()}
          />
        </Screen>
        {overlay}
      </View>
    );
  }

  const isProduction = card.card_type === 'production';
  const isListening = card.card_type === 'listening';
  /**
   * Only production cards (meaning → Korean) are typed and checked. A
   * listening card asks for the meaning of what is heard and is self-graded,
   * like recognition: typing what you hear would be the production card's
   * task a second time.
   */
  const typesAnswer = isProduction;

  const listenButton = (large: boolean) => (
    <Pressable
      onPress={() => speakKorean(card.item.term)}
      accessibilityRole="button"
      accessibilityLabel={t('review.listenButton')}
      hitSlop={Spacing.two}
      style={({ pressed }) => pressed && styles.dimmed}>
      <ThemedText style={large ? styles.listenLarge : styles.listen}>🔊</ThemedText>
    </Pressable>
  );

  const isKorean = card.item.target_lang === 'ko';
  const AnswerField = isKorean ? KoreanTextField : TextField;
  let instruction = t('review.whatMeans');
  if (isProduction) instruction = t(isKorean ? 'review.typeKorean' : 'review.typeTerm');
  if (isListening) instruction = t('review.listen');

  /** The scheduler for a card: its deck's exam settings when an exam is ahead. */
  const schedulerFor = (c: SessionCard) => examSchedulers[c.item.exam_date ?? ''] ?? scheduler;

  /** Shows the answer side; `dontKnow` when "I don't know" was pressed instead of typing. */
  function reveal(dontKnow = false) {
    if (!scheduler || !card) return;
    setRevealed({
      intervals: previewIntervals(schedulerFor(card), card, new Date()),
      typed: typesAnswer
        ? dontKnow
          ? { value: '', correct: false, dontKnow: true }
          : { value: cleanText(answer), correct: answersMatch(answer, card.item.term), dontKnow: false }
        : null,
    });
  }

  async function rate(rating: ReviewRating) {
    if (!scheduler || !card || !queue || !revealed) return;
    const now = new Date();
    const schedule = reviewCard(schedulerFor(card), card, rating, now);

    setSaving(true);
    setError(null);
    const { data, error } = await supabase.rpc('record_review', {
      p_card_id: card.id,
      p_rating: rating,
      p_reviewed_at: now.toISOString(),
      p_schedule: schedule,
      p_duration_ms: now.getTime() - shownAt,
      p_device_id: await getDeviceId(),
      p_time_zone: deviceTimeZone(),
      // Recognition and listening are self-graded: no typed answer, correctness not checked.
      ...(revealed.typed && {
        p_correct: revealed.typed.correct,
        p_response: revealed.typed.dontKnow
          ? { type: 'dont_know' }
          : { type: 'text', value: revealed.typed.value },
      }),
    });
    setSaving(false);
    if (error) {
      setError(error.message); // the card stays, so the rating can be retried
      return;
    }
    // jsonb arrives typed only as "Json"; its shape is fixed by the migration.
    const result = data as unknown as ReviewResult | null;
    if (result) setPoints(points + result.points);
    if (result?.goal_reached) celebrate();

    const rest = queue.slice(1);
    // "Again" and learning steps are due within minutes: show them again at the end.
    setQueue(isDueInSession(schedule.due_at, now) ? [...rest, { ...card, ...schedule }] : rest);
    setDoneCount(doneCount + 1);
    setRevealed(null);
    setAnswer('');
    setShownAt(new Date().getTime());
  }

  return (
    <View style={styles.fill}>
      <Screen>
        <View style={styles.topRow}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('review.left', { n: queue.length })} · ⭐ {points}
          </ThemedText>
          {autoplay !== null && (
            <Pressable onPress={toggleAutoplay} accessibilityRole="button" hitSlop={Spacing.two}>
              <ThemedText type="small" themeColor="textSecondary">
                {t(autoplay ? 'review.autoOn' : 'review.autoOff')}
              </ThemedText>
            </Pressable>
          )}
        </View>
        <ThemedText type="smallBold" style={styles.instruction}>
          {instruction}
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          {isListening ? (
            listenButton(true)
          ) : (
            <ThemedText style={styles.prompt}>
              {isProduction ? card.item.meaning : card.item.term}
            </ThemedText>
          )}
          {card.card_type === 'recognition' && isKorean && listenButton(false)}

          {revealed && (
            <>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <ThemedText style={styles.prompt}>
                {isProduction || isListening ? card.item.term : card.item.meaning}
              </ThemedText>
              {/* The meaning is the answer; the Korean shows what was heard. */}
              {isListening && <ThemedText style={styles.meaning}>{card.item.meaning}</ThemedText>}
              {isProduction && isKorean && listenButton(false)}
              {revealed.typed && (
                <ThemedText
                  style={{ color: revealed.typed.correct ? theme.tint : theme.danger }}>
                  {revealed.typed.dontKnow
                    ? t('review.notKnown')
                    : revealed.typed.correct
                      ? t('review.correct')
                      : t('review.youTyped', {
                          value: revealed.typed.value === '' ? t('ex.nothing') : revealed.typed.value,
                        })}
                </ThemedText>
              )}
              {card.item.notes && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.notes}>
                  {card.item.notes}
                </ThemedText>
              )}
            </>
          )}
        </ThemedView>

        {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}

        {!revealed && typesAnswer && (
          <AnswerField
            key={card.id} // a fresh, focused input for every card
            placeholder={isKorean ? '한국어' : t('ex.yourAnswer')}
            value={answer}
            onChangeText={setAnswer}
            onSubmitEditing={() => reveal()}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            submitBehavior="submit"
          />
        )}
        {!revealed && (
          <Button
            title={typesAnswer ? t('common.check') : t('review.showAnswer')}
            onPress={() => reveal()}
          />
        )}
        {!revealed && typesAnswer && (
          <Button title={t('review.dontKnow')} variant="secondary" onPress={() => reveal(true)} />
        )}
        {!revealed && isListening && (
          <Button title={t('review.cantListen')} variant="secondary" onPress={skipListening} />
        )}

        {/* Not known: nothing to weigh up, so one button that records "Again". */}
        {revealed?.typed?.dontKnow && (
          <Button title={t('common.continue')} onPress={() => rate(AGAIN)} busy={saving} />
        )}

        {revealed && !revealed.typed?.dontKnow && (
          <View style={styles.ratings}>
            {REVIEW_RATINGS.map((rating) => (
              <Pressable
                key={rating}
                onPress={() => rate(rating)}
                disabled={saving}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.rating,
                  { borderColor: theme.border },
                  (saving || pressed) && styles.dimmed,
                ]}>
                <ThemedText type="smallBold" style={rating === 1 && { color: theme.danger }}>
                  {t(RATING_LABELS[rating])}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatInterval(revealed.intervals[rating])}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}
      </Screen>
      {overlay}
    </View>
  );
}

/** `before` plus the cards of `more` that are not in it yet. */
function addCards(before: SessionCard[], more: SessionCard[]): SessionCard[] {
  const known = new Set(before.map((c) => c.id));
  return [...before, ...more.filter((c) => !known.has(c.id))];
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  instruction: { textAlign: 'center' },
  listen: { fontSize: 28, lineHeight: 36 },
  listenLarge: { fontSize: 64, lineHeight: 80 },
  meaning: { fontSize: 20, lineHeight: 28, textAlign: 'center' },
  prompt: { fontSize: 32, lineHeight: 44, textAlign: 'center' },
  divider: { height: 1, alignSelf: 'stretch' },
  notes: { textAlign: 'center' },
  ratings: { flexDirection: 'row', gap: Spacing.two },
  rating: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
  },
  dimmed: { opacity: 0.5 },
});
