/**
 * The guided run through a lesson: what is shown page by page, and what is
 * read aloud. Pure functions (randomness is a parameter), so they can be
 * tested; the screen part is src/components/session/lesson-flow.tsx.
 *
 * Order of pages: the introduction cards one at a time, then the new items
 * in small groups, each group followed by a quick check of those items, and
 * the key points as a recap at the end.
 */
import type { LessonExplanation, LessonStep } from '@/lib/course-content';
import { splitKorean, targetSpeech, textForSpeech } from '@/lib/speech-text';

export type FlowItem = { id: string; term: string; meaning: string; notes: string | null };

export type FlowPage =
  | { kind: 'step'; step: LessonStep }
  | { kind: 'item'; item: FlowItem }
  /** "What does <term> mean?" with the meanings of other items as wrong options. */
  | { kind: 'check'; item: FlowItem; options: string[] }
  | { kind: 'recap'; keyPoints: string[] };

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

/** A check for `item`, or null when the lesson has no other meaning to offer. */
function checkFor(item: FlowItem, all: readonly FlowItem[], random: () => number): FlowPage | null {
  const others = [...new Set(all.map((other) => other.meaning))].filter(
    (meaning) => meaning !== item.meaning,
  );
  if (others.length === 0) return null;
  const wrong = shuffled(others, random).slice(0, OPTION_COUNT - 1);
  return { kind: 'check', item, options: shuffled([item.meaning, ...wrong], random) };
}

export function buildFlow(
  explanation: LessonExplanation,
  items: readonly FlowItem[],
  random: () => number = Math.random,
): FlowPage[] {
  const pages: FlowPage[] = explanationSteps(explanation).steps.map((step) => ({
    kind: 'step',
    step,
  }));
  for (let start = 0; start < items.length; start += GROUP_SIZE) {
    const group = items.slice(start, start + GROUP_SIZE);
    for (const item of group) pages.push({ kind: 'item', item });
    // Asked in a different order than shown, so it is not just "the last one".
    for (const item of shuffled(group, random)) {
      const check = checkFor(item, items, random);
      if (check) pages.push(check);
    }
  }
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
    } else if (page.kind === 'item' || page.kind === 'check') {
      // The word only; its translation is on screen.
      const word = targetSpeech(page.item.term, targetLang);
      if (word !== '') segments.push({ text: word, lang: targetLang });
    } else {
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
