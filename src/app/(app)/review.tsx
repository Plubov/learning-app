import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getDeviceId } from '@/lib/device-id';
import { isDueInSession, spreadSiblings } from '@/lib/review-session';
import {
  createScheduler,
  formatInterval,
  previewIntervals,
  REVIEW_RATINGS,
  reviewCard,
  type CardRow,
  type ReviewRating,
  type Scheduler,
} from '@/lib/scheduling';
import { getAutoplay, setAutoplay, speakKorean, stopSpeaking } from '@/lib/speech';
import { supabase } from '@/lib/supabase';
import { answersMatch, cleanText } from '@/lib/text';

/** Card types this screen can show (listening and writing come later). */
const CARD_TYPES = ['recognition', 'production'];
const SESSION_LIMIT = 100;
const RATING_LABELS: Record<ReviewRating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

type SessionCard = CardRow & {
  card_type: string;
  item_id: string;
  item: { term: string; meaning: string; notes: string | null };
};

/** What is known once the answer side is showing. */
type Revealed = {
  intervals: Record<ReviewRating, number>;
  /** Production cards only: what was typed and whether it matched. */
  typed: { value: string; correct: boolean } | null;
};

function loadDueCards() {
  return supabase
    .from('cards')
    .select(
      'id, item_id, card_type, due_at, stability, stability_fast, difficulty, scheduled_days, ' +
        'learning_step, state, schedule_status, reps, lapses, last_review_at, ' +
        'item:items(term, meaning, notes)',
    )
    .eq('suspended', false)
    .in('card_type', CARD_TYPES)
    .lte('due_at', new Date().toISOString())
    .order('due_at')
    .limit(SESSION_LIMIT)
    .overrideTypes<SessionCard[], { merge: false }>();
}

export default function ReviewScreen() {
  const theme = useTheme();
  const [scheduler, setScheduler] = useState<Scheduler | null>(null);
  const [queue, setQueue] = useState<SessionCard[] | null>(null); // null = loading
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [answer, setAnswer] = useState('');
  const [shownAt, setShownAt] = useState(0); // when the current card appeared
  const [saving, setSaving] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [autoplay, setAutoplayState] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    getAutoplay().then(setAutoplayState, () => setAutoplayState(true));
    return () => {
      stopSpeaking(); // no voice after leaving the screen
    };
  }, []);

  // Korean is on screen: the front of a recognition card, or a production
  // card after "Check". Read it aloud once each time that happens.
  const current = queue?.[0];
  const koreanShown =
    current !== undefined && (current.card_type !== 'production' || revealed !== null);
  const currentTerm = current?.item.term;
  useEffect(() => {
    if (autoplay && koreanShown && currentTerm) speakKorean(currentTerm);
  }, [autoplay, koreanShown, currentTerm, shownAt]);

  function toggleAutoplay() {
    const next = !autoplay;
    setAutoplayState(next);
    setAutoplay(next);
    if (!next) stopSpeaking();
  }

  useEffect(() => {
    let active = true;
    Promise.all([createScheduler(), loadDueCards()]).then(
      ([newScheduler, { data, error }]) => {
        if (!active) return;
        if (error) {
          setError(error.message);
          return;
        }
        setScheduler(newScheduler);
        setQueue(spreadSiblings(data));
        setShownAt(new Date().getTime());
      },
      (reason: unknown) => {
        if (active) setError(String(reason));
      },
    );
    return () => {
      active = false;
    };
  }, []);

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
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
      </Screen>
    );
  }

  const card = queue[0];
  if (!card) {
    return (
      <Screen>
        <ThemedText type="subtitle">Done for now</ThemedText>
        <ThemedText themeColor="textSecondary">
          {doneCount === 0 ? 'No cards are due.' : `You reviewed ${doneCount} cards.`}
        </ThemedText>
        <Button title="Back to decks" onPress={() => router.back()} />
      </Screen>
    );
  }

  const isProduction = card.card_type === 'production';

  const listenButton = (
    <Pressable
      onPress={() => speakKorean(card.item.term)}
      accessibilityRole="button"
      accessibilityLabel="Listen"
      hitSlop={Spacing.two}
      style={({ pressed }) => pressed && styles.dimmed}>
      <ThemedText style={styles.listen}>🔊</ThemedText>
    </Pressable>
  );

  function reveal() {
    if (!scheduler || !card) return;
    setRevealed({
      intervals: previewIntervals(scheduler, card, new Date()),
      typed: isProduction
        ? { value: cleanText(answer), correct: answersMatch(answer, card.item.term) }
        : null,
    });
  }

  async function rate(rating: ReviewRating) {
    if (!scheduler || !card || !queue || !revealed) return;
    const now = new Date();
    const schedule = reviewCard(scheduler, card, rating, now);

    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc('record_review', {
      p_card_id: card.id,
      p_rating: rating,
      p_reviewed_at: now.toISOString(),
      p_schedule: schedule,
      p_duration_ms: now.getTime() - shownAt,
      p_device_id: await getDeviceId(),
      // Recognition is self-graded: no typed answer, correctness not checked.
      ...(revealed.typed && {
        p_correct: revealed.typed.correct,
        p_response: { type: 'text', value: revealed.typed.value },
      }),
    });
    setSaving(false);
    if (error) {
      setError(error.message); // the card stays, so the rating can be retried
      return;
    }

    const rest = queue.slice(1);
    // "Again" and learning steps are due within minutes: show them again at the end.
    setQueue(isDueInSession(schedule.due_at, now) ? [...rest, { ...card, ...schedule }] : rest);
    setDoneCount(doneCount + 1);
    setRevealed(null);
    setAnswer('');
    setShownAt(new Date().getTime());
  }

  return (
    <Screen>
      <View style={styles.topRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {queue.length} left · {isProduction ? 'Type it in Korean' : 'What does it mean?'}
        </ThemedText>
        {autoplay !== null && (
          <Pressable onPress={toggleAutoplay} accessibilityRole="button" hitSlop={Spacing.two}>
            <ThemedText type="small" themeColor="textSecondary">
              {autoplay ? 'Auto sound: on' : 'Auto sound: off'}
            </ThemedText>
          </Pressable>
        )}
      </View>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText style={styles.prompt}>
          {isProduction ? card.item.meaning : card.item.term}
        </ThemedText>
        {!isProduction && listenButton}

        {revealed && (
          <>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <ThemedText style={styles.prompt}>
              {isProduction ? card.item.term : card.item.meaning}
            </ThemedText>
            {isProduction && listenButton}
            {revealed.typed && (
              <ThemedText
                style={{ color: revealed.typed.correct ? theme.tint : theme.danger }}>
                {revealed.typed.correct
                  ? 'Correct'
                  : `You typed: ${revealed.typed.value === '' ? '(nothing)' : revealed.typed.value}`}
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

      {!revealed && isProduction && (
        <TextField
          key={card.id} // a fresh, focused input for every card
          placeholder="한국어"
          value={answer}
          onChangeText={setAnswer}
          onSubmitEditing={reveal}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          submitBehavior="submit"
        />
      )}
      {!revealed && (
        <Button title={isProduction ? 'Check' : 'Show answer'} onPress={reveal} />
      )}

      {revealed && (
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
                {RATING_LABELS[rating]}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatInterval(revealed.intervals[rating])}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listen: { fontSize: 28, lineHeight: 36 },
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
