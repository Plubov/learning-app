import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { readPickedFile } from '@/lib/read-picked-file';
import { parseRemNoteMarkdown, planImport, type ImportedItem, type SkippedLine } from '@/lib/remnote-import';
import { supabase } from '@/lib/supabase';

/** Largest file the sources table accepts (characters). */
const MAX_FILE_LENGTH = 1_000_000;
const PREVIEW_ROWS = 15;

/** Everything shown before the user confirms; nothing is saved yet. */
type Preview = {
  fileName: string;
  text: string;
  toAdd: ImportedItem[];
  alreadyPresent: number;
  merged: string[];
  oneWay: number;
  otherSkipped: SkippedLine[];
};

export default function ImportScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const theme = useTheme();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function chooseFile() {
    setError(null);
    // Any type: Android often reports .md files as "application/octet-stream".
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', base64: false });
    if (result.canceled) return;
    const asset = result.assets[0];

    setBusy(true);
    try {
      const text = (await readPickedFile(asset)).normalize('NFC');
      if (text.length > MAX_FILE_LENGTH) {
        setError('This file is too large (more than one million characters).');
        return;
      }
      const parsed = parseRemNoteMarkdown(text);

      // Terms already in this deck are shown as such and not added again.
      const { data, error: loadError } = await supabase
        .from('items')
        .select('term')
        .eq('deck_id', deckId)
        .eq('kind', 'vocab')
        .range(0, 9999);
      if (loadError) {
        setError(loadError.message);
        return;
      }
      const plan = planImport(
        parsed.items,
        data.map((row) => row.term),
      );
      setPreview({
        fileName: asset.name,
        text,
        toAdd: plan.toAdd,
        alreadyPresent: plan.alreadyPresent.length,
        merged: parsed.merged,
        oneWay: parsed.skipped.filter((s) => s.reason === 'one-way').length,
        otherSkipped: parsed.skipped.filter((s) => s.reason !== 'one-way'),
      });
    } catch (reason: unknown) {
      setError(`Could not read the file: ${String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const { data, error: importError } = await supabase.rpc('import_items', {
      p_deck_id: deckId,
      p_title: preview.fileName,
      p_text: preview.text,
      p_items: preview.toAdd,
    });
    setBusy(false);
    if (importError) {
      setError(importError.message);
      return;
    }
    setAdded(data);
  }

  if (added !== null) {
    return (
      <Screen>
        <ThemedText type="subtitle">Import done</ThemedText>
        <ThemedText>
          {added} {added === 1 ? 'word was' : 'words were'} added. New words are introduced a
          few per day, according to the deck&apos;s daily limit.
        </ThemedText>
        <Button title="Back to deck" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      {!preview && (
        <ThemedText themeColor="textSecondary">
          Choose a Markdown file exported from RemNote. Two-way cards (word ↔ Korean) become
          words in this deck. You see a preview before anything is saved.
        </ThemedText>
      )}

      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}

      {preview && (
        <>
          <ThemedText type="smallBold">{preview.fileName}</ThemedText>
          <View style={styles.summary}>
            <ThemedText>{preview.toAdd.length} new words</ThemedText>
            {preview.alreadyPresent > 0 && (
              <ThemedText themeColor="textSecondary">
                {preview.alreadyPresent} already in this deck (skipped)
              </ThemedText>
            )}
            {preview.merged.length > 0 && (
              <ThemedText themeColor="textSecondary">
                Combined meanings for: {preview.merged.join(', ')}
              </ThemedText>
            )}
            {preview.oneWay > 0 && (
              <ThemedText themeColor="textSecondary">
                {preview.oneWay} one-way cards (grammar) not imported; they stay saved with the
                file for later
              </ThemedText>
            )}
            {preview.otherSkipped.length > 0 && (
              <ThemedText themeColor="textSecondary">
                {preview.otherSkipped.length} lines skipped:{' '}
                {preview.otherSkipped
                  .slice(0, 5)
                  .map((s) => `line ${s.line} “${s.text}”`)
                  .join(', ')}
                {preview.otherSkipped.length > 5 ? ', …' : ''}
              </ThemedText>
            )}
          </View>

          {preview.toAdd.slice(0, PREVIEW_ROWS).map((item) => (
            <ThemedView key={item.term} type="backgroundElement" style={styles.row}>
              <ThemedText style={styles.term}>{item.term}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.meaning}
              </ThemedText>
            </ThemedView>
          ))}
          {preview.toAdd.length > PREVIEW_ROWS && (
            <ThemedText type="small" themeColor="textSecondary">
              … and {preview.toAdd.length - PREVIEW_ROWS} more
            </ThemedText>
          )}
        </>
      )}

      {preview && preview.toAdd.length > 0 && (
        <Button
          title={`Import ${preview.toAdd.length} words`}
          onPress={confirmImport}
          busy={busy}
        />
      )}
      <Button
        title={preview ? 'Choose another file' : 'Choose file'}
        variant={preview ? 'secondary' : 'primary'}
        onPress={chooseFile}
        busy={busy && !preview}
        disabled={busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { gap: Spacing.one },
  row: { padding: Spacing.three, borderRadius: Spacing.two, gap: Spacing.half },
  term: { fontSize: 20, lineHeight: 28 },
});
