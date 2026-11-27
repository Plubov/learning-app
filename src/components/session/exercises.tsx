import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { KoreanTextField } from '@/components/korean-text-field';
import { OptionCard, type OptionState } from '@/components/session/option-card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import { sentenceMatches, type Exercise, type MatchPair } from '@/lib/exercises';
import { answersMatch } from '@/lib/text';

/**
 * One component per kind of exercise. Each shows the task, takes the
 * learner's answer and reports it once through `onAnswer`; the practice
 * session around them shows the feedback and moves on.
 */

/** The small line above a task that says what to do. */
function Instruction({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.instruction}>
      {children}
    </ThemedText>
  );
}

type AnswerProps = {
  /** The answer given, once there is one; the exercise is then locked. */
  given: string | null;
  onAnswer: (given: string, correct: boolean) => void;
};

/** Multiple choice. Also used for listening, where `onListen` replays the word. */
export function ChoiceExercise({
  instruction,
  prompt,
  translation,
  options,
  answer,
  onListen,
  given,
  onAnswer,
}: AnswerProps & {
  instruction: string;
  prompt?: string;
  /** The prompt in the learner's language, shown after answering ('' for none). */
  translation?: string;
  options: string[];
  answer: string;
  onListen?: () => void;
}) {
  const theme = useTheme();
  const { t } = useT();
  function stateOf(option: string): OptionState {
    if (given === null) return 'idle';
    if (option === answer) return 'correct';
    return option === given ? 'wrong' : 'done';
  }
  return (
    <View style={styles.exercise}>
      <Instruction>{instruction}</Instruction>
      {prompt !== undefined && <ThemedText style={styles.prompt}>{prompt}</ThemedText>}
      {/* Shown only after answering: before, it would give the answer away. */}
      {given !== null && translation && (
        <ThemedText themeColor="textSecondary">{translation}</ThemedText>
      )}
      {onListen && (
        <Pressable
          onPress={onListen}
          accessibilityRole="button"
          accessibilityLabel={t('ex.playAgain')}
          style={({ pressed }) => [
            styles.listen,
            { backgroundColor: theme.tint },
            pressed && styles.pressed,
          ]}>
          <ThemedText style={styles.listenIcon}>🔊</ThemedText>
        </Pressable>
      )}
      <View style={styles.options}>
        {options.map((option) => (
          <OptionCard
            key={option}
            label={option}
            state={stateOf(option)}
            disabled={given !== null}
            onPress={() => onAnswer(option, option === answer)}
          />
        ))}
      </View>
    </View>
  );
}

/** A typed answer, compared the way reviews compare typed answers. */
export function TypedExercise({
  prompt,
  answer,
  korean,
  given,
  onAnswer,
}: AnswerProps & { prompt: string; answer: string; korean: boolean }) {
  const { t } = useT();
  const [typed, setTyped] = useState('');
  const AnswerField = korean ? KoreanTextField : TextField;
  const submit = () => onAnswer(typed, answersMatch(typed, answer));
  return (
    <View style={styles.exercise}>
      <Instruction>{t('ex.type')}</Instruction>
      <ThemedText style={styles.prompt}>{prompt}</ThemedText>
      {given === null ? (
        <>
          <AnswerField
            value={typed}
            onChangeText={setTyped}
            onSubmitEditing={submit}
            placeholder={t('ex.yourAnswer')}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            submitBehavior="submit"
          />
          <Button title={t('common.check')} onPress={submit} disabled={typed.trim() === ''} />
        </>
      ) : (
        <ThemedView type="backgroundElement" style={styles.typedAnswer}>
          <ThemedText style={styles.prompt}>{given === '' ? t('ex.nothing') : given}</ThemedText>
        </ThemedView>
      )}
    </View>
  );
}

/** Building a sentence: tap word tiles into order; tap a placed one to take it back. */
export function BuildExercise({
  prompt,
  tiles,
  answer,
  given,
  onAnswer,
}: AnswerProps & { prompt: string; tiles: string[]; answer: string }) {
  const theme = useTheme();
  const { t } = useT();
  // Positions in `tiles`, in the order they were tapped (a word can occur twice).
  const [chosen, setChosen] = useState<number[]>([]);
  const locked = given !== null;
  const words = chosen.map((index) => tiles[index]);

  return (
    <View style={styles.exercise}>
      <Instruction>{t('ex.build')}</Instruction>
      <ThemedText style={styles.prompt}>{prompt}</ThemedText>

      <View style={[styles.sentence, { borderColor: theme.border }]}>
        {chosen.map((index) => (
          <OptionCard
            key={index}
            compact
            label={tiles[index]}
            state="selected"
            disabled={locked}
            onPress={() => setChosen(chosen.filter((other) => other !== index))}
          />
        ))}
      </View>

      <View style={styles.bank}>
        {tiles.map((tile, index) => (
          <OptionCard
            key={index}
            compact
            label={tile}
            state={chosen.includes(index) ? 'done' : 'idle'}
            disabled={locked || chosen.includes(index)}
            onPress={() => setChosen([...chosen, index])}
          />
        ))}
      </View>

      {!locked && (
        <Button
          title={t('common.check')}
          disabled={chosen.length === 0}
          onPress={() => onAnswer(words.join(' '), sentenceMatches(words, answer))}
        />
      )}
    </View>
  );
}

