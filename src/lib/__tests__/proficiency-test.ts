import {
  cardStrength,
  courseWeek,
  itemProficiency,
  proficiencyByItem,
  proficiencyLevel,
  quizAccuracy,
  type ProficiencyCard,
  type QuizAnswer,
} from '@/lib/proficiency';

const NOW = new Date('2026-11-16T12:00:00Z');

function card(overrides: Partial<ProficiencyCard> = {}): ProficiencyCard {
  return {
    item_id: 'a',
    state: 2,
    stability: 30,
    scheduled_days: 30,
    due_at: '2026-11-20T12:00:00Z',
    reps: 5,
    ...overrides,
  };
}

function answer(correct: boolean | null, day: number, item_id = 'a'): QuizAnswer {
  return { item_id, correct, reviewed_at: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z` };
}

describe('cardStrength', () => {
  it('is 0 for a card never reviewed', () => {
    expect(cardStrength(card({ state: 0, reps: 0, stability: 0 }), NOW)).toBe(0);
  });

  it('is low while the card is being learned or relearned', () => {
    expect(cardStrength(card({ state: 1 }), NOW)).toBe(0.3);
    expect(cardStrength(card({ state: 3 }), NOW)).toBe(0.3);
  });

  it('grows with stability and reaches 1 at a month', () => {
    expect(cardStrength(card({ stability: 3 }), NOW)).toBeCloseTo(0.55);
    expect(cardStrength(card({ stability: 15 }), NOW)).toBeCloseTo(0.75);
    expect(cardStrength(card({ stability: 30 }), NOW)).toBe(1);
    expect(cardStrength(card({ stability: 400 }), NOW)).toBe(1);
  });

  it('is reduced once the card is overdue by more than its interval', () => {
    const slightlyLate = card({ scheduled_days: 10, due_at: '2026-11-10T12:00:00Z' });
    const veryLate = card({ scheduled_days: 10, due_at: '2026-11-01T12:00:00Z' });
    expect(cardStrength(slightlyLate, NOW)).toBe(1);
    expect(cardStrength(veryLate, NOW)).toBeCloseTo(0.7);
  });
});

describe('quizAccuracy', () => {
  it('is null without checked answers', () => {
    expect(quizAccuracy([])).toBeNull();
    expect(quizAccuracy([answer(null, 1)])).toBeNull();
  });

  it('counts only the latest five answers', () => {
    const answers = [1, 2, 3].map((d) => answer(false, d)).concat([4, 5, 6, 7, 8].map((d) => answer(true, d)));
    expect(quizAccuracy(answers)).toBe(1);
    expect(quizAccuracy([...answers, answer(false, 9)])).toBe(0.8);
  });
});

describe('itemProficiency', () => {
  it('is the average card strength without quiz answers', () => {
    expect(itemProficiency([card(), card({ state: 1 })], [], NOW)).toBeCloseTo(0.65);
  });

  it('mixes cards (70%) and quiz answers (30%)', () => {
    expect(itemProficiency([card()], [answer(false, 1)], NOW)).toBeCloseTo(0.7);
    expect(itemProficiency([card({ state: 0, reps: 0 })], [answer(true, 1)], NOW)).toBeCloseTo(0.3);
  });

  it('is 0 for an item with nothing recorded', () => {
    expect(itemProficiency([], [], NOW)).toBe(0);
  });
});

describe('proficiencyByItem', () => {
  it('keeps the items apart', () => {
    const scores = proficiencyByItem(
      ['a', 'b', 'c'],
      [card(), card({ item_id: 'b', state: 1 })],
      [answer(true, 1, 'b')],
      NOW,
    );
    expect(scores.a).toBe(1);
    expect(scores.b).toBeCloseTo(0.7 * 0.3 + 0.3);
    expect(scores.c).toBe(0);
  });
});

describe('proficiencyLevel', () => {
  it('names the bands', () => {
    expect(proficiencyLevel(0)).toBe('New');
    expect(proficiencyLevel(0.3)).toBe('Weak');
    expect(proficiencyLevel(0.4)).toBe('Getting there');
    expect(proficiencyLevel(0.75)).toBe('Strong');
  });
});

describe('courseWeek', () => {
  it('starts at 1 and advances every seven days', () => {
    expect(courseWeek('2026-11-16T08:00:00Z', NOW)).toBe(1);
    expect(courseWeek('2026-11-09T13:00:00Z', NOW)).toBe(1);
    expect(courseWeek('2026-11-09T11:00:00Z', NOW)).toBe(2);
    expect(courseWeek('2026-12-01T00:00:00Z', NOW)).toBe(1); // clock differences
  });
});
