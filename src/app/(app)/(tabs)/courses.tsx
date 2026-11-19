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
import { stepLabel } from '@/lib/course-progress';
import { loadHomeCourses, updateDeck, type HomeCourse } from '@/lib/courses';
import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

/**
 * The Courses tab: every learning course with its progress and a way into
 * its next lesson, then the word decks with their switches (priority, in the
 * daily reviews or paused). Plain projects of the focus timer are not here;
 * they are in the Focus tab.
 */
export default function CoursesScreen() {
  const theme = useTheme();
  const { t } = useT();

  // Increased after a deck's switch was changed: decks and courses depend on it.
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

  const loadCourses = useCallback(
    () =>
      loadHomeCourses().then(
        (data) => ({ data, error: null }),
        (reason: unknown) => ({ data: null, error: { message: String(reason) } }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reload],
  );
  const { data: courses, error: coursesError } = useFocusQuery(loadCourses);

  async function changeDeck(deckId: string, change: { active?: boolean; priority?: boolean }) {
    setDeckError(null);
    try {
      await updateDeck(deckId, change);
    } catch (reason) {
      setDeckError(reason instanceof Error ? reason.message : String(reason));
    }
    setReload((n) => n + 1);
  }

  return (
    <Screen>
      {(error ?? coursesError ?? deckError) && (
        <ThemedText style={{ color: theme.danger }}>{error ?? coursesError ?? deckError}</ThemedText>
      )}

      <Section title={t('home.courses')} href="/courses/new">
        {courses?.length === 0 && (
          <ThemedView type="tintSoft" style={styles.card}>
            <ThemedText style={styles.cardTitle}>{t('home.firstCourse.title')}</ThemedText>
            <ThemedText themeColor="textSecondary">{t('home.firstCourse.text')}</ThemedText>
            <Button title={t('home.firstCourse.button')} onPress={() => router.push('/courses/new')} />
          </ThemedView>
        )}
        {courses?.map((course) => <CourseCard key={course.id} course={course} />)}
      </Section>

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

/** A course: its progress, and its own way into the next lesson. */
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
              {course.priority ? '⭐ ' : ''}
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
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  cardTitle: { fontSize: 18, lineHeight: 26, fontWeight: 700 },
  courseHead: { gap: Spacing.two },
  section: { gap: Spacing.two },
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
});