/**
 * Filling a gap: the sentence with its gap marked, the options below as
 * tiles. Tapping one puts it into the gap and checks it at once; the
 * sentence's translation helps to know what is meant.
 */
export function ClozeExercise({
  prompt,
  options,
  answer,
  translation,
  given,
  onAnswer,
}: AnswerProps & { prompt: string; options: string[]; answer: string; translation: string }) {
  const theme = useTheme();
  const { t } = useT();
  const [before, after = ''] = prompt.split('___');
  const filled = given ?? null;
  const gapColor = filled === null ? theme.tint : filled === answer ? theme.success : theme.danger;

  function stateOf(option: string): OptionState {
    if (given === null) return 'idle';
    if (option === answer) return 'correct';
    return option === given ? 'wrong' : 'done';
  }

  return (
    <View style={styles.exercise}>
      <Instruction>{t('ex.cloze')}</Instruction>
      <ThemedText style={styles.prompt}>
        {before}
        <ThemedText style={[styles.prompt, styles.gap, { color: gapColor, textDecorationColor: gapColor }]}>
          {filled === null ? '   ' : ` ${filled} `}
        </ThemedText>
        {after}
      </ThemedText>
      {translation !== '' && <ThemedText themeColor="textSecondary">{translation}</ThemedText>}
      {given !== null && given !== answer && (
        <ThemedText style={[styles.prompt, { color: theme.success }]}>{before + answer + after}</ThemedText>
      )}
      <View style={styles.bank}>
        {options.map((option) => (
          <OptionCard
            key={option}
            compact
            label={option}
            state={stateOf(option)}
            disabled={given !== null}
            onPress={() => onAnswer(option, option === answer)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Matching pairs: tap a term on the left and its meaning on the right.
 * `onPair` reports every attempt (for the learning record and the sound);
 * `onDone` is called once all pairs are found, with the number of misses.
 */
export function MatchExercise({
  pairs,
  meanings,
  onPair,
  onDone,
}: {
  pairs: MatchPair[];
  meanings: string[];
  onPair: (pair: MatchPair, givenMeaning: string, correct: boolean) => void;
  onDone: (mistakes: number) => void;
}) {
  const { t } = useT();
  const [term, setTerm] = useState<string | null>(null); // selected on the left
  const [meaning, setMeaning] = useState<string | null>(null); // selected on the right
  const [matched, setMatched] = useState<string[]>([]); // item ids
  const [missed, setMissed] = useState<{ term: string; meaning: string } | null>(null);
  const [mistakes, setMistakes] = useState(0);

  function attempt(nextTerm: string | null, nextMeaning: string | null) {
    setMissed(null);
    if (nextTerm === null || nextMeaning === null) {
      setTerm(nextTerm);
      setMeaning(nextMeaning);
      return;
    }
    const pair = pairs.find((candidate) => candidate.term === nextTerm);
    if (!pair) return;
    const correct = pair.meaning === nextMeaning;
    onPair(pair, nextMeaning, correct);
    setTerm(null);
    setMeaning(null);
    if (correct) {
      const nowMatched = [...matched, pair.itemId];
      setMatched(nowMatched);
      if (nowMatched.length === pairs.length) onDone(mistakes);
    } else {
      setMistakes(mistakes + 1);
      setMissed({ term: nextTerm, meaning: nextMeaning });
    }
  }

  const matchedPairs = pairs.filter((pair) => matched.includes(pair.itemId));
  function stateOf(value: string, side: 'term' | 'meaning'): OptionState {
    if (matchedPairs.some((pair) => pair[side] === value)) return 'done';
    if (missed?.[side] === value) return 'wrong';
    if ((side === 'term' ? term : meaning) === value) return 'selected';
    return 'idle';
  }

  return (
    <View style={styles.exercise}>
      <Instruction>{t('ex.match')}</Instruction>
      <View style={styles.columns}>
        <View style={styles.column}>
          {pairs.map((pair) => (
            <OptionCard
              key={pair.itemId}
              label={pair.term}
              state={stateOf(pair.term, 'term')}
              disabled={matched.includes(pair.itemId)}
              onPress={() => attempt(term === pair.term ? null : pair.term, meaning)}
            />
          ))}
        </View>
        <View style={styles.column}>
          {meanings.map((option) => (
            <OptionCard
              key={option}
              label={option}
              state={stateOf(option, 'meaning')}
              disabled={matchedPairs.some((pair) => pair.meaning === option)}
              onPress={() => attempt(term, meaning === option ? null : option)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/** What an exercise is called in the learning record (`response.exercise`). */
export type ExerciseKind = Exercise['kind'];

const styles = StyleSheet.create({
  exercise: { gap: Spacing.three },
  instruction: { textTransform: 'uppercase', letterSpacing: 0.5 },
  prompt: { fontSize: 22, lineHeight: 32, fontWeight: 600 },
  options: { gap: Spacing.two },
  listen: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listenIcon: { fontSize: 40, lineHeight: 52 },
  pressed: { opacity: 0.7 },
  typedAnswer: { padding: Spacing.three, borderRadius: Spacing.three },
  sentence: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    minHeight: 64,
    paddingVertical: Spacing.two,
    borderBottomWidth: 2,
  },
  bank: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  gap: { textDecorationLine: 'underline', fontWeight: 700 },
  columns: { flexDirection: 'row', gap: Spacing.three },
  column: { flex: 1, gap: Spacing.two },
});
