/**
 * Text as it is stored: Unicode NFC and trimmed. Korean Hangul can be encoded
 * as whole syllables (NFC) or as separate letters (NFD); both look the same
 * but compare unequal, so everything is normalised before saving or comparing.
 */
export function cleanText(value: string): string {
  return value.normalize('NFC').trim();
}

/** Form used for comparing answers: cleaned, one space, lower case, " / ". */
function canonical(s: string): string {
  return cleanText(s).replace(/\s+/g, ' ').replace(/ ?\/ ?/g, ' / ').toLowerCase();
}

/**
 * The answers accepted for a stored term, besides the term itself:
 * - each side of a slash: "정말 / 진짜" accepts 정말 and 진짜
 * - without a bracketed addition: "덥다 (더워요)" accepts 덥다,
 *   "(만나서) 반가워요" accepts 반가워요 and also 만나서 반가워요
 */
export function acceptedAnswers(expected: string): string[] {
  const whole = canonical(expected);
  const variants = new Set([whole]);
  for (const alternative of whole.split(' / ')) {
    variants.add(alternative.trim());
    if (alternative.includes('(')) {
      variants.add(alternative.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim());
      variants.add(alternative.replace(/[()]/g, '').replace(/\s+/g, ' ').trim());
    }
  }
  variants.delete('');
  return [...variants];
}

/** "[Name]" in an accepted answer stands for any text the learner fills in. */
function matchesWithPlaceholders(typed: string, answer: string): boolean {
  if (!answer.includes('[')) return typed === answer;
  const pattern = answer
    .split(/\[[^\]]*\]/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+');
  return typed === answer || new RegExp(`^${pattern}$`).test(typed);
}

/**
 * Whether a typed answer matches the expected one. Both sides are cleaned,
 * runs of whitespace count as one space, and Latin letters ignore case.
 * Alternatives and optional parts are accepted (see acceptedAnswers).
 */
export function answersMatch(typed: string, expected: string): boolean {
  const answer = canonical(typed);
  if (answer === '') return false;
  return acceptedAnswers(expected).some((accepted) => matchesWithPlaceholders(answer, accepted));
}

/** Like cleanText, but an empty result becomes null (for optional fields). */
export function cleanOptionalText(value: string): string | null {
  const cleaned = cleanText(value);
  return cleaned === '' ? null : cleaned;
}
