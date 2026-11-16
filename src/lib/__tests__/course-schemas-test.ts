import {
  validateCoursePlan,
  validateLessonContent,
  validatePractice,
  validateTutorReply,
} from '../../../supabase/functions/_shared/course-schemas';

function plan(overrides: Record<string, unknown> = {}) {
  return {
    title: ' Korean basics ',
    summary: 'From Hangul to simple sentences.',
    subject: 'language',
    target_lang: 'KO',
    stages: [
      { title: 'Foundations', outcome: 'Read and greet.' },
      { title: 'Sentences', outcome: 'Build simple sentences.' },
    ],
    lessons: [
      { title: 'Greetings', summary: 'Hello and goodbye.', objectives: ['Greet politely'], week: 1, stage: 0 },
      { title: 'Topic particle', summary: '은/는.', objectives: ['Mark the topic'], week: 2, stage: 1 },
    ],
    ...overrides,
  };
}

describe('validateCoursePlan', () => {
  it('accepts a good plan and cleans its text', () => {
    const result = validateCoursePlan(plan());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Korean basics');
    expect(result.value.target_lang).toBe('ko');
    expect(result.value.lessons).toHaveLength(2);
  });

  it('normalises text to NFC', () => {
    const result = validateCoursePlan(plan({ title: '한국어'.normalize('NFD') }));
    expect(result.ok && result.value.title).toBe('한국어');
  });

  it('drops target_lang for subjects that are not a language', () => {
    const result = validateCoursePlan(plan({ subject: 'science', target_lang: 'ko' }));
    expect(result.ok && result.value.target_lang).toBe('');
  });

  it.each([
    ['a language course without a language code', { target_lang: '' }],
    ['an unknown subject', { subject: 'cooking' }],
    ['no lessons', { lessons: [] }],
    ['an empty title', { title: '  ' }],
    ['a lesson pointing at a missing stage', {
      lessons: [{ title: 'A', summary: 'B', objectives: ['C'], week: 1, stage: 2 }],
    }],
    ['weeks going backwards', {
      lessons: [
        { title: 'A', summary: 'B', objectives: ['C'], week: 2, stage: 0 },
        { title: 'D', summary: 'E', objectives: ['F'], week: 1, stage: 0 },
      ],
    }],
    ['a lesson without objectives', {
      lessons: [{ title: 'A', summary: 'B', objectives: [], week: 1, stage: 0 }],
    }],
    ['a fractional week', {
      lessons: [{ title: 'A', summary: 'B', objectives: ['C'], week: 1.5, stage: 0 }],
    }],
  ])('rejects %s', (_name, overrides) => {
    expect(validateCoursePlan(plan(overrides)).ok).toBe(false);
  });

  it('rejects weeks before the first allowed week of a re-plan', () => {
    expect(validateCoursePlan(plan(), 2).ok).toBe(false);
    expect(validateCoursePlan(plan(), 1).ok).toBe(true);
  });

  it('rejects values that are not objects', () => {
    expect(validateCoursePlan(null).ok).toBe(false);
    expect(validateCoursePlan('plan').ok).toBe(false);
    expect(validateCoursePlan([]).ok).toBe(false);
  });
});

describe('validateLessonContent', () => {
  const content = {
    intro: 'Greetings depend on politeness.',
    key_points: ['안녕하세요 is polite.'],
    items: [
      { kind: 'vocab', term: '안녕하세요', meaning: 'hello', notes: '' },
      { kind: 'grammar', term: '-요', meaning: 'polite ending', notes: 'Added to verbs.' },
    ],
  };

  it('accepts a good lesson', () => {
    const result = validateLessonContent(content, 'language');
    expect(result.ok && result.value.items).toHaveLength(2);
  });

  it('rejects item kinds that do not fit the subject', () => {
    expect(validateLessonContent(content, 'science').ok).toBe(false);
  });

  it('rejects a term the deck already has, whatever its encoding or case', () => {
    expect(validateLessonContent(content, 'language', ['안녕하세요'.normalize('NFD')]).ok).toBe(false);
    const english = { ...content, items: [{ kind: 'fact', term: 'Inertia', meaning: 'x', notes: '' }] };
    expect(validateLessonContent(english, 'science', ['inertia']).ok).toBe(false);
  });

  it('rejects the same term twice in one lesson', () => {
    const twice = { ...content, items: [content.items[0], content.items[0]] };
    expect(validateLessonContent(twice, 'language').ok).toBe(false);
  });

  it('rejects a lesson without items', () => {
    expect(validateLessonContent({ ...content, items: [] }, 'language').ok).toBe(false);
  });
});

describe('validatePractice', () => {
  const choice = {
    item: 0,
    kind: 'choice',
    prompt: 'What does 물 mean?',
    options: ['water', 'fire', 'tea'],
    answer: 'water',
    explanation: '물 is water.',
  };
  const typed = { item: 1, kind: 'typed', prompt: 'Type "tea".', options: [], answer: '차', explanation: '' };

  it('accepts choice and typed questions', () => {
    const result = validatePractice({ examples: [], questions: [choice, typed] }, 2);
    expect(result.ok && result.value.questions.map((q) => q.kind)).toEqual(['choice', 'typed']);
  });

  it('ignores options on a typed question', () => {
    const result = validatePractice({ examples: [], questions: [{ ...typed, options: ['x'] }] }, 2);
    expect(result.ok && result.value.questions[0].options).toEqual([]);
  });

  it.each([
    ['an answer that is not an option', { ...choice, answer: 'wine' }],
    ['repeated options', { ...choice, options: ['water', 'water', 'tea'] }],
    ['too few options', { ...choice, options: ['water', 'fire'] }],
    ['an item that does not exist', { ...choice, item: 2 }],
    ['a negative item', { ...choice, item: -1 }],
    ['an unknown kind', { ...choice, kind: 'essay' }],
    ['an empty prompt', { ...choice, prompt: '' }],
  ])('rejects %s', (_name, question) => {
    expect(validatePractice({ examples: [], questions: [question] }, 2).ok).toBe(false);
  });

  it('rejects practice without questions', () => {
    expect(validatePractice({ examples: [], questions: [] }, 2).ok).toBe(false);
  });
});

describe('validateTutorReply', () => {
  it('accepts a reply with and without a plan change', () => {
    expect(validateTutorReply({ reply: 'Yes.', plan_change: '' }).ok).toBe(true);
    const result = validateTutorReply({ reply: 'Sure.', plan_change: ' Slow down to 2 lessons a week. ' });
    expect(result.ok && result.value.plan_change).toBe('Slow down to 2 lessons a week.');
  });

  it('rejects an empty reply', () => {
    expect(validateTutorReply({ reply: '', plan_change: '' }).ok).toBe(false);
  });
});
