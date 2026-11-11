import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { ItemForm, type ItemValues } from '@/components/item-form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { describeDbError } from '@/lib/db-errors';
import { supabase } from '@/lib/supabase';

export default function EditItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const theme = useTheme();

  const load = useCallback(
    () => supabase.from('items').select('kind, term, meaning, notes').eq('id', itemId).single(),
    [itemId],
  );
  const { data: item, error } = useFocusQuery(load);

  async function save(values: ItemValues): Promise<string | null> {
    const { error } = await supabase.from('items').update(values).eq('id', itemId);
    if (error) {
      return describeDbError(error, `“${values.term}” is already in this deck.`);
    }
    router.back();
    return null;
  }

  return (
    <Screen>
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
      {item && (
        <ItemForm
          initial={{
            // M1 forms offer only vocab and grammar.
            kind: item.kind === 'grammar' ? 'grammar' : 'vocab',
            term: item.term,
            meaning: item.meaning,
            notes: item.notes,
          }}
          submitTitle="Save changes"
          onSubmit={save}
        />
      )}
    </Screen>
  );
}
