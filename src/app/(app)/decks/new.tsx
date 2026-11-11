import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { cleanText } from '@/lib/text';

export default function NewDeckScreen() {
  const theme = useTheme();
  const [name, setName] = useState('Korean');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    // M1 supports Korean only; subject and language become choices later.
    const { data, error } = await supabase
      .from('decks')
      .insert({ name: cleanText(name), subject: 'language', target_lang: 'ko' })
      .select('id')
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Replace, so "back" from the new deck goes to the deck list, not this form.
    router.replace(`/decks/${data.id}`);
  }

  return (
    <Screen>
      <TextField label="Name" value={name} onChangeText={setName} autoFocus />
      <ThemedText type="small" themeColor="textSecondary">
        Language: Korean
      </ThemedText>
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
      <Button title="Create deck" onPress={create} disabled={cleanText(name) === ''} busy={busy} />
    </Screen>
  );
}
