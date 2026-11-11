import { useLocalSearchParams } from 'expo-router';

import { ItemForm, type ItemValues } from '@/components/item-form';
import { Screen } from '@/components/screen';
import { describeDbError } from '@/lib/db-errors';
import { supabase } from '@/lib/supabase';

export default function NewItemScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();

  // The database creates the item's cards (trigger items_create_cards).
  async function save(values: ItemValues): Promise<string | null> {
    const { error } = await supabase.from('items').insert({ deck_id: deckId, ...values });
    return error ? describeDbError(error, `“${values.term}” is already in this deck.`) : null;
  }

  return (
    <Screen>
      {/* The form stays open and clears after saving, to add words in a row. */}
      <ItemForm submitTitle="Save word" onSubmit={save} clearOnSuccess />
    </Screen>
  );
}
