import { judgeAnswer, similarity, speechKey } from '../talk';

describe('speechKey', () => {
  it('ignores spaces, punctuation and case, and splits Hangul into letters', () => {
    expect(speechKey('물 주세요!')).toBe(speechKey('물주세요'));
    expect(speechKey('Hello, World')).toBe('helloworld');
    expect(speechKey('물')).toHaveLength(3); // ㅁ ㅜ ㄹ
  });
});

describe('similarity', () => {
  it('is 1 for the same answer written differently', () => {
    expect(similarity('물 주세요.', '물주세요')).toBe(1);
  });

  it('stays high for one misheard vowel', () => {
    expect(similarity('물 주세요', '물 쥬세요')).toBeGreaterThan(0.85);
  });

  it('is low for a different answer, and 0 for nothing', () => {
    expect(similarity('물 주세요', '감사합니다')).toBeLessThan(0.4);
    expect(similarity('', '물')).toBe(0);
  });
});

describe('judgeAnswer', () => {
  const answers = ['아이스 아메리카노 주세요', '아메리카노 한 잔 주세요'];

  it('accepts any fitting answer, from any alternative heard', () => {
    const result = judgeAnswer(['아이스크림', '아메리카노 한잔 주세요'], answers);
    expect(result.correct).toBe(true);
    expect(result.closest).toBe('아메리카노 한 잔 주세요');
    expect(result.heard).toBe('아메리카노 한잔 주세요');
  });

  it('rejects an answer that does not fit, and names the closest', () => {
    const result = judgeAnswer(['안녕하세요'], answers);
    expect(result.correct).toBe(false);
    expect(answers).toContain(result.closest);
  });

  it('rejects silence and offers the first answer', () => {
    expect(judgeAnswer([], answers)).toMatchObject({ correct: false, closest: answers[0], heard: '' });
  });
});
