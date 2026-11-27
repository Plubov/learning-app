/**
 * The guided run through a lesson: what is shown page by page, and what is
 * read aloud. Pure functions (randomness is a parameter), so they can be
 * tested; the session screen is src/components/session/practice-session.tsx,
 * which also runs practice and review sessions.
 *
 * Order of pages: the introduction cards one at a time, then the new items
 * in small groups, each group followed by a quick exercise per item (its
 * kind rotates: pick the meaning, pick the meaning only by ear, pick the
 * term for the meaning), then the lesson's sentence drills, and the key
 * points as a recap at the end.
 */
import { wordKey, type LessonExplanation, type LessonStep } from '@/lib/course-content';
import { exerciseFor, tilesFor, type Exercise } from '@/lib/exercises';
import { splitKorean, targetSpeech, textForSpeech } from '@/lib/speech-text';

export type FlowItem = { id: string; term: string; meaning: string; notes: string | null };

/** A page of a session: a lesson, a practice round or a review. */
export type FlowPage =
  | { kind: 'step'; step: LessonStep }
  | { kind: 'item'; item: FlowItem }
  | { kind: 'recap'; keyPoints: string[] }
  /** The items once more at a glance (start of a practice session). */
  | { kind: 'words'; words: Pick<FlowItem, 'id' | 'term' | 'meaning'>[] }
  /** `retry`: asked a second time at the end, after a wrong answer. */
  | { kind: 'exercise'; exercise: Exercise; retry: boolean };

/** Items shown before the learner is asked about them. */
const GROUP_SIZE = 2;
const OPTION_COUNT = 3;
/** Longest step made from an old one-text introduction, in characters. */
const OLD_STEP_LENGTH = 220;

/**
 * The introduction as steps, whichever way the lesson stored it. A lesson
 * prepared before steps existed has one text; it is cut into sentences and
 * its language is unknown (null), so only the items are read aloud.
 */
