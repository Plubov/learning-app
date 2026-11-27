import type { Question } from '../course-content';
import {
  buildExercises,
  buildReviewExercises,
  filledGap,
  sentenceMatches,
  tilesFor,
  type PracticeItem,
} from '../exercises';

/** Always 0: the shuffle then gives a fixed, known order. */
const fixed = () => 0;

const items: PracticeItem[] = [
  { id: '1', term: '물', meaning: 'water', proficiency: 0.8 },
  { id: '2', term: '차', meaning: 'tea', proficiency: 0.1 },
  { id: '3', term: '밥', meaning: 'rice', proficiency: 0.5 },
  { id: '4', term: '빵', meaning: 'bread', proficiency: 0.3 },
  { id: '5', term: '우유', meaning: 'milk', proficiency: 0.9 },
];

const choice: Question = {
  item_id: '1',
  kind: 'choice',
  prompt: 'What does 물 mean?',
  options: ['water', 'tea', 'rice'],
  answer: 'water',
  explanation: '',
};
const typed: Question = { item_id: '2', kind: 'typed', prompt: 'tea', options: [], answer: '차', explanation: '' };
const build: Question = {
  item_id: '3',
  kind: 'build',
  prompt: 'Rice, please.',
  options: ['물', '차'],
  answer: '밥 주세요.',
  explanation: '',
};

describe('tilesFor', () => {
  it('offers the words of the sentence and the wrong words, without final punctuation', () => {
    expect(tilesFor('밥 주세요.', ['물'], fixed).sort()).toEqual(['물', '밥', '주세요'].sort());
  });

  it('keeps a word that occurs twice as two tiles', () => {
    expect(tilesFor('no no yes', [], fixed)).toHaveLength(3);
  });
});

describe('sentenceMatches', () => {
  it('accepts the right order whatever the punctuation and case', () => {
    expect(sentenceMatches(['밥', '주세요'], '밥 주세요.')).toBe(true);
    expect(sentenceMatches(['the', 'tea', 'is', 'hot'], 'The tea is hot!')).toBe(true);
  });

  it('rejects another order, a missing word and an extra word', () => {
    expect(sentenceMatches(['주세요', '밥'], '밥 주세요.')).toBe(false);
    expect(sentenceMatches(['밥'], '밥 주세요.')).toBe(false);
    expect(sentenceMatches(['밥', '물', '주세요'], '밥 주세요.')).toBe(false);
  });
});

describe('buildExercises', () => {
  const exercises = buildExercises([choice, typed, build], items, 'ko', fixed);

  it('keeps the AI questions in order and spreads its own exercises between them', () => {
    expect(exercises.filter((e) => ['choice', 'typed', 'build'].includes(e.kind)).map((e) => e.kind)).toEqual([
      'choice',
      'typed',
      'build',
    ]);
    expect(exercises.map((e) => e.kind).sort()).toEqual(
      ['build', 'choice', 'listen', 'listen', 'match', 'typed'].sort(),
    );
    // Not all of the app's exercises in one block at the start or the end.
    expect(exercises[0].kind).toBe('choice');
    expect(exercises[exercises.length - 1].kind).toBe('build');
  });

  it('listens to the weakest items, with the right meaning among the options', () => {
    const listening = exercises.filter((e) => e.kind === 'listen');
    expect(listening.map((e) => e.itemId)).toEqual(['2', '4']);
    for (const exercise of listening) {
      expect(exercise.options).toContain(exercise.answer);
      expect(new Set(exercise.options).size).toBe(3);
    }
  });

  it('matches the four weakest items, each meaning once', () => {
    const match = exercises.find((e) => e.kind === 'match');
    expect(match?.pairs.map((pair) => pair.itemId).sort()).toEqual(['1', '2', '3', '4']);
    expect([...(match?.meanings ?? [])].sort()).toEqual(['bread', 'rice', 'tea', 'water']);
  });

  it('gives a build exercise its tiles', () => {
    const exercise = exercises.find((e) => e.kind === 'build');
    expect(exercise?.tiles.sort()).toEqual(['물', '밥', '주세요', '차'].sort());
  });

  it('has no listening and no sentence building outside language courses', () => {
    const kinds = buildExercises([choice, typed, build], items, null, fixed).map((e) => e.kind);
    expect(kinds).not.toContain('listen');
    expect(kinds).not.toContain('build');
    expect(kinds).toContain('match');
  });

  it('adds nothing of its own when the items cannot be told apart', () => {
    const same = items.slice(0, 3).map((item) => ({ ...item, meaning: 'water' }));
    expect(buildExercises([choice], same, 'ko', fixed).map((e) => e.kind)).toEqual(['choice']);
  });
});

describe('cloze questions', () => {
  const cloze: Question = {
    item_id: '1',
    kind: 'cloze',
    prompt: '저는 ___ 마셔요.',
    options: ['물을', '물이', '물은'],
    answer: '물을',
    translation: 'I drink water.',
    explanation: '',
  };

  it('become gap exercises with their translation and all options', () => {
    const [exercise] = buildExercises([cloze], [], 'ko', fixed);
    expect(exercise.kind).toBe('cloze');
    if (exercise.kind !== 'cloze') return;
    expect(exercise.translation).toBe('I drink water.');
    expect([...exercise.options].sort()).toEqual([...cloze.options].sort());
  });

  it('fill their gap for reading aloud', () => {
    expect(filledGap(cloze.prompt, cloze.answer)).toBe('저는 물을 마셔요.');
  });
});

describe('buildReviewExercises', () => {
  const sentence: Question = {
    item_id: '2',
    kind: 'build',
    prompt: 'Tea, please.',
    options: [],
    answer: '차 주세요',
    explanation: '',
  };
  const word: Question = { ...sentence, kind: 'typed', prompt: 'tea', answer: '차' };

  it('works on the weakest items, at most eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, term: `t${i}`, meaning: `m${i}`, proficiency: i / 12 }));
    const review = buildReviewExercises(many, [], 'ko', fixed);
    const ids = review.flatMap((e) => (e.kind === 'match' ? [] : [e.itemId]));
    expect(ids).toHaveLength(8);
    expect(ids).not.toContain('i11');
  });

  it('prefers a sentence written for an item over a single word', () => {
    const review = buildReviewExercises(items, [{ itemId: '2', question: word }, { itemId: '2', question: sentence }], 'ko', fixed);
    expect(review.find((e) => e.kind !== 'match' && e.itemId === '2')?.kind).toBe('build');
  });

  it('makes an exercise for items without questions, and one round of pairs', () => {
    const review = buildReviewExercises(items, [], 'ko', fixed);
    expect(review.filter((e) => e.kind === 'match')).toHaveLength(1);
    expect(review.some((e) => e.kind === 'listen')).toBe(true);
    expect(buildReviewExercises(items, [], null, fixed).some((e) => e.kind === 'listen')).toBe(false);
  });
});
