import { Stack } from 'expo-router';

import { useT } from '@/lib/i18n';

/**
 * Layout for every screen that needs a logged-in user. The tabs (Stats,
 * Home, Courses & decks, Focus) are the bottom of the stack; every other
 * screen is pushed above them and covers the tab bar.
 */
export default function AppLayout() {
  const { t } = useT();
  // Titles of dynamic screens (deck, course, lesson, project) are set inside the screens.
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
      <Stack.Screen name="review" options={{ title: t('course.flashcards') }} />
      <Stack.Screen name="voices" options={{ title: '' }} />
      <Stack.Screen name="decks/new" options={{ title: t('title.newDeck') }} />
      <Stack.Screen name="decks/[deckId]/index" options={{ title: '' }} />
      <Stack.Screen name="decks/[deckId]/import" options={{ title: t('title.import') }} />
      <Stack.Screen name="decks/[deckId]/items/new" options={{ title: t('title.addWord') }} />
      <Stack.Screen name="decks/[deckId]/items/[itemId]" options={{ title: t('title.editWord') }} />
      <Stack.Screen name="courses/new" options={{ title: t('title.newCourse') }} />
      <Stack.Screen name="courses/[courseId]/index" options={{ title: '' }} />
      <Stack.Screen name="courses/[courseId]/chat" options={{ title: t('title.tutor') }} />
      <Stack.Screen name="courses/[courseId]/materials" options={{ title: t('title.material') }} />
      <Stack.Screen name="courses/[courseId]/homework/index" options={{ title: t('title.homework') }} />
      <Stack.Screen name="courses/[courseId]/homework/new" options={{ title: t('title.checkSolution') }} />
      <Stack.Screen name="courses/[courseId]/homework/[homeworkId]" options={{ title: t('title.result') }} />
      <Stack.Screen name="courses/[courseId]/lessons/[lessonId]" options={{ title: '' }} />
      {/* A review stop is a full-screen session, like a lesson's. */}
      <Stack.Screen name="courses/[courseId]/review/[lessonId]" options={{ headerShown: false }} />
      <Stack.Screen name="projects/new" options={{ title: '' }} />
      <Stack.Screen name="projects/[courseId]" options={{ title: '' }} />
      {/* The running timer is a full-screen session, like a lesson. */}
      <Stack.Screen name="timer/[courseId]" options={{ headerShown: false }} />
    </Stack>
  );
}
