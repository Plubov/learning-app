/**
 * Text as it is stored: Unicode NFC and trimmed. Korean Hangul can be encoded
 * as whole syllables (NFC) or as separate letters (NFD); both look the same
 * but compare unequal, so everything is normalised before saving or comparing.
 */
export function cleanText(value: string): string {
  return value.normalize('NFC').trim();
}

/** Like cleanText, but an empty result becomes null (for optional fields). */
export function cleanOptionalText(value: string): string | null {
  const cleaned = cleanText(value);
  return cleaned === '' ? null : cleaned;
}