export function explanationSteps(explanation: LessonExplanation): {
  lang: string | null;
  steps: LessonStep[];
} {
  if ('steps' in explanation) return { lang: explanation.lang, steps: explanation.steps };
  const steps: LessonStep[] = [];
  for (const paragraph of explanation.intro.split(/\n+/)) {
    let current = '';
    for (const sentence of paragraph.trim().split(/(?<=[.!?])\s+/)) {
      if (current !== '' && current.length + sentence.length + 1 > OLD_STEP_LENGTH) {
        steps.push({ parts: [{ text: current, target: false }] });
        current = '';
      }
      current = current === '' ? sentence : `${current} ${sentence}`;
    }
    if (current !== '') steps.push({ parts: [{ text: current, target: false }] });
  }
  return { lang: null, steps };
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** The kinds of quick check, taken in turn so the run does not repeat itself. */
type CheckKind = 'meaning' | 'listen' | 'term';

/**
 * A quick check of `item`: pick its meaning, pick its meaning after only
 * hearing it (language courses), or pick the term for its meaning. Null when
 * the lesson has nothing else to offer as wrong options.
 */
function checkFor(
  item: FlowItem,
  all: readonly FlowItem[],
  kind: CheckKind,
  random: () => number,
): Exercise | null {
  const pick = (right: string, values: string[]) => {
    const others = [...new Set(values)].filter((value) => value !== right);
    if (others.length === 0) return null;
    return shuffled([right, ...shuffled(others, random).slice(0, OPTION_COUNT - 1)], random);
  };
  const base = { itemId: item.id, translation: '', explanation: '' };
  if (kind === 'term') {
    const options = pick(item.term, all.map((other) => other.term));
    return options && { kind: 'choice', ...base, prompt: item.meaning, options, answer: item.term };
  }
  const options = pick(item.meaning, all.map((other) => other.meaning));
  if (!options) return null;
  if (kind === 'listen') return { kind: 'listen', itemId: item.id, term: item.term, options, answer: item.meaning };
  return { kind: 'choice', ...base, prompt: item.term, options, answer: item.meaning };
}

/** A term as it shows up inside a sentence: without the marks grammar patterns start with ("-요"). */
function bareTerm(term: string): string {
  return term.normalize('NFC').replace(/^[-~～〜]+/, '').trim();
}

/**
 * Sentence drills for lessons prepared before the AI wrote drills: every
 * example of the introduction with a translation and 2 to 8 words becomes a
 * sentence to build from its translation, tied to the item it contains.
 * Examples without one of the lesson's items in them are left out.
 */
export function drillsFromExamples(
  steps: readonly LessonStep[],
  items: readonly FlowItem[],
  random: () => number = Math.random,
): Exercise[] {
  const examples = steps.flatMap((step) => (step.example && step.example.note !== '' ? [step.example] : []));
  const drills: Exercise[] = [];
  for (const example of examples) {
    const words = example.text.split(/\s+/).filter((word) => word !== '');
    if (words.length < 2 || words.length > 8) continue;
    const text = example.text.normalize('NFC');
    const item = items.find((candidate) => {
      const bare = bareTerm(candidate.term);
      return bare !== '' && text.includes(bare);
    });
    if (!item) continue;
    // Wrong tiles: words of the other examples that are not in this sentence.
    const own = words.map(wordKey);
    const others = examples
      .filter((other) => other !== example)
      .flatMap((other) => other.text.split(/\s+/))
      .map((word) => word.replace(/[.,!?。！？]+$/, ''))
      .filter((word) => word !== '' && !own.includes(wordKey(word)));
    const wrong = shuffled([...new Set(others)], random).slice(0, 2);
    drills.push({
      kind: 'build',
      itemId: item.id,
      prompt: example.note,
      answer: example.text,
      tiles: tilesFor(example.text, wrong, random),
      explanation: '',
    });
  }
  return drills;
}

/**
 * The pages of the guided run.
 * @param targetLang the language being learned; null for other subjects
 *   (then there is no listening and no sentence building)
 */
export function buildFlow(
  explanation: LessonExplanation,
  items: readonly FlowItem[],
  targetLang: string | null,
  random: () => number = Math.random,
): FlowPage[] {
  const { steps } = explanationSteps(explanation);
  const pages: FlowPage[] = steps.map((step) => ({ kind: 'step', step }));
  const exercise = (value: Exercise): FlowPage => ({ kind: 'exercise', exercise: value, retry: false });

  const kinds: CheckKind[] = targetLang ? ['meaning', 'listen', 'term'] : ['meaning', 'term'];
  let turn = 0;
  for (let start = 0; start < items.length; start += GROUP_SIZE) {
    const group = items.slice(start, start + GROUP_SIZE);
    for (const item of group) pages.push({ kind: 'item', item });
    // Asked in a different order than shown, so it is not just "the last one".
    for (const item of shuffled(group, random)) {
      const check = checkFor(item, items, kinds[turn % kinds.length], random);
      turn += 1;
      if (check) pages.push(exercise(check));
    }
  }

  // The drills the AI wrote with the lesson; older lessons get them from their examples.
  const written = 'steps' in explanation ? (explanation.drills ?? []) : [];
  const idOf = new Map(items.map((item) => [item.term, item.id]));
  const drills =
    written.length > 0
      ? written.flatMap((drill) => {
          const id = idOf.get(drill.term);
          return id ? exerciseFor(drill, id, targetLang, random) : [];
        })
      : targetLang
        ? drillsFromExamples(steps, items, random)
        : [];
  pages.push(...drills.map(exercise));

  if (explanation.key_points.length > 0) {
    pages.push({ kind: 'recap', keyPoints: explanation.key_points });
  }
  return pages;
}

/** A headline or example with a full stop, so the voice pauses after it. */
function sentence(text: string): string {
  return /[.!?:。]$/.test(text) ? text : `${text}.`;
}

/** A stretch of text to be spoken with one voice. */
export type SpeechSegment = { text: string; lang: string };

/**
 * What to read aloud for a page, as stretches of one language each.
 *
 * Explanations (steps, recap) are read; translations of words are not
 * (Carlos found them unnecessary). In a Korean course the text is cut by its
 * letters (splitKorean), so English is never read by the Korean voice.
 * @param lang the learner's language (null when unknown: that text is skipped)
 * @param targetLang the language being learned (null for other subjects)
 */
export function speechForPage(
  page: FlowPage,
  lang: string | null,
  targetLang: string | null,
): SpeechSegment[] {
  const segments: SpeechSegment[] = [];
  function add(text: string, language: string | null) {
    const cleaned = textForSpeech(text);
    if (cleaned === '' || !language) return;
    const last = segments[segments.length - 1];
    if (last?.lang === language) last.text = `${last.text} ${cleaned}`;
    else segments.push({ text: cleaned, lang: language });
  }
  if (targetLang) {
    /** An explanation: each stretch in the voice of its language. */
    const explain = (text: string) => {
      const pieces =
        targetLang === 'ko'
          ? splitKorean(text, lang)
          : [{ text: textForSpeech(text), lang: lang ?? targetLang }];
      for (const piece of pieces) {
        const last = segments[segments.length - 1];
        if (last?.lang === piece.lang) last.text = `${last.text} ${piece.text}`;
        else if (piece.text !== '') segments.push({ ...piece });
      }
    };
    if (page.kind === 'step') {
      const { title, parts, example } = page.step;
      if (targetLang === 'ko') {
        if (title) explain(sentence(title));
        explain(parts.map((part) => part.text).join(''));
        if (example) explain(example.text);
      } else {
        // No script to tell the languages apart: the model's labels decide.
        if (title) add(sentence(title), lang);
        for (const part of parts) add(part.text, part.target ? targetLang : lang);
        if (example) add(example.text, targetLang);
      }
      // The example's translation is on screen, like the translation of a word.
    } else if (page.kind === 'item') {
      // The word only; its translation is on screen.
      const word = targetSpeech(page.item.term, targetLang);
      if (word !== '') segments.push({ text: word, lang: targetLang });
    } else if (page.kind === 'recap') {
      for (const point of page.keyPoints) explain(point);
    }
    return segments;
  }
  if (page.kind === 'step') {
    const { title, parts, example } = page.step;
    if (title) add(sentence(title), lang);
    for (const part of parts) add(part.text, lang);
    if (example) add(example.note === '' ? example.text : `${sentence(example.text)} ${example.note}`, lang);
  } else if (page.kind === 'item') {
    // Term and meaning in the learner's language; the colon makes the voice pause.
    add(`${page.item.term}: ${page.item.meaning}`, lang);
  } else if (page.kind === 'recap') {
    for (const point of page.keyPoints) add(point, lang);
  }
  return segments;
}
