import { Stack } from 'expo-router';

/** Layout for every screen that needs a logged-in user. */
export default function AppLayout() {
  // Titles of dynamic screens (deck name) are set inside the screens.
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Decks' }} />
      <Stack.Screen name="decks/new" options={{ title: 'New deck' }} />
      <Stack.Screen name="decks/[deckId]/index" options={{ title: '' }} />
      <Stack.Screen name="decks/[deckId]/items/new" options={{ title: 'Add word' }} />
      <Stack.Screen name="decks/[deckId]/items/[itemId]" options={{ title: 'Edit word' }} />
    </Stack>
  );
}
