import { Link, router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { greeting, stepLabel } from '@/lib/course-progress';
import { loadHomeCourses } from '@/lib/courses';
import { loadGoalStatus, syncTimeZone } from '@/lib/daily-goal';
import { useT } from '@/lib/i18n';
import { loadSessionCards } from '@/lib/session-cards';
import { goalProgress } from '@/lib/streak';
import { supabase } from '@/lib/supabase';

/** Wraps a loader that throws into the {data, error} form useFocusQuery expects. */
function settled<T>(promise: Promise<T>) {
  return promise.then(
    (data) => ({ data, error: null }),
    (reason: unknown) => ({ data: null, error: { message: String(reason) } }),
  );
}

/**
 * The Today tab, in the order the learner needs it:
 *   1. greeting, total points and streak
 *   2. today's goal: points and reviews, either of which keeps the streak
 *   3. the next lesson of the course worked on last, with a button straight
 *      into it
 *   4. today's reviews
 * All courses and decks are in the Courses tab; statistics and settings in
 * the Stats tab.
 */
export default function TodayScreen() {
  const theme = useTheme();
  const { t } = useT();

  // Decks to go on with once the day's goal is reached.
  const loadDecks = useCallback(
    () =>
      supabase
        .from('decks')
        .select('id, name, priority')
        .order('priority', { ascending: false })
        .order('created_at'),
    [],
  );
  const { data: decks, error } = useFocusQuery(loadDecks);

  const loadCourses = useCallback(() => settled(loadHomeCourses()), []);
  const { data: courses, error: coursesError } = useFocusQuery(loadCourses);

  // Cards in today's session (due reviews plus new words within the daily
  // limit), loaded exactly like the review screen does.
  const loadDue = useCallback(() => settled(loadSessionCards(0)), []);
  const { data: today } = useFocusQuery(loadDue);

  const loadGoal = useCallback(() => {
    syncTimeZone().catch(() => {}); // see syncTimeZone: retried on the next visit
    return settled(loadGoalStatus());
  }, []);
  const { data: goal } = useFocusQuery(loadGoal);

  const dueCount = today?.cards.length ?? 0;
  const canReview = dueCount > 0 || today?.moreNewAvailable === true;
  let reviewTitle = t('home.review.allDone');
  if (dueCount > 0) {
    reviewTitle = dueCount === 1 ? t('home.review.card') : t('home.review.cards', { n: dueCount });
  } else if (today?.moreNewAvailable) reviewTitle = t('home.review.more');

  // The course to continue: the one worked on last that still has a lesson open.
  const current = courses?.find((course) => course.planned && course.next) ?? null;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.grow}>
          <ThemedText style={styles.greeting}>{t(greeting(new Date().getHours()))} 👋</ThemedText>
          <ThemedText themeColor="textSecondary">
            {current ? t('home.nextReady') : t('home.whatLearn')}
          </ThemedText>
        </View>
        {goal && (
          <Link href="/stats" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('home.totalPoints', { n: goal.totalPoints })}. ${goal.streak}-day streak. Statistics`}
              style={styles.badges}>
              <ThemedView type="backgroundElement" style={styles.streak}>
                <ThemedText style={styles.streakText}>⭐ {goal.totalPoints}</ThemedText>
              </ThemedView>
              <ThemedView type="backgroundElement" style={styles.streak}>
                <ThemedText style={styles.streakText}>🔥 {goal.streak}</ThemedText>
              </ThemedView>
            </Pressable>
          </Link>
        )}
      </View>

      {goal && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.spread}>
            <ThemedText style={styles.cardTitle}>{t('home.today.title')}</ThemedText>
            {goal.metToday && (
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                {t('home.review.goalReached')}
              </ThemedText>
            )}
          </View>
          <ThemedText type="smallBold">
            {t('home.today.points', { done: goal.todayPoints, goal: goal.pointsGoal })}
          </ThemedText>
          <ProgressBar value={goalProgress(goal.todayPoints, goal.pointsGoal)} />
          <ThemedText type="smallBold">
            {t('home.today.reviews', { done: goal.todayReviews, goal: goal.goal })}
          </ThemedText>
          <ProgressBar value={goalProgress(goal.todayReviews, goal.goal)} />
          {!goal.metToday && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('home.today.hint')}
            </ThemedText>
          )}
        </ThemedView>
      )}

      {(error ?? coursesError) && (
        <ThemedText style={{ color: theme.danger }}>{error ?? coursesError}</ThemedText>
      )}

      {current?.next && (
        <View style={[styles.hero, { backgroundColor: theme.hero }]}>
          <ThemedText style={[styles.heroLabel, styles.onTint]} numberOfLines={1}>
            {current.title}
          </ThemedText>
          <ThemedText style={[styles.heroTitle, styles.onTint]}>
            {t('common.lessonTitle', { n: current.next.position, title: current.next.title })}
          </ThemedText>
          <View style={styles.heroTrack}>
            <View
              style={[
                styles.heroBar,
                { width: `${Math.round((current.done / Math.max(1, current.total)) * 100)}%` },
              ]}
            />
          </View>
          <ThemedText type="small" style={styles.onTint}>
            {t('common.lessonsDone', { done: current.done, total: current.total })}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/courses/${current.id}/lessons/${current.next?.id}`)}
            style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}>
            <ThemedText style={[styles.heroButtonText, { color: theme.hero }]}>
              {t(stepLabel(current.next.step))} ›
            </ThemedText>
          </Pressable>
          <Link href={`/courses/${current.id}`} asChild>
            <Pressable accessibilityRole="link" hitSlop={Spacing.two} style={styles.heroLink}>
              <ThemedText type="small" style={styles.onTint}>
                {t('home.courseOverview')}
              </ThemedText>
            </Pressable>
          </Link>
        </View>
      )}

      {courses?.length === 0 && (
        <ThemedView type="tintSoft" style={styles.card}>
          <ThemedText style={styles.cardTitle}>{t('home.firstCourse.title')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t('home.firstCourse.text')}
          </ThemedText>
          <Button title={t('home.firstCourse.button')} onPress={() => router.push('/courses/new')} />
        </ThemedView>
      )}

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText style={styles.cardTitle}>{t('home.review.title')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {dueCount > 0 ? t('home.review.due') : t('home.review.none')}
        </ThemedText>
        <Button
          title={reviewTitle}
          variant={current ? 'secondary' : 'primary'}
          onPress={() => router.push('/review')}
          disabled={!canReview}
        />
        {goal?.metToday && decks && decks.length > 0 && (
          // The day's goal is reached (by reviews of all active decks
          // together, or by points); the learner picks what to go on with.
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {t('home.keepGoing')}
            </ThemedText>
            <View style={styles.chips}>
              {decks.map((deck) => (
                <Pressable
                  key={deck.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/review', params: { deckId: deck.id } })}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: theme.tint, backgroundColor: theme.tintSoft },
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="small" numberOfLines={1}>
                    {deck.priority ? '⭐ ' : ''}
                    {deck.name}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ThemedView>

    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: 0.8 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },

  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  greeting: { fontSize: 28, lineHeight: 36, fontWeight: 700 },
  badges: { flexDirection: 'row', gap: Spacing.two },
  streak: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 999 },
  streakText: { fontSize: 18, lineHeight: 26, fontWeight: 700 },

  hero: { padding: Spacing.four, borderRadius: Spacing.four, gap: Spacing.two },
  onTint: { color: '#ffffff' },
  heroLabel: { fontSize: 13, lineHeight: 18, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.9 },
  heroTitle: { fontSize: 24, lineHeight: 32, fontWeight: 700 },
  heroTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.3)', overflow: 'hidden', marginTop: Spacing.two },
  heroBar: { height: '100%', borderRadius: 4, backgroundColor: '#ffffff' },
  heroButton: {
    marginTop: Spacing.two,
    backgroundColor: '#ffffff',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  heroButtonText: { fontSize: 18, lineHeight: 26, fontWeight: 700 },
  heroLink: { alignSelf: 'center', paddingTop: Spacing.one },

  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  cardTitle: { fontSize: 18, lineHeight: 26, fontWeight: 700 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    maxWidth: '100%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 2,
  },
});
