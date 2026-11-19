import { router, Stack } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { GoalStepper } from '@/components/goal-stepper';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { createProject } from '@/lib/focus-data';
import { useT } from '@/lib/i18n';

/** A new plain project for the focus timer: a name and a weekly goal. */
export default function NewProjectScreen() {
  const { t } = useT();
  const theme = useTheme();
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState<number | null>(300);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await createProject(name, minutes);
      router.back();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('project.new') }} />
      <TextField
        label={t('project.name')}
        placeholder={t('project.namePlaceholder')}
        value={name}
        onChangeText={setName}
        maxLength={120}
        autoFocus
        onSubmitEditing={() => name.trim() !== '' && create()}
      />
      <ThemedText type="smallBold">{t('project.weeklyGoal')}</ThemedText>
      <GoalStepper minutes={minutes} onChange={setMinutes} />
      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
      <Button title={t('project.create')} onPress={create} disabled={name.trim() === ''} busy={busy} />
    </Screen>
  );
}
