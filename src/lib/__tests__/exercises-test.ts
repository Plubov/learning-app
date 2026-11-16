import type { Question } from '../course-content';
import { buildExercises, sentenceMatches, tilesFor, type PracticeItem } from '../exercises';

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
