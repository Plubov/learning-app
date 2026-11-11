import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

export default function DeckScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const theme = useTheme();

  // One request: the deck plus its items, newest first.
  const load = useCallback(
    () =>
      supabase
        .from('decks')
        .select('id, name, items(id, kind, term, meaning)')
        .eq('id', deckId)
        .order('created_at', { referencedTable: 'items', ascending: false })
        .single(),
    [deckId],
  );
  const { data: deck, error } = useFocusQuery(load);

  return (
    <Screen>
      <Stack.Screen options={{ title: deck?.name ?? '' }} />
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}

      <Button title="Add word" onPress={() => router.push(`/decks/${deckId}/items/new`)} />

      {deck && deck.items.length === 0 && (
        <ThemedText themeColor="textSecondary">No words yet.</ThemedText>
      )}

      {deck?.items.map((item) => (
        <Link key={item.id} href={`/decks/${deckId}/items/${item.id}`} asChild>
          <Pressable>
            <ThemedView type="backgroundElement" style={styles.row}>
              <View style={styles.texts}>
                <ThemedText style={styles.term}>{item.term}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.meaning}
                </ThemedText>
              </View>
              {item.kind === 'grammar' && (
                <ThemedText type="small" themeColor="textSecondary">
                  grammar
                </ThemedText>
              )}
            </ThemedView>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  texts: { flex: 1, gap: Spacing.half },
  term: { fontSize: 20, lineHeight: 28 },
});
