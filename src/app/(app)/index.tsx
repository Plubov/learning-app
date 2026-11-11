import { Link, router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function DecksScreen() {
  const { session } = useSession();
  const theme = useTheme();
  const load = useCallback(
    () => supabase.from('decks').select('id, name, items(count)').order('created_at'),
    [],
  );
  const { data: decks, error, loading } = useFocusQuery(load);

  // Cards due now, for the Review button (same filter as the review screen).
  const loadDue = useCallback(
    () =>
      supabase
        .from('cards')
        .select('id')
        .eq('suspended', false)
        .in('card_type', ['recognition', 'production'])
        .lte('due_at', new Date().toISOString()),
    [],
  );
  const { data: dueCards } = useFocusQuery(loadDue);
  const dueCount = dueCards?.length ?? 0;

  return (
    <Screen>
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}

      <Button
        title={dueCount > 0 ? `Review (${dueCount} due)` : 'Nothing due'}
        onPress={() => router.push('/review')}
        disabled={dueCount === 0}
      />
      {!loading && decks?.length === 0 && (
        <ThemedText themeColor="textSecondary">
          No decks yet. Create one to start adding words.
        </ThemedText>
      )}

      {decks?.map((deck) => (
        <Link key={deck.id} href={`/decks/${deck.id}`} asChild>
          <Pressable>
            <ThemedView type="backgroundElement" style={styles.row}>
              <ThemedText type="smallBold">{deck.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {deck.items[0]?.count ?? 0} items
              </ThemedText>
            </ThemedView>
          </Pressable>
        </Link>
      ))}

      <Button title="New deck" onPress={() => router.push('/decks/new')} />

      <ThemedText type="small" themeColor="textSecondary" style={styles.account}>
        Logged in as {session?.user.email}
      </ThemedText>
      {/* After sign-out the session becomes null and the root layout's
          guard sends us back to the sign-in screen. */}
      <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  account: { marginTop: Spacing.five, textAlign: 'center' },
});
