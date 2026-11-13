import { appendJamo, deleteJamo, jamoForKey, KEYBOARD_ROWS, koreanTyping } from '@/lib/hangul';

/** Types the keys one by one, like on a Korean keyboard. */
function typeKeys(keys: string, start = ''): string {
  return [...keys].reduce((text, key) => koreanTyping(text, text + key), start);
}

describe('jamoForKey', () => {
  test('letters map to the two-set layout', () => {
    expect(jamoForKey('r')).toBe('ㄱ');
    expect(jamoForKey('k')).toBe('ㅏ');
    expect(jamoForKey('m')).toBe('ㅡ');
  });

  test('Shift gives tense consonants and ㅒ ㅖ', () => {
    expect(jamoForKey('R')).toBe('ㄲ');
    expect(jamoForKey('P')).toBe('ㅖ');
  });

  test('other capitals type like small letters', () => {
    expect(jamoForKey('K')).toBe('ㅏ');
  });

  test('digits, space and punctuation are not letters', () => {
    expect(jamoForKey('1')).toBeNull();
    expect(jamoForKey(' ')).toBeNull();
    expect(jamoForKey('?')).toBeNull();
  });
});

describe('typing words', () => {
  test('simple syllables', () => {
    expect(typeKeys('tkrhk')).toBe('사과');
    expect(typeKeys('gksrnr')).toBe('한국');
  });

  test('a final consonant moves to the next syllable before a vowel', () => {
    expect(typeKeys('dkssudgktpdy')).toBe('안녕하세요');
    expect(typeKeys('rksk')).toBe('가나');
  });

  test('double finals, and only their second part moves', () => {
    expect(typeKeys('dlfrek')).toBe('읽다');
    expect(typeKeys('dlfrdj')).toBe('읽어');
    expect(typeKeys('djqtek')).toBe('없다');
  });

  test('compound vowels', () => {
    expect(typeKeys('dhk')).toBe('와');
    expect(typeKeys('dml')).toBe('의');
    expect(typeKeys('rnjs')).toBe('권');
  });

  test('tense consonants with Shift', () => {
    expect(typeKeys('Tk')).toBe('싸');
    expect(typeKeys('dlTek')).toBe('있다');
    // 딸 + ㄱ is 딹 for a moment; the vowel then moves the ㄱ on.
    expect(typeKeys('Ekfr')).toBe('딹');
    expect(typeKeys('Ekfrl')).toBe('딸기');
  });

  test('ㄸ ㅃ ㅉ cannot be finals and start a new syllable', () => {
    expect(typeKeys('rkEk')).toBe('가따');
  });

  test('space and punctuation pass through and end the syllable', () => {
    expect(typeKeys('tkrhk wntm')).toBe('사과 주스');
    expect(typeKeys('rk?')).toBe('가?');
  });

  test('a lone vowel or consonant stays a letter', () => {
    expect(typeKeys('k')).toBe('ㅏ');
    expect(typeKeys('rt')).toBe('ㄱㅅ');
  });

  test('the result is NFC, like stored terms', () => {
    const typed = typeKeys('dkssudgktpdy');
    expect(typed).toBe(typed.normalize('NFC'));
  });
});

describe('deleteJamo', () => {
  test('removes one jamo at a time', () => {
    expect(deleteJamo('간')).toBe('가');
    expect(deleteJamo('가')).toBe('ㄱ');
    expect(deleteJamo('ㄱ')).toBe('');
  });

  test('splits double finals and compound vowels', () => {
    expect(deleteJamo('읽')).toBe('일');
    expect(deleteJamo('와')).toBe('오');
    expect(deleteJamo('ㅘ')).toBe('ㅗ');
  });

  test('other characters are removed whole', () => {
    expect(deleteJamo('사과 ')).toBe('사과');
    expect(deleteJamo('')).toBe('');
  });
});

describe('koreanTyping', () => {
  test('Backspace at the end removes one jamo', () => {
    expect(koreanTyping('한국', '한')).toBe('한구');
  });

  test('changes other than one key at the end are kept as they are', () => {
    expect(koreanTyping('', '사과')).toBe('사과'); // pasted or a real Korean keyboard
    expect(koreanTyping('사과', '사 과')).toBe('사 과'); // typed in the middle
  });
});

describe('appendJamo', () => {
  test('non-jamo characters are appended', () => {
    expect(appendJamo('가', '1')).toBe('가1');
  });
});

describe('KEYBOARD_ROWS', () => {
  test('three rows in keyboard order with Shift variants', () => {
    expect(KEYBOARD_ROWS.map((row) => row.length)).toEqual([10, 9, 7]);
    expect(KEYBOARD_ROWS[0][0]).toEqual(['q', 'ㅂ', 'ㅃ']);
    expect(KEYBOARD_ROWS[1][0]).toEqual(['a', 'ㅁ', 'ㅁ']);
  });
});
