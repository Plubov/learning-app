import {
  findPrerequisites,
  interleaveSections,
  orderForLearning,
  PREREQUISITE_GAP,
  termForms,
} from '@/lib/learning-order';

describe('termForms', () => {
  test('splits alternatives and words', () => {
    expect(termForms('정말 / 진짜')).toEqual([['정말'], ['진짜']]);
    expect(termForms('저는 독일 사람이에요')).toEqual([['저는', '독일', '사람이에요']]);
  });

  test('drops brackets, placeholders and punctuation', () => {
    expect(termForms('(만나서) 반가워요')).toEqual([['반가워요']]);
    expect(termForms('저는 [Name]입니다')).toEqual([['저는', '입니다']]);
    expect(termForms('정말 맛있어요!')).toEqual([['정말', '맛있어요']]);
  });
});

describe('findPrerequisites', () => {
  const parts = (terms: string[], phrase: string) => findPrerequisites(terms).get(phrase) ?? [];

  test('a phrase is built from the words it contains', () => {
    const terms = ['독일', '사람', '독일 사람', '저는 독일 사람이에요'];
    expect(parts(terms, '독일 사람')).toEqual(['독일', '사람']);
    expect(parts(terms, '저는 독일 사람이에요')).toEqual(['독일', '사람', '독일 사람']);
  });

  test('a verb in dictionary form is found in its conjugated form', () => {
    expect(parts(['맛있다', '정말 / 진짜', '정말 맛있어요!'], '정말 맛있어요!')).toEqual([
      '맛있다',
      '정말 / 진짜',
    ]);
  });

  test('하다 verbs are found in conjugated forms', () => {
    expect(parts(['친절하다', '우리', '우리 이웃은 친절해요'], '우리 이웃은 친절해요')).toEqual([
      '친절하다',
      '우리',
    ]);
    expect(parts(['친절하다', '정말 친절한 사람'], '정말 친절한 사람')).toEqual(['친절하다']);
  });

  test('one-syllable words only count as whole words', () => {
    const terms = ['이', '저', '사람', '이 사람', '저는 학생'];
    expect(parts(terms, '이 사람')).toEqual(['이', '사람']);
    expect(parts(terms, '저는 학생')).toEqual([]);
  });

  test('one-syllable verb stems are not matched', () => {
    expect(parts(['있다', '어디에 있어요?'], '어디에 있어요?')).toEqual([]);
  });

  test('single words have no building blocks', () => {
    expect(findPrerequisites(['한국', '한국어']).size).toBe(0);
  });
});

describe('interleaveSections', () => {
  const item = (term: string, section: string) => ({ term, section });

  test('takes sections in turn', () => {
    const items = [item('a1', 'A'), item('a2', 'A'), item('b1', 'B'), item('b2', 'B')];
    expect(interleaveSections(items).map((i) => i.term)).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  test('spreads a small section over the whole list', () => {
    const big = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((t) => item(t, 'B'));
    const small = [item('s1', 'S'), item('s2', 'S')];
    const order = interleaveSections([...big, ...small]).map((i) => i.term);
    expect(order.indexOf('s1')).toBeLessThan(3);
    expect(order.indexOf('s2')).toBeGreaterThan(4);
  });

  test('keeps the file order inside a section', () => {
    const items = [item('x', 'A'), item('y', 'B'), item('z', 'A')];
    const order = interleaveSections(items).map((i) => i.term);
    expect(order.indexOf('x')).toBeLessThan(order.indexOf('z'));
  });
});

describe('orderForLearning', () => {
  test('a phrase comes at least the gap after its parts', () => {
    const items = [
      { term: '저는 독일 사람이에요', section: 'Länder' },
      { term: '독일', section: 'Länder' },
      { term: '사람', section: 'Personen' },
    ];
    const order = orderForLearning(items).map((i) => i.term);
    expect(order[2]).toBe('저는 독일 사람이에요');
  });

  test('the gap is kept even when the phrase was early', () => {
    const filler = Array.from({ length: 20 }, (_, n) => ({ term: `w${n}`, section: 'Other' }));
    const items = [
      { term: '물 좀 주세요', section: 'Ausdrücke' },
      { term: '물', section: 'Essen' },
      ...filler,
    ];
    const order = orderForLearning(items).map((i) => i.term);
    expect(order.indexOf('물 좀 주세요') - order.indexOf('물')).toBeGreaterThanOrEqual(
      PREREQUISITE_GAP,
    );
  });

  test('keeps every item exactly once', () => {
    const items = ['가', '나', '가 나', '다'].map((term) => ({ term, section: '' }));
    expect(orderForLearning(items).map((i) => i.term).sort()).toEqual(['가', '가 나', '나', '다']);
  });
});
