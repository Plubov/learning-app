import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { planCourse } from '@/lib/ai';
import { LIMITS } from '@/lib/course-content';
import { supabase } from '@/lib/supabase';
import { cleanOptionalText, cleanText } from '@/lib/text';

/** A whole number from the field within [min, max], or null when it is empty or not one. */
function wholeNumber(value: string, min: number, max: number): number | null {
  const number = Number(value.trim());
  if (value.trim() === '' || !Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

export default function NewCourseScreen() {
  const theme = useTheme();
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
  if (cleanText(goal).length > LIMITS.goal) problem = `The goal can be at most ${LIMITS.goal} characters.`;
  else if (minutesPerDay === null) problem = 'Minutes per day must be a number from 5 to 480.';
  else if (weeks.trim() !== '' && weeksWanted === null) problem = 'Weeks must be a number from 1 to 104, or empty.';
  else if (materialText.length > LIMITS.material) {
    problem = `The material is ${materialText.length} characters long; at most ${LIMITS.material} fit. Paste the most important part.`;
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
      await planCourse(id);
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
      <TextField
        label="What do you want to learn?"
        placeholder="e.g. Hold a simple conversation in Korean on a trip next spring"
        value={goal}
        onChangeText={setGoal}
        editable={!locked}
        multiline
        autoFocus
      />
      <TextField
        label="What do you already know? (optional)"
        placeholder="e.g. I can read Hangul and know about 100 words"
        value={level}
        onChangeText={setLevel}
        editable={!locked}
        multiline
      />
      <TextField
        label="Minutes per day"
        value={minutes}
        onChangeText={setMinutes}
        editable={!locked}
        keyboardType="number-pad"
      />
      <TextField
        label="Weeks (optional; leave empty to let the plan decide)"
        value={weeks}
        onChangeText={setWeeks}
        editable={!locked}
        keyboardType="number-pad"
      />
      <TextField
        label="Course material (optional)"
        placeholder="Paste a syllabus, notes, a table of contents or a video transcript"
        value={material}
        onChangeText={setMaterial}
        editable={!locked}
        multiline
        style={{ minHeight: 140, maxHeight: 300 }}
      />
      {materialText !== '' && (
        <ThemedText type="small" themeColor="textSecondary">
          {materialText.length} of {LIMITS.material} characters
        </ThemedText>
      )}

      {(problem ?? error) && (
        <ThemedText style={{ color: theme.danger }}>{problem ?? error}</ThemedText>
      )}
      {busy && (
        <ThemedText type="small" themeColor="textSecondary">
          Planning your course. This happens once and can take a minute or two.
        </ThemedText>
      )}
      <Button
        title={courseId ? 'Try again' : 'Create my plan'}
        onPress={submit}
        disabled={cleanText(goal) === '' || problem !== null}
        busy={busy}
      />
    </Screen>
  );
}
