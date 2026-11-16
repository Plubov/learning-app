import { Stack } from 'expo-router';

/** Layout for every screen that needs a logged-in user. */
export default function AppLayout() {
  // Titles of dynamic screens (deck, course, lesson) are set inside the screens.
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Learn' }} />
      <Stack.Screen name="review" options={{ title: 'Review' }} />
      <Stack.Screen name="stats" options={{ title: 'Statistics' }} />
      <Stack.Screen name="decks/new" options={{ title: 'New deck' }} />
      <Stack.Screen name="decks/[deckId]/index" options={{ title: '' }} />
      <Stack.Screen name="decks/[deckId]/import" options={{ title: 'Import from RemNote' }} />
      <Stack.Screen name="decks/[deckId]/items/new" options={{ title: 'Add word' }} />
      <Stack.Screen name="decks/[deckId]/items/[itemId]" options={{ title: 'Edit word' }} />
      <Stack.Screen name="courses/new" options={{ title: 'New course' }} />
      <Stack.Screen name="courses/[courseId]/index" options={{ title: '' }} />
      <Stack.Screen name="courses/[courseId]/chat" options={{ title: 'Tutor' }} />
      <Stack.Screen name="courses/[courseId]/lessons/[lessonId]" options={{ title: '' }} />
    </Stack>
  );
}
