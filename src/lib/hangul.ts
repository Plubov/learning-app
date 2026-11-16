/**
 * Korean typing without a Korean keyboard installed: maps keys of a Latin
 * keyboard to Korean letters (jamo) in the standard two-set layout (두벌식)
 * and assembles jamo into syllables the way a Korean input method does
 * (ㄱ + ㅏ + ㄴ = 간). Pure functions, so they can be unit tested.
 *
 * Unicode background: a syllable block is one character, computed as
 *   0xAC00 + (initial * 21 + vowel) * 28 + final
 * from the positions of its parts in the three lists below. Single letters
 * outside a syllable use the "compatibility jamo" (ㄱ, ㅏ, …), which are also
 * what the lists are written in.
 */

const SYLLABLE_FIRST = 0xac00;
const SYLLABLE_LAST = 0xd7a3;

/** The 19 consonants that can start a syllable, in Unicode order. */
const INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
/** The 21 vowels, in Unicode order. */
const VOWELS = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
/** The 27 possible final consonants, in Unicode order ('' = no final). */
const FINALS = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

/** Two vowels typed one after the other that form one vowel (ㅗ + ㅏ = ㅘ). */
const VOWEL_PAIRS: Record<string, string> = {
  ㅗㅏ: 'ㅘ',
  ㅗㅐ: 'ㅙ',
  ㅗㅣ: 'ㅚ',
  ㅜㅓ: 'ㅝ',
  ㅜㅔ: 'ㅞ',
  ㅜㅣ: 'ㅟ',
  ㅡㅣ: 'ㅢ',
};
/** Two consonants that form one final consonant (ㄹ + ㄱ = ㄺ, as in 읽다). */
const FINAL_PAIRS: Record<string, string> = {
  ㄱㅅ: 'ㄳ',
  ㄴㅈ: 'ㄵ',
  ㄴㅎ: 'ㄶ',
  ㄹㄱ: 'ㄺ',
  ㄹㅁ: 'ㄻ',
  ㄹㅂ: 'ㄼ',
  ㄹㅅ: 'ㄽ',
  ㄹㅌ: 'ㄾ',
  ㄹㅍ: 'ㄿ',
  ㄹㅎ: 'ㅀ',
  ㅂㅅ: 'ㅄ',
};
const splitPair = (pairs: Record<string, string>, combined: string): string[] | null => {
  const key = Object.keys(pairs).find((k) => pairs[k] === combined);
  return key ? [...key] : null;
};

/**
 * Jamo of the standard Korean keyboard (two-set layout, 두벌식), named by the
 * letter printed on the same key of a US keyboard. A Korean keyboard goes by
 * key position, so other layouts are translated to these positions first.
 */
const KEY_TO_JAMO: Record<string, string> = {
  q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
  a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
  z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
  // With Shift: tense consonants and two more vowels.
  Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ',
};

/** Latin keyboard layouts of the computer; more can be added here. */
export type KeyboardLayout = 'qwerty' | 'qwertz';

/** The three letter rows as printed on each layout, left to right. */
const LAYOUT_ROWS: Record<KeyboardLayout, string[]> = {
  qwerty: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  // German, Austrian, Swiss: Z and Y swap places.
  qwertz: ['qwertzuiop', 'asdfghjkl', 'yxcvbnm'],
};

export const LAYOUT_NAMES: Record<KeyboardLayout, string> = {
  qwerty: 'US (QWERTY)',
  qwertz: 'German (QWERTZ)',
};

/** Languages whose usual keyboard is QWERTZ (German, Czech, Slovak, …). */
const QWERTZ_LANGUAGES = ['de', 'cs', 'sk', 'hu', 'sl', 'hr'];

/**
 * A first guess for the layout from a language tag such as "de-DE", used
 * until the learner picks one.
 */
export function layoutForLanguage(languageTag: string | undefined): KeyboardLayout {
  const language = (languageTag ?? '').toLowerCase().split('-')[0];
  return QWERTZ_LANGUAGES.includes(language) ? 'qwertz' : 'qwerty';
}

/** Printed letter on a layout → letter at the same position on a US keyboard. */
function toUsPosition(letter: string, layout: KeyboardLayout): string | null {
  const lower = letter.toLowerCase();
  for (const [r, row] of LAYOUT_ROWS[layout].entries()) {
    const column = row.indexOf(lower);
    if (column >= 0) {
      const us = LAYOUT_ROWS.qwerty[r][column];
      return letter === lower ? us : us.toUpperCase();
    }
  }
  return null;
}

/**
 * Keyboard rows for the on-screen keyboard: [printed letter, jamo, jamo with
 * Shift]. Same positions as on a physical Korean keyboard.
 */
export function keyboardRows(layout: KeyboardLayout): [string, string, string][][] {
  return LAYOUT_ROWS[layout].map((row) =>
    [...row].map((key) => {
      const jamo = jamoForKey(key, layout) ?? '';
      return [key, jamo, jamoForKey(key.toUpperCase(), layout) ?? jamo];
    }),
  );
}

