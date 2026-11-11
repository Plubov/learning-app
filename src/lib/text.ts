/**
 * Text as it is stored: Unicode NFC and trimmed. Korean Hangul can be encoded
 * as whole syllables (NFC) or as separate letters (NFD); both look the same
 * but compare unequal, so everything is normalised before saving or comparing.
 */
export function cleanText(value: string): string {
  return value.normalize('NFC').trim();
}

/**
 * Whether a typed answer matches the expected one. Both sides are cleaned,
 * runs of whitespace count as one space, and Latin letters ignore case.
 */
export function answersMatch(typed: string, expected: string): boolean {
  const canonical = (s: string) => cleanText(s).replace(/\s+/g, ' ').toLowerCase();
  return canonical(typed) === canonical(expected);
}

/** Like cleanText, but an empty result becomes null (for optional fields). */
export function cleanOptionalText(value: string): string | null {
  const cleaned = cleanText(value);
  return cleaned === '' ? null : cleaned;
}
