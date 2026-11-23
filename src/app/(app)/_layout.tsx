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
      <Stack.Screen name="review" options={{ title: 'Review' }} />
      <Stack.Screen name="voices" options={{ title: '' }} />
      <Stack.Screen name="decks/new" options={{ title: 'New deck' }} />
      <Stack.Screen name="decks/[deckId]/index" options={{ title: '' }} />
      <Stack.Screen name="decks/[deckId]/import" options={{ title: 'Import from RemNote' }} />
      <Stack.Screen name="decks/[deckId]/items/new" options={{ title: 'Add word' }} />
      <Stack.Screen name="decks/[deckId]/items/[itemId]" options={{ title: 'Edit word' }} />
      <Stack.Screen name="courses/new" options={{ title: 'New course' }} />
      <Stack.Screen name="courses/[courseId]/index" options={{ title: '' }} />
      <Stack.Screen name="courses/[courseId]/chat" options={{ title: 'Tutor' }} />
      <Stack.Screen name="courses/[courseId]/materials" options={{ title: 'Material' }} />
      <Stack.Screen name="courses/[courseId]/homework/index" options={{ title: 'Homework' }} />
      <Stack.Screen name="courses/[courseId]/homework/new" options={{ title: 'Check a solution' }} />
      <Stack.Screen name="courses/[courseId]/homework/[homeworkId]" options={{ title: 'Result' }} />
      <Stack.Screen name="courses/[courseId]/lessons/[lessonId]" options={{ title: '' }} />
      <Stack.Screen name="projects/new" options={{ title: '' }} />
      <Stack.Screen name="projects/[courseId]" options={{ title: '' }} />
      {/* The running timer is a full-screen session, like a lesson. */}
      <Stack.Screen name="timer/[courseId]" options={{ headerShown: false }} />
    </Stack>
  );
}
