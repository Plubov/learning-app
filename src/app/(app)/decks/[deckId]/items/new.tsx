import { useLocalSearchParams } from 'expo-router';

import { ItemForm, type ItemValues } from '@/components/item-form';
import { Screen } from '@/components/screen';
import { describeDbError } from '@/lib/db-errors';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

export default function NewItemScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { t } = useT();

  // The database creates the item's cards (trigger items_create_cards).
  async function save(values: ItemValues): Promise<string | null> {
    const { error } = await supabase.from('items').insert({ deck_id: deckId, ...values });
    return error ? describeDbError(error, t('item.duplicate', { term: values.term })) : null;
  }

  return (
    <Screen>
      {/* The form stays open and clears after saving, to add words in a row. */}
      <ItemForm submitTitle={t('item.save')} onSubmit={save} clearOnSuccess />
    </Screen>
  );
}
