import { buildFlow, explanationSteps, speechForPage, type FlowItem } from '../lesson-flow';

const items: FlowItem[] = [
  { id: '1', term: '물', meaning: 'water', notes: null },
  { id: '2', term: '차', meaning: 'tea', notes: '차 주세요. Tea, please.' },
  { id: '3', term: '밥', meaning: 'rice', notes: null },
];

const explanation = {
  lang: 'en',
  steps: [
    { parts: [{ text: 'Thirsty in Seoul?', target: false }] },
    {
      parts: [
        { text: 'Ask for ', target: false },
        { text: '물', target: true },
        { text: ' and you get water.', target: false },
      ],
    },
  ],
  key_points: ['물 is water.'],
};

/** Always 0: the shuffle then keeps a fixed, known order. */
const fixed = () => 0;

describe('explanationSteps', () => {
  it('returns stored steps with their language', () => {
    const result = explanationSteps(explanation);
    expect(result.lang).toBe('en');
    expect(result.steps).toHaveLength(2);
  });

  it('cuts an old one-text introduction into short steps of whole sentences', () => {
    const sentence = 'This sentence is about forty characters. ';
    const result = explanationSteps({
      intro: `${sentence.repeat(8).trim()}\n\nA second paragraph.`,
      key_points: [],
    });
    expect(result.lang).toBeNull();
    expect(result.steps.length).toBeGreaterThan(2);
    for (const step of result.steps) {
      expect(step.parts).toHaveLength(1);
      expect(step.parts[0].text.length).toBeLessThanOrEqual(220);
      expect(step.parts[0].text).toMatch(/\.$/);
    }
    expect(result.steps[result.steps.length - 1].parts[0].text).toBe('A second paragraph.');
  });
});

describe('buildFlow', () => {
  const pages = buildFlow(explanation, items, fixed);

  it('shows steps, then items in groups with a check for each, then the recap', () => {
    expect(pages.map((page) => page.kind)).toEqual([
      'step', 'step',
      'item', 'item', 'check', 'check',
      'item', 'check',
      'recap',
    ]);
  });

  it('checks every item once, after it was shown', () => {
    const seen = new Set<string>();
    const checked: string[] = [];
    for (const page of pages) {
      if (page.kind === 'item') seen.add(page.item.id);
      if (page.kind === 'check') {
        expect(seen.has(page.item.id)).toBe(true);
        checked.push(page.item.id);
      }
    }
    expect(checked.sort()).toEqual(['1', '2', '3']);
  });

  it('offers the right meaning among different wrong ones', () => {
    for (const page of pages) {
      if (page.kind !== 'check') continue;
      expect(page.options).toContain(page.item.meaning);
      expect(new Set(page.options).size).toBe(page.options.length);
      expect(page.options).toHaveLength(3);
    }
  });

  it('leaves out checks when there is nothing to choose between', () => {
    const single = buildFlow(explanation, [items[0]], fixed);
    expect(single.map((page) => page.kind)).toEqual(['step', 'step', 'item', 'recap']);
    const sameMeaning = buildFlow(explanation, [items[0], { ...items[1], meaning: 'water' }], fixed);
    expect(sameMeaning.some((page) => page.kind === 'check')).toBe(false);
  });

  it('has no recap without key points', () => {
    const flow = buildFlow({ ...explanation, key_points: [] }, items, fixed);
    expect(flow[flow.length - 1].kind).toBe('check');
  });
});

describe('speechForPage', () => {
  const pages = buildFlow(explanation, items, fixed);

  it('reads a step of a Korean course, each language in its own voice', () => {
    expect(speechForPage(pages[0], 'en', 'ko')).toEqual([{ text: 'Thirsty in Seoul?', lang: 'en' }]);
    expect(speechForPage(pages[1], 'en', 'ko')).toEqual([
      { text: 'Ask for', lang: 'en' },
      { text: '물', lang: 'ko' },
      { text: 'and you get water.', lang: 'en' },
    ]);
  });

  it('gives English the English voice even when it was marked as Korean', () => {
    const page = {
      kind: 'step' as const,
      step: { parts: [{ text: 'water (물)', target: true }] },
    };
    expect(speechForPage(page, 'en', 'ko')).toEqual([
      { text: 'water', lang: 'en' },
      { text: '물', lang: 'ko' },
    ]);
  });

  it('reads a new word without its translation', () => {
    expect(speechForPage(pages[2], 'en', 'ko')).toEqual([{ text: '물', lang: 'ko' }]);
  });

  it('reads the recap', () => {
    expect(speechForPage(pages[pages.length - 1], 'en', 'ko')).toEqual([
      { text: '물', lang: 'ko' },
      { text: 'is water.', lang: 'en' },
    ]);
  });

  it('reads explanations in the learner\'s language in other courses', () => {
    const page = {
      kind: 'step' as const,
      step: { parts: [{ text: 'One. ', target: false }, { text: 'Two.', target: false }] },
    };
    expect(speechForPage(page, 'en', null)).toEqual([{ text: 'One. Two.', lang: 'en' }]);
    expect(speechForPage(page, null, null)).toEqual([]);
  });

  it('reads term and meaning in one language for other subjects', () => {
    const page = { kind: 'item' as const, item: { id: 'x', term: 'Inertia', meaning: 'Resistance to change.', notes: null } };
    expect(speechForPage(page, 'en', null)).toEqual([
      { text: 'Inertia: Resistance to change.', lang: 'en' },
    ]);
  });
});
