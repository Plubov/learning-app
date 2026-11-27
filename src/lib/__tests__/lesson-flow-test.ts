import type { Exercise } from '../exercises';
import {
  buildFlow,
  drillsFromExamples,
  explanationSteps,
  speechForPage,
  type FlowItem,
  type FlowPage,
} from '../lesson-flow';

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

/** The item an exercise is about (matching pairs are about several). */
function itemOf(exercise: Exercise): string | null {
  return exercise.kind === 'match' ? null : exercise.itemId;
}

const exercises = (pages: FlowPage[]) =>
  pages.flatMap((page) => (page.kind === 'exercise' ? [page.exercise] : []));

describe('buildFlow', () => {
  const pages = buildFlow(explanation, items, 'ko', fixed);

  it('shows steps, then items in groups with an exercise for each, then the recap', () => {
    expect(pages.map((page) => page.kind)).toEqual([
      'step', 'step',
      'item', 'item', 'exercise', 'exercise',
      'item', 'exercise',
      'recap',
    ]);
  });

  it('checks every item once, after it was shown', () => {
    const seen = new Set<string>();
    const checked: string[] = [];
    for (const page of pages) {
      if (page.kind === 'item') seen.add(page.item.id);
      if (page.kind === 'exercise') {
        const id = itemOf(page.exercise);
        expect(id !== null && seen.has(id)).toBe(true);
        if (id) checked.push(id);
      }
    }
    expect(checked.sort()).toEqual(['1', '2', '3']);
  });

  it('takes the kinds of check in turn: meaning, by ear, term', () => {
    const checks = exercises(pages);
    expect(checks.map((e) => e.kind)).toEqual(['choice', 'listen', 'choice']);
    const [meaning, , term] = checks;
    if (meaning.kind !== 'choice' || term.kind !== 'choice') throw new Error('expected choices');
    expect(meaning.options).toContain(items.find((i) => i.term === meaning.prompt)?.meaning);
    expect(term.options).toContain(items.find((i) => i.meaning === term.prompt)?.term);
  });

  it('offers the right answer among different wrong ones', () => {
    for (const exercise of exercises(pages)) {
      if (exercise.kind !== 'choice' && exercise.kind !== 'listen') continue;
      expect(exercise.options).toContain(exercise.answer);
      expect(new Set(exercise.options).size).toBe(exercise.options.length);
      expect(exercise.options).toHaveLength(3);
    }
  });

  it('never asks by ear outside language courses', () => {
    const other = buildFlow(explanation, items, null, fixed);
    expect(exercises(other).some((e) => e.kind === 'listen')).toBe(false);
  });

  it('leaves out checks when there is nothing to choose between', () => {
    const single = buildFlow(explanation, [items[0]], 'ko', fixed);
    expect(single.map((page) => page.kind)).toEqual(['step', 'step', 'item', 'recap']);
    const sameMeaning = buildFlow(explanation, [items[0], { ...items[1], meaning: 'water' }], 'ko', fixed);
    expect(sameMeaning.some((page) => page.kind === 'exercise')).toBe(false);
  });

  it('has no recap without key points', () => {
    const flow = buildFlow({ ...explanation, key_points: [] }, items, 'ko', fixed);
    expect(flow[flow.length - 1].kind).toBe('exercise');
  });

  it('puts the lesson\'s drills after the checks, and skips one about an unknown term', () => {
    const drill = { kind: 'cloze' as const, prompt: '___ 주세요.', options: ['물', '밥'], answer: '물', translation: 'Water, please.', explanation: '' };
    const flow = buildFlow(
      { ...explanation, drills: [{ ...drill, term: '물' }, { ...drill, term: '없음' }] },
      items,
      'ko',
      fixed,
    );
    const last = exercises(flow).pop();
    expect(exercises(flow)).toHaveLength(4);
    expect(last?.kind).toBe('cloze');
    expect(last && itemOf(last)).toBe('1');
    expect(flow[flow.length - 1].kind).toBe('recap');
  });
});

describe('drillsFromExamples', () => {
  const steps = [
    { parts: [{ text: 'x', target: false }], example: { text: '물 주세요.', note: 'Water, please.' } },
    { parts: [{ text: 'x', target: false }], example: { text: '안녕하세요', note: 'Hello' } },
    { parts: [{ text: 'x', target: false }], example: { text: '밥 먹어요.', note: '' } },
  ];

  it('builds a sentence from each translated example that contains an item', () => {
    const drills = drillsFromExamples(steps, items, fixed);
    expect(drills).toHaveLength(1);
    const [drill] = drills;
    expect(drill.kind === 'build' && drill.prompt).toBe('Water, please.');
    expect(drill.kind === 'build' && drill.answer).toBe('물 주세요.');
    expect(itemOf(drill)).toBe('1');
  });

  it('finds a grammar pattern without its leading mark', () => {
    const drills = drillsFromExamples(
      [{ parts: [{ text: 'x', target: false }], example: { text: '물이 좋아요', note: 'I like water' } }],
      [{ id: 'g', term: '-요', meaning: 'polite ending', notes: null }],
      fixed,
    );
    expect(drills.map(itemOf)).toEqual(['g']);
  });
});

describe('speechForPage', () => {
  const pages = buildFlow(explanation, items, 'ko', fixed);

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

  it('reads a card: headline, sentence and example, not the translation', () => {
    const page = {
      kind: 'step' as const,
      step: {
        title: 'Asking for things',
        parts: [
          { text: 'Put ', target: false },
          { text: '주세요', target: true },
          { text: ' after the thing you want.', target: false },
        ],
        example: { text: '물 주세요.', note: 'Water, please.' },
      },
    };
    expect(speechForPage(page, 'en', 'ko')).toEqual([
      { text: 'Asking for things. Put', lang: 'en' },
      { text: '주세요', lang: 'ko' },
      { text: 'after the thing you want.', lang: 'en' },
      { text: '물 주세요.', lang: 'ko' },
    ]);
  });

  it('reads a card of another subject with its example and note', () => {
    const page = {
      kind: 'step' as const,
      step: {
        title: 'Force changes motion',
        parts: [{ text: 'A body speeds up only while a force acts on it.', target: false }],
        example: { text: 'A ball rolls on after the kick', note: 'No force is needed to keep moving.' },
      },
    };
    expect(speechForPage(page, 'en', null)).toEqual([
      {
        text: 'Force changes motion. A body speeds up only while a force acts on it. A ball rolls on after the kick. No force is needed to keep moving.',
        lang: 'en',
      },
    ]);
  });

  it('reads term and meaning in one language for other subjects', () => {
    const page = { kind: 'item' as const, item: { id: 'x', term: 'Inertia', meaning: 'Resistance to change.', notes: null } };
    expect(speechForPage(page, 'en', null)).toEqual([
      { text: 'Inertia: Resistance to change.', lang: 'en' },
    ]);
  });
});
