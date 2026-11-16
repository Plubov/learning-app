import {
  validateCoursePlan,
  validateHomeworkCheck,
  validateMaterialReading,
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
    scheduled: true,
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

  it('ignores the weeks of a plan without a schedule', () => {
    const lessons = [
      { title: 'A', summary: 'B', objectives: ['C'], week: 5, stage: 0 },
      { title: 'D', summary: 'E', objectives: ['F'], week: 0, stage: 0 },
    ];
    const result = validateCoursePlan(plan({ scheduled: false, lessons }), 3);
    expect(result.ok && result.value.scheduled).toBe(false);
    expect(result.ok && result.value.lessons.map((l) => l.week)).toEqual([3, 3]);
  });

  it('rejects a plan that does not say whether it is scheduled', () => {
    expect(validateCoursePlan(plan({ scheduled: undefined })).ok).toBe(false);
  });

  it('rejects values that are not objects', () => {
    expect(validateCoursePlan(null).ok).toBe(false);
    expect(validateCoursePlan('plan').ok).toBe(false);
    expect(validateCoursePlan([]).ok).toBe(false);
  });
});

describe('validateLessonContent', () => {
  const content = {
    lang: 'EN',
    steps: [
      {
        title: 'Two levels of politeness',
        parts: [{ text: 'Korean greetings change with who you talk to.', target: false }],
        example: { text: '', note: 'a note without an example' },
      },
      {
        title: ' The polite hello ',
        parts: [
          { text: 'You say ', target: false },
          { text: '안녕하세요'.normalize('NFD'), target: true },
          { text: '.', target: false },
        ],
        example: { text: '안녕하세요!'.normalize('NFD'), note: ' Hello! ' },
      },
    ],
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

  it('keeps the spaces inside step parts and cleans the rest', () => {
    const result = validateLessonContent(content, 'language');
    expect(result.ok && result.value.lang).toBe('en');
    expect(result.ok && result.value.steps[1].parts).toEqual([
      { text: 'You say ', target: false },
      { text: '안녕하세요', target: true },
      { text: '.', target: false },
    ]);
  });

  it('cleans a card\'s headline and example, and drops an empty example', () => {
    const result = validateLessonContent(content, 'language');
    expect(result.ok && result.value.steps[0].example).toBeNull();
    expect(result.ok && result.value.steps[1].title).toBe('The polite hello');
    expect(result.ok && result.value.steps[1].example).toEqual({ text: '안녕하세요!', note: 'Hello!' });
  });

  it('marks no text as the language being learned outside language courses', () => {
    const science = { ...content, items: [{ kind: 'fact', term: 'Inertia', meaning: 'x', notes: '' }] };
    const result = validateLessonContent(science, 'science');
    expect(result.ok && result.value.steps[1].parts.some((part) => part.target)).toBe(false);
  });

  it.each([
    ['a step that is too long', { steps: [content.steps[0], { ...content.steps[1], parts: [{ text: 'x'.repeat(201), target: false }] }] }],
    ['an empty step', { steps: [content.steps[0], { ...content.steps[1], parts: [{ text: '  ', target: false }] }] }],
    ['a single step', { steps: [content.steps[0]] }],
    ['too many steps', { steps: Array.from({ length: 7 }, () => content.steps[0]) }],
    ['a part without target', { steps: [content.steps[0], { ...content.steps[1], parts: [{ text: 'x' }] }] }],
    ['a step without a headline', { steps: [content.steps[0], { ...content.steps[1], title: ' ' }] }],
    ['a step without the example field', { steps: [content.steps[0], { title: 'x', parts: content.steps[1].parts }] }],
    ['an example that is too long', { steps: [content.steps[0], { ...content.steps[1], example: { text: 'x'.repeat(201), note: '' } }] }],
    ['a language name instead of a code', { lang: 'English' }],
  ])('rejects %s', (_name, overrides) => {
    expect(validateLessonContent({ ...content, ...overrides }, 'language').ok).toBe(false);
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
    const result = validatePractice({ questions: [choice, typed] }, 2);
    expect(result.ok && result.value.questions.map((q) => q.kind)).toEqual(['choice', 'typed']);
  });

  it('ignores options on a typed question', () => {
    const result = validatePractice({ questions: [{ ...typed, options: ['x'] }] }, 2);
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
    expect(validatePractice({ questions: [question] }, 2).ok).toBe(false);
  });

  describe('build questions', () => {
    const build = {
      item: 0,
      kind: 'build',
      prompt: 'Water, please.',
      options: ['차', '물', '밥'],
      answer: '물 주세요.',
      explanation: '',
    };

    it('accepts a sentence and drops wrong words that are in it', () => {
      const result = validatePractice({ questions: [build] }, 2);
      expect(result.ok && result.value.questions[0].options).toEqual(['차', '밥']);
    });

    it.each([
      ['a one-word answer', { ...build, answer: '물' }],
      ['a wrong "word" made of two words', { ...build, options: ['차 한 잔'] }],
    ])('rejects %s', (_name, question) => {
      expect(validatePractice({ questions: [question] }, 2).ok).toBe(false);
    });

    it('rejects them outside language courses', () => {
      expect(validatePractice({ questions: [build] }, 2, 'science').ok).toBe(false);
    });
  });

  it('rejects practice without questions', () => {
    expect(validatePractice({ questions: [] }, 2).ok).toBe(false);
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

describe('validateMaterialReading', () => {
  const reading = { readable: true, title: ' Sheet 4 ', role: 'exercises', text: 'Exercise 1: $x^2$' };

  it('accepts a read file and cleans its title', () => {
    const result = validateMaterialReading(reading);
    expect(result.ok && result.value.title).toBe('Sheet 4');
    expect(result.ok && result.value.readable).toBe(true);
  });

  it('treats a file with no text as unreadable', () => {
    const result = validateMaterialReading({ ...reading, text: '  ' });
    expect(result.ok && result.value.readable).toBe(false);
    const blank = validateMaterialReading({ readable: false, title: '', role: 'notes', text: '' });
    expect(blank.ok && blank.value.readable).toBe(false);
  });

  it('rejects an unknown role and a readable file without a title', () => {
    expect(validateMaterialReading({ ...reading, role: 'video' }).ok).toBe(false);
    expect(validateMaterialReading({ ...reading, title: '' }).ok).toBe(false);
  });
});

describe('validateHomeworkCheck', () => {
  const check = {
    task: 'Differentiate $x^2$.',
    transcription: "f'(x) = 2x",
    steps: [{ text: "f'(x) = 2x", ok: true, comment: '' }],
    verdict: 'correct',
    score: 100,
    summary: 'All right.',
    hint: '',
  };

  it('accepts a graded solution', () => {
    const result = validateHomeworkCheck(check, 'check');
    expect(result.ok && result.value.verdict).toBe('correct');
    expect(result.ok && result.value.score).toBe(100);
  });

  it('never grades a hint', () => {
    const result = validateHomeworkCheck({ ...check, verdict: 'wrong', score: 20 }, 'hint');
    expect(result.ok && result.value.verdict).toBe('open');
    expect(result.ok && result.value.score).toBe(0);
  });

  it('keeps "unreadable" in both modes, with no score and no task needed', () => {
    for (const mode of ['check', 'hint'] as const) {
      const result = validateHomeworkCheck({ ...check, verdict: 'unreadable', score: 50, task: '' }, mode);
      expect(result.ok && result.value.verdict).toBe('unreadable');
      expect(result.ok && result.value.score).toBe(0);
    }
  });

  it.each([
    ['an ungraded check', { ...check, verdict: 'open' }],
    ['a score above 100', { ...check, score: 120 }],
    ['a step without a verdict', { ...check, steps: [{ text: 'x', comment: '' }] }],
    ['an empty summary', { ...check, summary: '' }],
  ])('rejects %s', (_name, value) => {
    expect(validateHomeworkCheck(value, 'check').ok).toBe(false);
  });
});
