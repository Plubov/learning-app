import { parseRemNoteMarkdown, planImport } from '@/lib/remnote-import';

const SAMPLE = [
  '- ## Grammatik',
  '    - Wann wird 은/는 verwendet?→Themenpartikel. Bsp.: 저는 학생이에요',
  '    - Koreanische Höflichkeitsform↔존댓말',
  '- ',
  '- ## Zeit',
  '    - Minute↔분',
  '    - jetzt / nun↔지금 / 이제',
  '- ## Personen',
  '    - Person (höfliche Zählform)↔분',
  '    - wo↔어디',
  '    - wo↔어디',
  '-',
].join('\n');

describe('parseRemNoteMarkdown', () => {
  const parsed = parseRemNoteMarkdown(SAMPLE);

  test('two-way cards become items with Korean as the term', () => {
    expect(parsed.items).toContainEqual({ term: '존댓말', meaning: 'Koreanische Höflichkeitsform' });
    expect(parsed.items).toContainEqual({ term: '지금 / 이제', meaning: 'jetzt / nun' });
  });

  test('one-way cards are skipped and reported with their line number', () => {
    expect(parsed.skipped).toEqual([
      expect.objectContaining({ line: 2, reason: 'one-way' }),
    ]);
  });

  test('a one-way card with ↔ in its answer is still one-way', () => {
    const result = parseRemNoteMarkdown('- Verbendungen→ㅏ/ㅗ ↔ 아요 · sonst ↔ 어요');
    expect(result.items).toEqual([]);
    expect(result.skipped).toEqual([expect.objectContaining({ reason: 'one-way' })]);
  });

  test('a line without any arrow is reported as not a card', () => {
    expect(parseRemNoteMarkdown('- just a note').skipped).toEqual([
      { line: 1, text: 'just a note', reason: 'not-a-card' },
    ]);
  });

  test('headings and empty bullets are ignored', () => {
    expect(parsed.items.map((i) => i.term)).toEqual(['존댓말', '분', '지금 / 이제', '어디']);
  });

  test('the same term with different meanings becomes one item', () => {
    expect(parsed.items).toContainEqual({ term: '분', meaning: 'Minute; Person (höfliche Zählform)' });
    expect(parsed.merged).toEqual(['분']);
  });

  test('an exact duplicate is kept once and not reported as merged', () => {
    expect(parsed.items.filter((i) => i.term === '어디')).toEqual([{ term: '어디', meaning: 'wo' }]);
  });

  test('Korean on the front side is detected', () => {
    expect(parseRemNoteMarkdown('- 물↔Wasser').items).toEqual([{ term: '물', meaning: 'Wasser' }]);
  });

  test('numbers on the front stay the meaning', () => {
    expect(parseRemNoteMarkdown('- 5↔다섯').items).toEqual([{ term: '다섯', meaning: '5' }]);
  });

  test('a card without Hangul is skipped', () => {
    expect(parseRemNoteMarkdown('- cat↔Katze').skipped).toEqual([
      { line: 1, text: 'cat↔Katze', reason: 'no-korean' },
    ]);
  });

  test('Markdown bold is removed', () => {
    expect(parseRemNoteMarkdown('- **Hallo**↔안녕하세요').items).toEqual([
      { term: '안녕하세요', meaning: 'Hallo' },
    ]);
  });

  test('Hangul is converted to NFC and Windows line endings work', () => {
    const nfd = '물'.normalize('NFD');
    expect(parseRemNoteMarkdown(`- Wasser↔${nfd}\r\n- Tee↔차\r\n`).items).toEqual([
      { term: '물', meaning: 'Wasser' },
      { term: '차', meaning: 'Tee' },
    ]);
  });
});

describe('planImport', () => {
  const items = [
    { term: '물', meaning: 'Wasser' },
    { term: '차', meaning: 'Tee' },
  ];

  test('items whose term exists are not added again', () => {
    expect(planImport(items, ['물'])).toEqual({
      toAdd: [{ term: '차', meaning: 'Tee' }],
      alreadyPresent: [{ term: '물', meaning: 'Wasser' }],
    });
  });

  test('everything is new in an empty deck', () => {
    expect(planImport(items, []).toAdd).toHaveLength(2);
  });
});
