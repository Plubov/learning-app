import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { planCourse } from '@/lib/ai';
import { LIMITS } from '@/lib/course-content';
import { supabase } from '@/lib/supabase';
import { cleanOptionalText, cleanText } from '@/lib/text';
import { useT } from '@/lib/i18n';

/** A whole number from the field within [min, max], or null when it is empty or not one. */
function wholeNumber(value: string, min: number, max: number): number | null {
  const number = Number(value.trim());
  if (value.trim() === '' || !Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

export default function NewCourseScreen() {
  const theme = useTheme();
  const { t } = useT();
  // 'study' = a university course: material is uploaded first, then planned.
  const [kind, setKind] = useState<'guided' | 'study'>('guided');
  const [goal, setGoal] = useState('');
  const [level, setLevel] = useState('');
  const [minutes, setMinutes] = useState('20');
  const [weeks, setWeeks] = useState('');
  const [material, setMaterial] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the course row exists, so "Try again" plans it instead of
  // creating a second course.
  const [courseId, setCourseId] = useState<string | null>(null);

  const minutesPerDay = wholeNumber(minutes, 5, 480);
  const weeksWanted = weeks.trim() === '' ? null : wholeNumber(weeks, 1, 104);
  const materialText = cleanText(material);
  let problem: string | null = null;
  if (cleanText(goal).length > LIMITS.goal) problem = t('newCourse.goalTooLong', { max: LIMITS.goal });
  else if (minutesPerDay === null) problem = t('newCourse.minutesInvalid');
  else if (weeks.trim() !== '' && weeksWanted === null) problem = t('newCourse.weeksInvalid');
  else if (materialText.length > LIMITS.material) {
    problem = t('newCourse.materialTooLong', { n: materialText.length, max: LIMITS.material });
  }

  async function createCourse(): Promise<string> {
    let sourceId: string | null = null;
    if (materialText !== '') {
      const source = await supabase
        .from('sources')
        .insert({ kind: 'paste', title: cleanText(goal).slice(0, 80), text: materialText })
        .select('id')
        .single();
      if (source.error) throw new Error(source.error.message);
      sourceId = source.data.id;
    }
    const course = await supabase
      .from('courses')
      .insert({
        kind,
        goal: cleanText(goal),
        level: cleanOptionalText(level),
        minutes_per_day: minutesPerDay ?? 20,
        weeks: weeksWanted,
        source_id: sourceId,
      })
      .select('id')
      .single();
    if (course.error) throw new Error(course.error.message);
    return course.data.id;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const id = courseId ?? (await createCourse());
      setCourseId(id);
      // A study course is planned from its files, which are added next.
      if (kind === 'guided') await planCourse(id);
      // Replace, so "back" from the course goes home, not to this form.
      router.replace(`/courses/${id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  const locked = busy || courseId !== null; // the course row is already saved
  return (
    <Screen>
      <View style={styles.kinds}>
        {(
          [
            { value: 'guided', icon: '🧭', title: 'newCourse.guided', text: 'newCourse.guidedText' },
            { value: 'study', icon: '🎓', title: 'newCourse.study', text: 'newCourse.studyText' },
          ] as const
        ).map((option) => (
          <Pressable
            key={option.value}
            onPress={() => setKind(option.value)}
            disabled={locked}
            accessibilityRole="radio"
            accessibilityState={{ selected: kind === option.value }}
            style={[
              styles.kind,
              {
                backgroundColor: kind === option.value ? theme.tintSoft : theme.backgroundElement,
                borderColor: kind === option.value ? theme.tint : theme.border,
              },
            ]}>
            <ThemedText style={styles.kindIcon}>{option.icon}</ThemedText>
            <ThemedText type="smallBold">{t(option.title)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {t(option.text)}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      <TextField
        label={t(kind === 'study' ? 'newCourse.goalStudy' : 'newCourse.goalGuided')}
        placeholder={t(kind === 'study' ? 'newCourse.goalStudyExample' : 'newCourse.goalGuidedExample')}
        value={goal}
        onChangeText={setGoal}
        editable={!locked}
        multiline
        autoFocus
      />
      <TextField
        label={t('newCourse.level')}
        placeholder={t('newCourse.levelExample')}
        value={level}
        onChangeText={setLevel}
        editable={!locked}
        multiline
      />
      <TextField
        label={t('newCourse.minutes')}
        value={minutes}
        onChangeText={setMinutes}
        editable={!locked}
        keyboardType="number-pad"
      />
      <TextField
        label={t('newCourse.weeks')}
        value={weeks}
        onChangeText={setWeeks}
        editable={!locked}
        keyboardType="number-pad"
      />
      {kind === 'study' && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('newCourse.filesNext')}
        </ThemedText>
      )}
      <TextField
        label={t('newCourse.material')}
        placeholder={t('newCourse.materialPlaceholder')}
        value={material}
        onChangeText={setMaterial}
        editable={!locked}
        multiline
        style={{ minHeight: 140, maxHeight: 300 }}
      />
      {materialText !== '' && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('newCourse.chars', { n: materialText.length, max: LIMITS.material })}
        </ThemedText>
      )}

      {(problem ?? error) && (
        <ThemedText style={{ color: theme.danger }}>{problem ?? error}</ThemedText>
      )}
      {busy && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('newCourse.planning')}
        </ThemedText>
      )}
      <Button
        title={t(courseId ? 'newCourse.tryAgain' : kind === 'study' ? 'newCourse.nextMaterial' : 'newCourse.create')}
        onPress={submit}
        disabled={cleanText(goal) === '' || problem !== null}
        busy={busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kinds: { flexDirection: 'row', gap: Spacing.two },
  kind: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  kindIcon: { fontSize: 32, lineHeight: 40 },
  center: { textAlign: 'center' },
});
