/**
 * Pure helpers for Korean text-to-speech (no device APIs, so they can be
 * unit tested). The speaking itself is in speech.ts.
 */

export type VoiceInfo = { identifier: string; language: string; quality: string };

/**
 * The best voice in the list for a language ('ko', 'en', ...), or null if
 * there is none. Prefers "Enhanced" quality voices (larger, more natural
 * ones on iOS).
 */
export function pickVoice(voices: readonly VoiceInfo[], lang: string): string | null {
  const code = lang.toLowerCase();
  const matching = voices.filter((v) => {
    const language = v.language.replace('_', '-').toLowerCase();
    return language === code || language.startsWith(`${code}-`);
  });
  const enhanced = matching.find((v) => v.quality === 'Enhanced');
  return (enhanced ?? matching[0])?.identifier ?? null;
}

export function pickKoreanVoice(voices: readonly VoiceInfo[]): string | null {
  return pickVoice(voices, 'ko');
}

/**
 * What to read aloud for a stored term or a sentence:
 * - alternatives "정말 / 진짜" get a short pause instead of "slash";
 * - placeholders are left out: "[Name]", blanks "__요" or "…요", and the
 *   marks grammar patterns start with ("-요", "~아/어요"), which voices would
 *   otherwise read as "underscore", "minus" or "tilde".
 */
export function textForSpeech(term: string): string {
  return (
    term
      .replace(/\[[^\]]*\]/g, '')
      // Blanks: two or more underscores or dots, or an ellipsis.
      .replace(/_{2,}|\.{3,}|…/g, ' ')
      .replace(/_/g, ' ')
      .replace(/[~～〜]/g, '')
      // A hyphen or dash right before a word (not between two words: "e-mail").
      .replace(/(^|[\s(/])[-–—]+(?=\S)/g, '$1')
      .replace(/\s*\/\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .trim()
  );
}

/** Hangul syllables and letters. */
const HANGUL = '\\uAC00-\\uD7A3\\u1100-\\u11FF\\u3130-\\u318F';
/** A stretch of Korean: Hangul, and the spaces, digits and punctuation between Hangul. */
const KOREAN_RUN = new RegExp(`[${HANGUL}](?:[${HANGUL}\\s\\d.,!?'"()~-]*[${HANGUL}.!?])?`, 'g');

/**
 * What to read aloud of a text in a language course: only the parts in the
 * language being learned, so an English translation or description is never
 * read by the Korean voice. For Korean that is every stretch of Hangul
 * (several stretches get a short pause between them). For a language whose
 * text cannot be told apart by its script, the whole text is returned.
 */
export function targetSpeech(text: string, lang: string): string {
  if (lang !== 'ko') return textForSpeech(text);
  const runs = text.match(KOREAN_RUN) ?? [];
  return runs
    .map((run) => textForSpeech(run))
    .filter((run) => run !== '')
    .join(', ');
}

export type SpeechPiece = { text: string; lang: string };

/** The text without brackets when they have no partner in it (a stretch cut out of "Water (물)."). */
function balanced(text: string): string {
  const opens = (text.match(/\(/g) ?? []).length;
  const closes = (text.match(/\)/g) ?? []).length;
  return opens === closes ? text : text.replace(/[()]/g, '');
}

/**
 * A text that mixes Korean with the learner's language, cut into stretches
 * of one language each, in order: every stretch of Hangul for the Korean
 * voice, everything between for the voice of `lang`. The cut is made by the
 * letters themselves, so English is never read by the Korean voice, however
 * the text was labelled. Without `lang` only the Korean is returned.
 */
export function splitKorean(text: string, lang: string | null): SpeechPiece[] {
  const pieces: SpeechPiece[] = [];
  const add = (piece: string, language: string | null) => {
    // Brackets around a translation are not read; a stretch with no letter
    // or digit left (". ", "(") is not read at all.
    const cleaned = textForSpeech(language === 'ko' ? balanced(piece) : piece.replace(/[()[\]]/g, ' '));
    if (!language || !/[\p{L}\p{N}]/u.test(cleaned)) return;
    const last = pieces[pieces.length - 1];
    if (last?.lang === language) last.text = `${last.text} ${cleaned}`;
    else pieces.push({ text: cleaned, lang: language });
  };
  let from = 0;
  for (const match of text.matchAll(KOREAN_RUN)) {
    add(text.slice(from, match.index), lang);
    add(match[0], 'ko');
    from = match.index + match[0].length;
  }
  add(text.slice(from), lang);
  return pieces;
}
