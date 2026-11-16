/**
 * The exercises of one practice session. Pure functions (randomness is a
 * parameter), so they can be tested; the screens are in
 * src/components/session/.
 *
 * A session mixes two sources:
 *   - the questions the AI wrote for the learner's level (multiple choice,
 *     typed answer, building a sentence from word tiles), and
 *   - exercises made here from the lesson's own items, without AI: matching
 *     pairs and, for language courses, listening.
 */
import { wordKey, type Question } from '@/lib/course-content';
import type { TextKey } from '@/lib/i18n/en';

export type PracticeItem = { id: string; term: string; meaning: string; proficiency: number };

export type MatchPair = { itemId: string; term: string; meaning: string };

export type Exercise =
  | { kind: 'choice'; itemId: string; prompt: string; options: string[]; answer: string; explanation: string }
  | { kind: 'typed'; itemId: string; prompt: string; answer: string; explanation: string }
  /** Put `tiles` in order to translate `prompt`; `answer` is the sentence. */
  | { kind: 'build'; itemId: string; prompt: string; tiles: string[]; answer: string; explanation: string }
  /** Hear `term`, pick its meaning. */
  | { kind: 'listen'; itemId: string; term: string; options: string[]; answer: string }
  /** Tap a term and its meaning; `meanings` is the shuffled right-hand column. */
  | { kind: 'match'; pairs: MatchPair[]; meanings: string[] };

const MATCH_PAIRS = 4;
const MIN_MATCH_PAIRS = 3;
const LISTEN_COUNT = 2;
const OPTION_COUNT = 3;

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** The word tiles for a sentence: its words plus the wrong ones, mixed. */
export function tilesFor(answer: string, extra: readonly string[], random: () => number): string[] {
  // Punctuation at the end of the sentence would give away the last tile.
  const words = answer.split(/\s+/).map((word) => word.replace(/[.!?。！？]+$/, ''));
  return shuffled([...words, ...extra].filter((word) => word !== ''), random);
}

/** Whether the tiles, in the order chosen, make the sentence. */
export function sentenceMatches(chosen: readonly string[], answer: string): boolean {
  const key = (words: readonly string[]) => words.map(wordKey).filter((word) => word !== '').join(' ');
  return key(chosen) === key(answer.split(/\s+/));
}

/** Items that differ from each other in both term and meaning, weakest first. */
function distinctWeakest(items: readonly PracticeItem[]): PracticeItem[] {
  const terms = new Set<string>();
  const meanings = new Set<string>();
  const result: PracticeItem[] = [];
  for (const item of [...items].sort((a, b) => a.proficiency - b.proficiency)) {
    if (terms.has(item.term) || meanings.has(item.meaning)) continue;
    terms.add(item.term);
    meanings.add(item.meaning);
    result.push(item);
  }
  return result;
}

/**
 * The exercises of a session, in order.
 * @param targetLang the language being learned; null for other subjects
 *   (then there is no listening and no sentence building)
 */
export function buildExercises(
  questions: readonly Question[],
  items: readonly PracticeItem[],
  targetLang: string | null,
  random: () => number = Math.random,
): Exercise[] {
  const fromAi: Exercise[] = [];
  for (const question of questions) {
    const base = { itemId: question.item_id, prompt: question.prompt, answer: question.answer, explanation: question.explanation };
    if (question.kind === 'choice') {
      fromAi.push({ kind: 'choice', ...base, options: question.options });
    } else if (question.kind === 'build' && targetLang) {
      fromAi.push({ kind: 'build', ...base, tiles: tilesFor(question.answer, question.options, random) });
    } else if (question.kind === 'typed') {
      fromAi.push({ kind: 'typed', ...base });
    }
  }

  const distinct = distinctWeakest(items);
  const extras: Exercise[] = [];
  const listening: Exercise[] = [];
  if (targetLang && distinct.length >= OPTION_COUNT) {
    for (const item of distinct.slice(0, LISTEN_COUNT)) {
      const wrong = shuffled(distinct.filter((other) => other.id !== item.id), random)
        .slice(0, OPTION_COUNT - 1)
        .map((other) => other.meaning);
      listening.push({
        kind: 'listen',
        itemId: item.id,
        term: item.term,
        answer: item.meaning,
        options: shuffled([item.meaning, ...wrong], random),
      });
    }
  }
  if (listening[0]) extras.push(listening[0]);
  if (distinct.length >= MIN_MATCH_PAIRS) {
    const pairs = distinct
      .slice(0, MATCH_PAIRS)
      .map((item) => ({ itemId: item.id, term: item.term, meaning: item.meaning }));
    extras.push({
      kind: 'match',
      pairs: shuffled(pairs, random),
      meanings: shuffled(pairs.map((pair) => pair.meaning), random),
    });
  }
  if (listening[1]) extras.push(listening[1]);

  // Spread the app's own exercises evenly between the AI's questions.
  const result = [...fromAi];
  extras.forEach((extra, i) => {
    const position = Math.round(((i + 1) * fromAi.length) / (extras.length + 1)) + i;
    result.splice(position, 0, extra);
  });
  return result;
}

/** The key of a short word of praise; varies so it does not wear out. */
export function praise(random: () => number = Math.random): TextKey {
  const keys: TextKey[] = ['praise.1', 'praise.2', 'praise.3', 'praise.4', 'praise.5'];
  return keys[Math.floor(random() * keys.length)];
}
