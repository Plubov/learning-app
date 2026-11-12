/**
 * Pure helpers for Korean text-to-speech (no device APIs, so they can be
 * unit tested). The speaking itself is in speech.ts.
 */

export type VoiceInfo = { identifier: string; language: string; quality: string };

/**
 * The best Korean voice in the list, or null if there is none. Prefers
 * "Enhanced" quality voices (larger, more natural ones on iOS).
 */
export function pickKoreanVoice(voices: readonly VoiceInfo[]): string | null {
  const korean = voices.filter((v) => v.language.replace('_', '-').toLowerCase().startsWith('ko'));
  const enhanced = korean.find((v) => v.quality === 'Enhanced');
  return (enhanced ?? korean[0])?.identifier ?? null;
}

/**
 * What to read aloud for a stored term: alternatives "정말 / 진짜" get a
 * short pause instead of "slash", and placeholders like "[Name]" are left out.
 */
export function textForSpeech(term: string): string {
  return term
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s*\/\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}
