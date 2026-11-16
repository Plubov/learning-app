import { Link, router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
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
import { loadHomeCourses, updateDeck, type HomeCourse } from '@/lib/courses';
import { loadGoalStatus, syncTimeZone } from '@/lib/daily-goal';
import { APP_LANGUAGES, LANGUAGE_NAMES, useT } from '@/lib/i18n';
import { loadSessionCards } from '@/lib/session-cards';
import { goalProgress } from '@/lib/streak';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** Wraps a loader that throws into the {data, error} form useFocusQuery expects. */
function settled<T>(promise: Promise<T>) {
  return promise.then(
    (data) => ({ data, error: null }),
    (reason: unknown) => ({ data: null, error: { message: String(reason) } }),
  );
}

/**
 * Home. From top to bottom, in the order the learner needs it:
 *   1. greeting and streak
 *   2. the next lesson of the course worked on last, with a button straight
 *      into it
 *   3. today's reviews and the daily goal
 *   4. the other courses, then the word decks
 */
export default function HomeScreen() {
  const { session } = useSession();
  const theme = useTheme();
  const { t, language, setLanguage } = useT();

  // Increased after a deck's switch was changed: decks, courses and the
  // number of due cards all depend on it.
  const [reload, setReload] = useState(0);
  const [deckError, setDeckError] = useState<string | null>(null);

  const loadDecks = useCallback(
    () =>
      supabase
        .from('decks')
        .select('id, name, active, priority, items(count)')
        .order('priority', { ascending: false })
        .order('created_at'),
    // `reload` is not read inside: changing it re-runs the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reload],
  );
  const { data: decks, error } = useFocusQuery(loadDecks);

  async function changeDeck(deckId: string, change: { active?: boolean; priority?: boolean }) {
    setDeckError(null);
    try {
      await updateDeck(deckId, change);
    } catch (reason) {
      setDeckError(reason instanceof Error ? reason.message : String(reason));
    }
    setReload((n) => n + 1);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadCourses = useCallback(() => settled(loadHomeCourses()), [reload]);
  const { data: courses, error: coursesError } = useFocusQuery(loadCourses);

  // Cards in today's session (due reviews plus new words within the daily
  // limit), loaded exactly like the review screen does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadDue = useCallback(() => settled(loadSessionCards(0)), [reload]);
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
  const others = courses?.filter((course) => course.id !== current?.id) ?? [];

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
            <Pressable accessibilityRole="button" accessibilityLabel={`${goal.streak}-day streak. Statistics`}>
              <ThemedView type="backgroundElement" style={styles.streak}>
                <ThemedText style={styles.streakText}>🔥 {goal.streak}</ThemedText>
              </ThemedView>
            </Pressable>
          </Link>
        )}
      </View>

      {(error ?? coursesError ?? deckError) && (
        <ThemedText style={{ color: theme.danger }}>{error ?? coursesError ?? deckError}</ThemedText>
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
        <View style={styles.spread}>
          <ThemedText style={styles.cardTitle}>{t('home.review.title')}</ThemedText>
          {goal && (
            <ThemedText type="small" themeColor="textSecondary">
              {goal.metToday
                ? t('home.review.goalReached')
                : t('home.review.today', { done: goal.todayReviews, goal: goal.goal })}
            </ThemedText>
          )}
        </View>
        {goal && <ProgressBar value={goalProgress(goal.todayReviews, goal.goal)} />}
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
          // The daily goal counts all active decks together; once it is
          // reached, the learner picks what to go on with.
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

      {courses && courses.length > 0 && (
        <Section title={current ? t('home.moreCourses') : t('home.courses')} href="/courses/new">
          {others.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
          {others.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('home.addAnother')}
            </ThemedText>
          )}
        </Section>
      )}

      <Section title={t('home.decks')} href="/decks/new">
        {decks?.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('home.noDecks')}
          </ThemedText>
        )}
        {decks?.map((deck) => (
          // The name opens the deck; the two switches beside it are separate
          // buttons: priority (star) and whether it is in the daily reviews.
          <ThemedView
            key={deck.id}
            type="backgroundElement"
            style={[styles.row, !deck.active && styles.paused]}>
            <Link href={`/decks/${deck.id}`} asChild>
              <Pressable accessibilityRole="button" style={styles.grow}>
                <ThemedText style={styles.rowTitle} numberOfLines={1}>
                  {deck.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('home.items', { n: deck.items[0]?.count ?? 0 })}
                </ThemedText>
              </Pressable>
            </Link>
            <Pressable
              onPress={() => changeDeck(deck.id, { priority: !deck.priority })}
              accessibilityRole="switch"
              accessibilityState={{ checked: deck.priority }}
              accessibilityLabel={t('deck.priority')}
              hitSlop={Spacing.two}>
              <ThemedText style={styles.switchIcon}>{deck.priority ? '⭐' : '☆'}</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => changeDeck(deck.id, { active: !deck.active })}
              accessibilityRole="switch"
              accessibilityState={{ checked: deck.active }}
              accessibilityLabel={t('deck.active')}
              hitSlop={Spacing.two}>
              <ThemedText style={styles.switchIcon}>{deck.active ? '✅' : '⏸️'}</ThemedText>
            </Pressable>
          </ThemedView>
        ))}
      </Section>

      <View style={styles.footer}>
        <Button title={t('home.statistics')} variant="secondary" onPress={() => router.push('/stats')} />
        <Button title={t('home.voices')} variant="secondary" onPress={() => router.push('/voices')} />
        <View style={styles.languages}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('home.language')}
          </ThemedText>
          {APP_LANGUAGES.map((code) => (
            <Pressable
              key={code}
              onPress={() => setLanguage(code)}
              accessibilityRole="radio"
              accessibilityState={{ selected: language === code }}
              style={[
                styles.language,
                {
                  borderColor: language === code ? theme.tint : theme.border,
                  backgroundColor: language === code ? theme.tintSoft : theme.background,
                },
              ]}>
              <ThemedText type="small">{LANGUAGE_NAMES[code]}</ThemedText>
            </Pressable>
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {t('home.loggedInAs', { email: session?.user.email ?? '' })}
        </ThemedText>
        {/* After sign-out the session becomes null and the root layout's
            guard sends us back to the sign-in screen. */}
        <Pressable accessibilityRole="button" onPress={() => supabase.auth.signOut()} hitSlop={Spacing.two}>
          <ThemedText type="small" themeColor="textSecondary" style={[styles.center, styles.underlined]}>
            {t('home.signOut')}
          </ThemedText>
        </Pressable>
      </View>
    </Screen>
  );
}

/** A titled group with one small action on the right ("＋ New"), which opens `href`. */
function Section({
  title,
  href,
  children,
}: {
  title: string;
  href: '/courses/new' | '/decks/new';
  children: ReactNode;
}) {
  const theme = useTheme();
  const { t } = useT();
  return (
    <View style={styles.section}>
      <View style={styles.spread}>
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
        <Link href={href} asChild>
          <Pressable accessibilityRole="button" hitSlop={Spacing.two}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              {t('common.new')}
            </ThemedText>
          </Pressable>
        </Link>
      </View>
      {children}
    </View>
  );
}

/** A course that is not the current one: its progress, and its own way into the next lesson. */
function CourseCard({ course }: { course: HomeCourse }) {
  const { t } = useT();
  const next = course.next;
  let status = t('home.noPlan');
  if (course.planned) {
    status = next ? t('home.next', { n: next.position, title: next.title }) : t('home.allDone');
  }
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Link href={`/courses/${course.id}`} asChild>
        <Pressable accessibilityRole="button" style={styles.courseHead}>
          <View style={styles.spread}>
            <ThemedText style={[styles.rowTitle, styles.grow]} numberOfLines={2}>
              {course.title}
            </ThemedText>
            {course.planned && (
              <ThemedText type="small" themeColor="textSecondary">
                {course.done} / {course.total} ›
              </ThemedText>
            )}
          </View>
          {course.planned && <ProgressBar value={course.done / Math.max(1, course.total)} />}
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {status}
          </ThemedText>
        </Pressable>
      </Link>
      {course.planned && next && (
        <Button
          title={`${t(stepLabel(next.step))} ›`}
          variant="secondary"
          onPress={() => router.push(`/courses/${course.id}/lessons/${next.id}`)}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  center: { textAlign: 'center' },
  underlined: { textDecorationLine: 'underline' },
  pressed: { opacity: 0.8 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },

  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  greeting: { fontSize: 28, lineHeight: 36, fontWeight: 700 },
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
  courseHead: { gap: Spacing.two },

  section: { gap: Spacing.two, marginTop: Spacing.three },
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: 700 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowTitle: { fontSize: 16, lineHeight: 24, fontWeight: 700, flexShrink: 1 },

  paused: { opacity: 0.55 },
  switchIcon: { fontSize: 22, lineHeight: 30 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    maxWidth: '100%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 2,
  },
  footer: { marginTop: Spacing.five, gap: Spacing.three },
  languages: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  language: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.three, borderRadius: 999, borderWidth: 2 },
});
