/**
 * Order in which new words are introduced. Pure functions; applied when
 * importing. Two rules:
 *
 * 1. Mix topics. Words from one set (colours, left/right, 이/그/저) learned
 *    on the same day interfere with each other. Each section of the file is
 *    spread evenly over the whole queue, so a day brings words from
 *    different sections.
 * 2. Building blocks first. A phrase comes at least GAP places after the
 *    words it contains: 독일 and 사람 before 독일 사람, both before
 *    저는 독일 사람이에요.
 *
 * Word frequency (common words first) is not used yet; see ROADMAP M3.
 */

/** Places between a word and the first phrase that uses it (about a day at 5–10 new words/day). */
export const PREREQUISITE_GAP = 8;

type Orderable = { term: string; section: string };

/** Token lists of a term, one per alternative ("a / b"). Brackets and punctuation removed. */
export function termForms(term: string): string[][] {
  return term
    .split('/')
    .map((alternative) =>
      alternative
        .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
        .replace(/[?!.,~…“”„"'·]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter((token) => token !== ''),
    )
    .filter((tokens) => tokens.length > 0);
}

const HANGUL_SYLLABLES = /[가-힣]/g;
const syllables = (s: string) => (s.match(HANGUL_SYLLABLES) ?? []).length;

/**
 * Whether a phrase token contains the last token of a component. Exact match
 * always counts; a prefix (사람 in 사람이에요) or a verb stem (맛있다 in
 * 맛있어요) only with at least two syllables, since one-syllable prefixes
 * (이, 저, 가) would match far too much.
 */
function tokenStartsWith(phraseToken: string, componentToken: string): boolean {
  if (phraseToken === componentToken) return true;
  if (syllables(componentToken) >= 2 && phraseToken.startsWith(componentToken)) return true;
  const stem = componentToken.endsWith('다') ? componentToken.slice(0, -1) : '';
  if (syllables(stem) >= 2 && phraseToken.startsWith(stem)) return true;
  // 하다 verbs change 하 to 해/했/한: 친절하다 in 친절해요, 친절한.
  const root = componentToken.endsWith('하다') ? componentToken.slice(0, -2) : '';
  return syllables(root) >= 2 && /^[해했하한]/.test(phraseToken.slice(root.length)) && phraseToken.startsWith(root);
}

/** Whether `component` (tokens) occurs in `phrase` (tokens) as a contiguous run. */
function containsForm(phrase: readonly string[], component: readonly string[]): boolean {
  if (component.length >= phrase.length) return false;
  for (let start = 0; start + component.length <= phrase.length; start++) {
    const middleMatches = component
      .slice(0, -1)
      .every((token, k) => phrase[start + k] === token);
    const last = component.length - 1;
    if (middleMatches && tokenStartsWith(phrase[start + last], component[last])) return true;
  }
  return false;
}

/**
 * For each term, the other terms it is built from. Only phrases (two or more
 * words) have building blocks; single words are never split.
 */
export function findPrerequisites(terms: readonly string[]): Map<string, string[]> {
  const forms = new Map(terms.map((term) => [term, termForms(term)]));
  const result = new Map<string, string[]>();
  for (const phrase of terms) {
    const phraseForms = forms.get(phrase) ?? [];
    if (!phraseForms.some((tokens) => tokens.length >= 2)) continue;
    const parts = terms.filter(
      (other) =>
        other !== phrase &&
        (forms.get(other) ?? []).some((component) =>
          phraseForms.some((tokens) => containsForm(tokens, component)),
        ),
    );
    if (parts.length > 0) result.set(phrase, parts);
  }
  return result;
}

/**
 * Spreads each section evenly over the list: an item's place is its relative
 * position inside its section. File order is kept within a section; ties go
 * to the section that comes first in the file.
 */
export function interleaveSections<T extends { section: string }>(items: readonly T[]): T[] {
  const sectionOrder: string[] = [];
  const sizes = new Map<string, number>();
  for (const { section } of items) {
    if (!sizes.has(section)) sectionOrder.push(section);
    sizes.set(section, (sizes.get(section) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const keyed = items.map((item) => {
    const index = seen.get(item.section) ?? 0;
    seen.set(item.section, index + 1);
    return {
      item,
      key: (index + 0.5) / (sizes.get(item.section) ?? 1),
      sectionIndex: sectionOrder.indexOf(item.section),
    };
  });
  keyed.sort((a, b) => a.key - b.key || a.sectionIndex - b.sectionIndex);
  return keyed.map(({ item }) => item);
}

/** Both rules: topics mixed, then each phrase moved behind its building blocks. */
export function orderForLearning<T extends Orderable>(items: readonly T[]): T[] {
  const mixed = interleaveSections(items);
  const rank = new Map(mixed.map((item, index) => [item.term, index]));
  const prerequisites = findPrerequisites(mixed.map((item) => item.term));

  // A phrase's place: its mixed place, but at least GAP after its last part.
  const place = new Map<string, number>();
  const placeOf = (term: string, visiting: Set<string>): number => {
    const known = place.get(term);
    if (known !== undefined) return known;
    visiting.add(term);
    let value = rank.get(term) ?? 0;
    for (const part of prerequisites.get(term) ?? []) {
      if (!visiting.has(part)) value = Math.max(value, placeOf(part, visiting) + PREREQUISITE_GAP);
    }
    visiting.delete(term);
    place.set(term, value);
    return value;
  };

  return mixed
    .map((item) => ({ item, place: placeOf(item.term, new Set()), rank: rank.get(item.term) ?? 0 }))
    .sort((a, b) => a.place - b.place || a.rank - b.rank)
    .map(({ item }) => item);
}
