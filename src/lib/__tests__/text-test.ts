import { answersMatch, cleanOptionalText, cleanText } from '@/lib/text';

// 사과 (apple) written as separate jamo letters (NFD) instead of syllables (NFC).
const APPLE_NFC = '사과';
const APPLE_NFD = '사과'.normalize('NFD');

describe('cleanText', () => {
  test('the NFD test string really differs from NFC', () => {
    expect(APPLE_NFD).not.toBe(APPLE_NFC);
    expect(APPLE_NFD.length).toBeGreaterThan(APPLE_NFC.length);
  });

  test('converts Hangul to NFC', () => {
    expect(cleanText(APPLE_NFD)).toBe(APPLE_NFC);
  });

  test('trims surrounding whitespace, including newlines', () => {
    expect(cleanText('  사과 \n')).toBe('사과');
  });

  test('keeps inner spaces', () => {
    expect(cleanText('사과 주스')).toBe('사과 주스');
  });
});

describe('cleanOptionalText', () => {
  test('empty or blank becomes null', () => {
    expect(cleanOptionalText('')).toBeNull();
    expect(cleanOptionalText('   ')).toBeNull();
  });

  test('other text is cleaned', () => {
    expect(cleanOptionalText(` ${APPLE_NFD} `)).toBe(APPLE_NFC);
  });
});

describe('answersMatch', () => {
  test('identical answers match', () => {
    expect(answersMatch('사과', '사과')).toBe(true);
  });

  test('NFD and NFC Hangul match', () => {
    expect(answersMatch(APPLE_NFD, APPLE_NFC)).toBe(true);
  });

  test('surrounding whitespace is ignored', () => {
    expect(answersMatch(' 사과 ', '사과')).toBe(true);
  });

  test('runs of inner whitespace count as one space', () => {
    expect(answersMatch('사과   주스', '사과 주스')).toBe(true);
  });

  test('inner spaces still matter', () => {
    expect(answersMatch('사과주스', '사과 주스')).toBe(false);
  });

  test('Latin letters ignore case', () => {
    expect(answersMatch('Apple', 'apple')).toBe(true);
  });

  test('different words do not match', () => {
    expect(answersMatch('사과', '사과요')).toBe(false);
    expect(answersMatch('물', '불')).toBe(false);
  });

  test('an empty answer does not match', () => {
    expect(answersMatch('', '사과')).toBe(false);
  });
});
