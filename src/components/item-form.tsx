import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { cleanOptionalText, cleanText } from '@/lib/text';

export type ItemKind = 'vocab' | 'grammar';

/** Form values after cleaning: NFC-normalised, trimmed, empty notes = null. */
export type ItemValues = {
  kind: ItemKind;
  term: string;
  meaning: string;
  notes: string | null;
};

type ItemFormProps = {
  initial?: ItemValues;
  submitTitle: string;
  /** Saves the values; resolves to an error message, or null on success. */
  onSubmit: (values: ItemValues) => Promise<string | null>;
  /** Empty the form after a successful save (for adding several words). */
  clearOnSuccess?: boolean;
};

const KINDS: { value: ItemKind; label: string }[] = [
  { value: 'vocab', label: 'Word' },
  { value: 'grammar', label: 'Grammar' },
];

export function ItemForm({ initial, submitTitle, onSubmit, clearOnSuccess }: ItemFormProps) {
  const theme = useTheme();
  const [kind, setKind] = useState<ItemKind>(initial?.kind ?? 'vocab');
  const [term, setTerm] = useState(initial?.term ?? '');
  const [meaning, setMeaning] = useState(initial?.meaning ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const values: ItemValues = {
    kind,
    term: cleanText(term),
    meaning: cleanText(meaning),
    notes: cleanOptionalText(notes),
  };
  const canSubmit = values.term !== '' && values.meaning !== '' && !busy;

  async function submit() {
    setBusy(true);
    setMessage(null);
    const error = await onSubmit(values);
    setBusy(false);
    if (error) {
      setMessage({ kind: 'error', text: error });
    } else if (clearOnSuccess) {
      setMessage({ kind: 'info', text: `Saved “${values.term}”.` });
      setTerm('');
      setMeaning('');
      setNotes('');
    }
  }

  return (
    <View style={styles.form}>
      <View style={styles.kindRow}>
        {KINDS.map((option) => {
          const selected = option.value === kind;
          return (
            <Pressable
              key={option.value}
              onPress={() => setKind(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[
                styles.kindOption,
                { borderColor: theme.border },
                selected && { backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <TextField
        label={kind === 'vocab' ? 'Korean' : 'Grammar point'}
        placeholder={kind === 'vocab' ? '사과' : '-아/어요'}
        value={term}
        onChangeText={setTerm}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextField
        label="Meaning"
        placeholder={kind === 'vocab' ? 'apple' : 'polite present tense ending'}
        value={meaning}
        onChangeText={setMeaning}
      />
      <TextField
        label="Notes (optional)"
        placeholder="Example sentence, usage hint"
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      {message && (
        <ThemedText
          type="small"
          style={{ color: message.kind === 'error' ? theme.danger : theme.textSecondary }}>
          {message.text}
        </ThemedText>
      )}

      <Button title={submitTitle} onPress={submit} disabled={!canSubmit} busy={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  kindRow: { flexDirection: 'row', gap: Spacing.two },
  kindOption: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.one + Spacing.half,
    paddingHorizontal: Spacing.three,
  },
});
