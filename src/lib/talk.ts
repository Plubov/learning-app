/**
 * Checking a spoken (or typed) answer in a conversation against the answers
 * the AI wrote for that turn. Pure functions, so they can be tested; the
 * session is src/components/session/talk-session.tsx.
 *
 * Speech recognition gets spacing and punctuation wrong more often than the
 * words, and it mishears a sound here and there, so the comparison ignores
 * spaces and punctuation and allows a small difference. Korean is compared
 * letter by letter (jamo: ㅁ ㅜ ㄹ, not the syllable 물), so one wrong vowel
 * costs little.
 */

/** At least this similar (0..1) to one of the answers counts as right. */
export const ACCEPT = 0.75;

/** The text as compared: no spaces or punctuation, lower case, Hangul split into its letters. */
export function speechKey(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
    .normalize('NFD');
}

/** Edit distance (insertions, deletions, substitutions) between two strings. */
function distance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

/** How alike two answers are, from 0 (nothing in common) to 1 (the same). */
export function similarity(a: string, b: string): number {
  const x = speechKey(a);
  const y = speechKey(b);
  if (x === '' || y === '') return 0;
  return 1 - distance(x, y) / Math.max(x.length, y.length);
}

export type Judgement = {
  correct: boolean;
  /** The answer it came closest to (the first one when nothing was heard). */
  closest: string;
  /** What was heard that came closest. */
  heard: string;
  score: number;
};

/**
 * Compares every alternative the recogniser heard (or the one typed text)
 * with every fitting answer and keeps the best pair.
 */
export function judgeAnswer(heard: readonly string[], answers: readonly string[]): Judgement {
  let best: Judgement = { correct: false, closest: answers[0] ?? '', heard: heard[0] ?? '', score: 0 };
  for (const said of heard) {
    for (const answer of answers) {
      const score = similarity(said, answer);
      if (score > best.score) best = { correct: score >= ACCEPT, closest: answer, heard: said, score };
    }
  }
  return best;
}
