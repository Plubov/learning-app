import { acceptedAnswers, answersMatch, cleanOptionalText, cleanText } from '@/lib/text';

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

describe('answersMatch with alternatives', () => {
  test('either side of a slash is accepted, and both together', () => {
    expect(answersMatch('정말', '정말 / 진짜')).toBe(true);
    expect(answersMatch('진짜', '정말 / 진짜')).toBe(true);
    expect(answersMatch('정말 / 진짜', '정말 / 진짜')).toBe(true);
    expect(answersMatch('정말/진짜', '정말 / 진짜')).toBe(true);
  });

  test('a part of one alternative is not enough', () => {
    expect(answersMatch('정', '정말 / 진짜')).toBe(false);
    expect(answersMatch('정말 진짜', '정말 / 진짜')).toBe(false);
  });

  test('a bracketed addition may be left out', () => {
    expect(answersMatch('덥다', '덥다 (더워요)')).toBe(true);
    expect(answersMatch('덥다 (더워요)', '덥다 (더워요)')).toBe(true);
    expect(answersMatch('더워요', '덥다 (더워요)')).toBe(false);
  });

  test('an optional bracketed word in front may be left out or typed', () => {
    expect(answersMatch('반가워요', '(만나서) 반가워요')).toBe(true);
    expect(answersMatch('만나서 반가워요', '(만나서) 반가워요')).toBe(true);
  });

  test('a placeholder accepts any name', () => {
    expect(answersMatch('저는 카를로스입니다', '저는 [Name]입니다')).toBe(true);
    expect(answersMatch('저는 [Name]입니다', '저는 [Name]입니다')).toBe(true);
    expect(answersMatch('저는 입니다', '저는 [Name]입니다')).toBe(false);
  });

  test('NFD input still matches an alternative', () => {
    expect(answersMatch('진짜'.normalize('NFD'), '정말 / 진짜')).toBe(true);
  });
});

describe('acceptedAnswers', () => {
  test('a plain term accepts only itself', () => {
    expect(acceptedAnswers('사과')).toEqual(['사과']);
  });

  test('lists the whole term and each alternative', () => {
    expect(acceptedAnswers('아래 / 밑')).toEqual(['아래 / 밑', '아래', '밑']);
  });
});
