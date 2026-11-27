/**
 * Pure helpers for Korean text-to-speech (no device APIs, so they can be
 * unit tested). The speaking itself is in speech.ts.
 */

/** A voice as expo-speech lists it; `localService` is only known on the web. */
export type VoiceInfo = {
  identifier: string;
  name?: string;
  language: string;
  quality: string;
  /** Web: false for the browser's online voices (Google's in Chrome, Microsoft's "Natural" ones in Edge). */
  localService?: boolean;
};

/** A voice as the voices screen shows it. */
export type VoiceOption = { identifier: string; name: string; natural: boolean };

function speaks(voice: VoiceInfo, lang: string): boolean {
  const code = lang.toLowerCase();
  const language = voice.language.replace('_', '-').toLowerCase();
  return language === code || language.startsWith(`${code}-`);
}

/**
 * Whether a voice is one of the natural-sounding (neural) ones rather than
 * an older, robotic one. Devices say so in different ways:
 *   - iOS and Android: quality "Enhanced";
 *   - browsers report no quality, but their natural voices are online ones
 *     (`localService` false): "Google 한국의" in Chrome, "Microsoft SunHi
 *     Online (Natural)" in Edge;
 *   - otherwise the name or identifier says it: "(Natural)", "(Premium)",
 *     "(Enhanced)" (Safari), "-network" (Android's online Google voices).
 */
export function isNaturalVoice(voice: VoiceInfo): boolean {
  if (voice.quality === 'Enhanced' || voice.localService === false) return true;
  return (
    /\((natural|neural|premium|enhanced)\)|\bonline\b/i.test(voice.name ?? '') ||
    /-network$/i.test(voice.identifier)
  );
}

/**
 * A short, readable name for a voice:
 *   "Microsoft SunHi Online (Natural) - Korean (Korea)" → "SunHi",
 *   "ko-kr-x-ism-network" (Android) → "Google ISM (online)",
 *   "Yuna (Enhanced)" → "Yuna". Quality is shown separately.
 */
export function voiceName(voice: VoiceInfo): string {
  const name = voice.name || voice.identifier;
  const microsoft = name.match(/^Microsoft\s+(.+?)(?:\s+Desktop)?(?:\s+Online)?(?:\s+\([^)]*\))?\s+-\s+/);
  if (microsoft) return microsoft[1];
  const android = name.match(/^[a-z]{2,3}-[a-z]{2}-x-([a-z0-9]+)-(local|network)$/i);
  if (android) return `Google ${android[1].toUpperCase()}${android[2] === 'network' ? ' (online)' : ''}`;
  return name.replace(/\s+\((enhanced|premium|natural)\)$/i, '').trim();
}

/** The voices of one language ('ko', 'en', ...): natural ones first, then by name, each voice once. */
export function voiceOptions(voices: readonly VoiceInfo[], lang: string): VoiceOption[] {
  const seen = new Set<string>();
  return voices
    .filter((voice) => {
      if (!speaks(voice, lang) || seen.has(voice.identifier)) return false;
      seen.add(voice.identifier);
      return true;
    })
    .map((voice) => ({ identifier: voice.identifier, name: voiceName(voice), natural: isNaturalVoice(voice) }))
    .sort((a, b) => Number(b.natural) - Number(a.natural) || a.name.localeCompare(b.name));
}

/**
 * The standard voice per language where the device has it: Google's voices
 * on Android, chosen by the owner (shown as "Google KOD" and so on; the
 * identifiers look like "ko-kr-x-kod-local").
 */
export const STANDARD_VOICES: Record<string, string> = { ko: 'kod', de: 'deb', en: 'tpd', es: 'eff' };

/**
 * The voice the app picks for a language: the standard voice if the device
 * has it (the one on the device before the online one), else a natural one,
 * else any. Null if there is none at all.
 */
export function pickVoice(voices: readonly VoiceInfo[], lang: string): string | null {
  const options = voiceOptions(voices, lang);
  const standard = STANDARD_VOICES[lang.toLowerCase()];
  const named = (suffix: string) =>
    options.find((option) => option.identifier.toLowerCase().endsWith(`-x-${standard}-${suffix}`));
  const preferred = standard ? (named('local') ?? named('network')) : undefined;
  return (preferred ?? options[0])?.identifier ?? null;
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
