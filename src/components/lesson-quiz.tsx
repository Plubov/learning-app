import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { KoreanTextField } from '@/components/korean-text-field';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Question } from '@/lib/course-content';
import { getDeviceId } from '@/lib/device-id';
import { supabase } from '@/lib/supabase';
import { answersMatch, cleanText } from '@/lib/text';

type Props = {
  lessonId: string;
  questions: Question[];
  /** 'ko' gives typed answers the Korean field. */
  targetLang: string | null;
  /** Called once, after the last question has been answered and "Finish" pressed. */
  onFinished: (correct: number, total: number) => void;
};

type Result = { given: string; correct: boolean };

/**
 * Runs a quiz one question at a time. Every answer is appended to the
 * learning record (review_events, through record_quiz_answer) as structured
 * data, so it counts towards the item's proficiency.
 */
export function LessonQuiz({ lessonId, questions, targetLang, onFinished }: Props) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // When the current question appeared, for the answer time.
  const [shownAt, setShownAt] = useState(() => new Date().getTime());

  const question = questions[index];
  const last = index === questions.length - 1;

  async function answer(given: string) {
    if (result) return;
    const correct =
      question.kind === 'choice' ? given === question.answer : answersMatch(given, question.answer);
    setResult({ given, correct });
    if (correct) setCorrectCount((n) => n + 1);
    setError(null);
    const now = new Date();
    const { error: saveError } = await supabase.rpc('record_quiz_answer', {
      p_lesson_id: lessonId,
      p_item_id: question.item_id,
      p_correct: correct,
      p_response: { type: question.kind === 'choice' ? 'choice' : 'text', value: cleanText(given) },
      p_reviewed_at: now.toISOString(),
      p_duration_ms: now.getTime() - shownAt,
      p_device_id: await getDeviceId(),
    });
    if (saveError) setError(`The answer could not be saved: ${saveError.message}`);
  }

  function next() {
    if (last) {
      onFinished(correctCount, questions.length);
      return;
    }
    setIndex(index + 1);
    setTyped('');
    setResult(null);
    setShownAt(new Date().getTime());
  }

  const AnswerField = targetLang === 'ko' ? KoreanTextField : TextField;
  return (
    <View style={styles.quiz}>
      <ThemedText type="small" themeColor="textSecondary">
        Question {index + 1} of {questions.length}
      </ThemedText>
      <ThemedText>{question.prompt}</ThemedText>

      {question.kind === 'choice' &&
        question.options.map((option) => {
          const isAnswer = result !== null && option === question.answer;
          const isWrongPick = result !== null && option === result.given && !result.correct;
          return (
            <Pressable
              key={option}
              onPress={() => answer(option)}
              disabled={result !== null}
              accessibilityRole="button">
              <ThemedView
                type="backgroundElement"
                style={[
                  styles.option,
                  { borderColor: theme.border },
                  isAnswer && { borderColor: theme.tint, borderWidth: 2 },
                  isWrongPick && { borderColor: theme.danger, borderWidth: 2 },
                ]}>
                <ThemedText>{option}</ThemedText>
              </ThemedView>
            </Pressable>
          );
        })}

      {question.kind === 'typed' && !result && (
        <>
          <AnswerField
            key={index} // a fresh, focused input for every question
            value={typed}
            onChangeText={setTyped}
            onSubmitEditing={() => answer(typed)}
            placeholder="Your answer"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            submitBehavior="submit"
          />
          <Button title="Check" onPress={() => answer(typed)} />
        </>
      )}

      {result && (
        <>
          <ThemedText type="smallBold" style={{ color: result.correct ? theme.tint : theme.danger }}>
            {result.correct ? 'Correct' : 'Not quite'}
          </ThemedText>
          {question.kind === 'typed' && !result.correct && (
            <ThemedText>
              You typed: {result.given === '' ? '(nothing)' : result.given}
              {'\n'}Answer: {question.answer}
            </ThemedText>
          )}
          {question.explanation !== '' && (
            <ThemedText type="small" themeColor="textSecondary">
              {question.explanation}
            </ThemedText>
          )}
          {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
          <Button title={last ? 'Finish' : 'Next question'} onPress={next} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  quiz: { gap: Spacing.three },
  option: { padding: Spacing.three, borderRadius: Spacing.two, borderWidth: 1 },
});