/**
 * The jamo a key types on the given layout, or null for keys that are not
 * letters (digits, space, punctuation stay as they are). Capital letters
 * without a Shift meaning (e.g. "A") type the same as small ones.
 */
export function jamoForKey(key: string, layout: KeyboardLayout = 'qwerty'): string | null {
  const us = toUsPosition(key, layout);
  if (!us) return null;
  return KEY_TO_JAMO[us] ?? KEY_TO_JAMO[us.toLowerCase()] ?? null;
}

type Syllable = { initial: number; vowel: number; final: number };

function decompose(char: string | undefined): Syllable | null {
  if (!char) return null;
  const code = char.codePointAt(0) ?? 0;
  if (code < SYLLABLE_FIRST || code > SYLLABLE_LAST) return null;
  const offset = code - SYLLABLE_FIRST;
  return { initial: Math.floor(offset / 588), vowel: Math.floor((offset % 588) / 28), final: offset % 28 };
}

function compose({ initial, vowel, final }: Syllable): string {
  return String.fromCodePoint(SYLLABLE_FIRST + (initial * 21 + vowel) * 28 + final);
}

const isVowel = (jamo: string) => VOWELS.includes(jamo);

/**
 * Adds one typed jamo to the end of the text, joining it with the last
 * character where Korean input methods do:
 *   가 + ㄴ = 간,  간 + ㅏ = 가나,  읽 needs 일 + ㄱ,  ㄱ + ㅏ = 가,  오 + ㅏ = 와.
 * Anything that is not a jamo is simply appended.
 */
export function appendJamo(text: string, jamo: string): string {
  const head = text.slice(0, -1);
  const lastChar = text.slice(-1);
  const last = decompose(lastChar);

  if (isVowel(jamo)) {
    const vowel = VOWELS.indexOf(jamo);
    if (last && last.final > 0) {
      // The final consonant moves to the new syllable: 간 + ㅏ = 가나.
      // Of a double final only the second part moves: 읽 + ㅓ = 일거.
      const finalJamo = FINALS[last.final];
      const parts = splitPair(FINAL_PAIRS, finalJamo);
      const keep = parts ? FINALS.indexOf(parts[0]) : 0;
      const moving = parts ? parts[1] : finalJamo;
      return (
        head +
        compose({ ...last, final: keep }) +
        compose({ initial: INITIALS.indexOf(moving), vowel, final: 0 })
      );
    }
    if (last) {
      const combined = VOWEL_PAIRS[VOWELS[last.vowel] + jamo];
      return combined ? head + compose({ ...last, vowel: VOWELS.indexOf(combined) }) : text + jamo;
    }
    if (INITIALS.includes(lastChar)) {
      return head + compose({ initial: INITIALS.indexOf(lastChar), vowel, final: 0 });
    }
    const combined = VOWEL_PAIRS[lastChar + jamo];
    return combined ? head + combined : text + jamo;
  }

  if (FINALS.includes(jamo) && last) {
    if (last.final === 0) return head + compose({ ...last, final: FINALS.indexOf(jamo) });
    const combined = FINAL_PAIRS[FINALS[last.final] + jamo];
    if (combined) return head + compose({ ...last, final: FINALS.indexOf(combined) });
  }
  return text + jamo;
}

/**
 * Removes the last typed jamo instead of the whole last character, as
 * Backspace does in Korean input methods: 간 → 가 → ㄱ → (empty).
 */
export function deleteJamo(text: string): string {
  const head = text.slice(0, -1);
  const lastChar = text.slice(-1);
  const last = decompose(lastChar);
  if (last) {
    if (last.final > 0) {
      const parts = splitPair(FINAL_PAIRS, FINALS[last.final]);
      return head + compose({ ...last, final: parts ? FINALS.indexOf(parts[0]) : 0 });
    }
    const vowelParts = splitPair(VOWEL_PAIRS, VOWELS[last.vowel]);
    if (vowelParts) return head + compose({ ...last, vowel: VOWELS.indexOf(vowelParts[0]) });
    return head + INITIALS[last.initial];
  }
  const vowelParts = splitPair(VOWEL_PAIRS, lastChar);
  return vowelParts ? head + vowelParts[0] : head;
}

/**
 * Turns a change of a text field into Korean typing. `previous` is the text
 * before the change, `next` what the field reports after it:
 * - one letter typed at the end: becomes a jamo joined with the text,
 * - one character deleted at the end: only the last jamo is removed,
 * - anything else (pasting, typing in the middle, a real Korean keyboard):
 *   kept as it is.
 */
export function koreanTyping(
  previous: string,
  next: string,
  layout: KeyboardLayout = 'qwerty',
): string {
  if (next.length === previous.length + 1 && next.startsWith(previous)) {
    const jamo = jamoForKey(next.slice(-1), layout);
    return jamo ? appendJamo(previous, jamo) : next;
  }
  if (next.length === previous.length - 1 && previous.startsWith(next)) {
    return deleteJamo(previous);
  }
  return next;
}
