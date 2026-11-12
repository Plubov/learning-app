import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
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
        .select('id, name, new_per_day, items(id, kind, term, meaning)')
        .eq('id', deckId)
        .order('created_at', { referencedTable: 'items', ascending: false })
        .single(),
    [deckId],
  );
  const { data: deck, error } = useFocusQuery(load);

  // Daily limit of new words; shown immediately, saved in the background.
  const [newPerDay, setNewPerDay] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const shownNewPerDay = newPerDay ?? deck?.new_per_day;

  async function changeNewPerDay(step: number) {
    if (shownNewPerDay === undefined) return;
    const value = Math.min(MAX_NEW_PER_DAY, Math.max(0, shownNewPerDay + step));
    setNewPerDay(value);
    setSaveError(null);
    const { error: updateError } = await supabase
      .from('decks')
      .update({ new_per_day: value })
      .eq('id', deckId);
    if (updateError) setSaveError(updateError.message);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: deck?.name ?? '' }} />
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}

      <Button title="Add word" onPress={() => router.push(`/decks/${deckId}/items/new`)} />
      <Button
        title="Import from RemNote"
        variant="secondary"
        onPress={() => router.push(`/decks/${deckId}/import`)}
      />

      {shownNewPerDay !== undefined && (
        <View style={styles.setting}>
          <ThemedText style={styles.settingLabel}>New words per day</ThemedText>
          <Pressable
            onPress={() => changeNewPerDay(-STEP)}
            accessibilityRole="button"
            accessibilityLabel="Fewer new words per day"
            style={[styles.stepper, { borderColor: theme.border }]}>
            <ThemedText>−</ThemedText>
          </Pressable>
          <ThemedText type="smallBold" style={styles.settingValue}>
            {shownNewPerDay}
          </ThemedText>
          <Pressable
            onPress={() => changeNewPerDay(STEP)}
            accessibilityRole="button"
            accessibilityLabel="More new words per day"
            style={[styles.stepper, { borderColor: theme.border }]}>
            <ThemedText>+</ThemedText>
          </Pressable>
        </View>
      )}
      {saveError && <ThemedText style={{ color: theme.danger }}>{saveError}</ThemedText>}

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

const STEP = 5;
const MAX_NEW_PER_DAY = 100;

const styles = StyleSheet.create({
  setting: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  settingLabel: { flex: 1 },
  settingValue: { minWidth: 32, textAlign: 'center' },
  stepper: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
