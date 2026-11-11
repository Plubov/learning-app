import {
  cardToSchedule,
  createScheduler,
  formatInterval,
  previewIntervals,
  reviewCard,
  rowToCard,
  type CardRow,
  type Scheduler,
} from '@/lib/scheduling';

const NOW = new Date('2026-03-01T09:00:00.000Z');
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** A card exactly as the database creates it (column defaults). */
function newCardRow(): CardRow {
  return {
    id: 'card-1',
    due_at: NOW.toISOString(),
    stability: 0,
    stability_fast: 0,
    difficulty: 0,
    scheduled_days: 0,
    learning_step: 0,
    state: 0,
    schedule_status: 'new',
    reps: 0,
    lapses: 0,
    last_review_at: null,
  };
}

/** Applies a review and returns the updated row. */
function review(scheduler: Scheduler, row: CardRow, rating: 1 | 2 | 3 | 4, now: Date): CardRow {
  return { id: row.id, ...reviewCard(scheduler, row, rating, now) };
}

const dueIn = (row: CardRow, from: Date) => new Date(row.due_at).getTime() - from.getTime();

let scheduler: Scheduler;

beforeAll(async () => {
  scheduler = await createScheduler();
});

describe('row conversion', () => {
  test('row -> card -> row gives the same values', () => {
    const { id, ...schedule } = newCardRow();
    expect(cardToSchedule(rowToCard({ id, ...schedule }))).toEqual(schedule);
  });

  test('uses the row id as the ts-fsrs cardId', () => {
    expect(rowToCard(newCardRow()).cardId).toBe('card-1');
  });

  test('dates become Date objects', () => {
    const card = rowToCard(newCardRow());
    expect(card.dueAt).toBeInstanceOf(Date);
    expect(card.dueAt.getTime()).toBe(NOW.getTime());
    expect(card.lastReviewAt).toBeNull();
  });

  test('an unknown state in the database is rejected', () => {
    expect(() => rowToCard({ ...newCardRow(), state: 7 })).toThrow('Invalid FSRS state');
  });

  test('an unknown schedule_status is rejected', () => {
    expect(() => rowToCard({ ...newCardRow(), schedule_status: 'paused' })).toThrow(
      'Invalid schedule_status',
    );
  });
});

describe('reviewCard', () => {
  test('"again" on a new card brings it back within minutes (learning)', () => {
    const after = review(scheduler, newCardRow(), 1, NOW);
    expect(after.state).toBe(1);
    expect(after.schedule_status).toBe('learning');
    expect(dueIn(after, NOW)).toBeGreaterThan(0);
    expect(dueIn(after, NOW)).toBeLessThanOrEqual(10 * MINUTE);
  });

  test('every review counts and records the review time', () => {
    const after = review(scheduler, newCardRow(), 3, NOW);
    expect(after.reps).toBe(1);
    expect(after.last_review_at).toBe(NOW.toISOString());
  });

  test('FSRS-7 fills in stability_fast', () => {
    const after = review(scheduler, newCardRow(), 3, NOW);
    expect(after.stability).toBeGreaterThan(0);
    expect(after.stability_fast).toBeGreaterThan(0);
  });

  test('better ratings never give shorter intervals', () => {
    const row = newCardRow();
    const intervals = [1, 2, 3, 4].map((r) =>
      dueIn(review(scheduler, row, r as 1 | 2 | 3 | 4, NOW), NOW),
    );
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1]);
    }
    expect(intervals[3]).toBeGreaterThan(intervals[0]);
  });

  test('a card that keeps being remembered gets longer intervals', () => {
    let row = newCardRow();
    let now = NOW;
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      row = review(scheduler, row, 3, now);
      gaps.push(dueIn(row, now));
      now = new Date(row.due_at);
    }
    expect(row.state).toBe(2);
    expect(gaps[3]).toBeGreaterThan(gaps[1]);
    expect(gaps[3]).toBeGreaterThan(DAY);
  });

  test('forgetting a review card counts a lapse and relearns it', () => {
    let row = newCardRow();
    let now = NOW;
    while (row.state !== 2) {
      row = review(scheduler, row, 3, now);
      now = new Date(row.due_at);
    }
    const after = review(scheduler, row, 1, now);
    expect(after.lapses).toBe(row.lapses + 1);
    expect(after.state).toBe(3);
    expect(dueIn(after, now)).toBeLessThan(DAY);
  });

  test('does not change the input row', () => {
    const row = newCardRow();
    const copy = { ...row };
    review(scheduler, row, 4, NOW);
    expect(row).toEqual(copy);
  });

  test('same input gives the same result (no fuzzing)', () => {
    const row = newCardRow();
    expect(reviewCard(scheduler, row, 3, NOW)).toEqual(reviewCard(scheduler, row, 3, NOW));
  });
});

describe('previewIntervals', () => {
  test('matches what reviewCard would schedule', () => {
    const row = newCardRow();
    const preview = previewIntervals(scheduler, row, NOW);
    for (const rating of [1, 2, 3, 4] as const) {
      expect(preview[rating] * DAY).toBeCloseTo(dueIn(review(scheduler, row, rating, NOW), NOW), -1);
    }
  });
});

describe('formatInterval', () => {
  test.each([
    [0, '1m'],
    [1 / (24 * 60), '1m'],
    [10 / (24 * 60), '10m'],
    [3 / 24, '3h'],
    [1, '1d'],
    [4.78, '5d'],
    [45, '2mo'],
    [400, '1.1y'],
    [4000, '11y'],
  ])('%p days -> %p', (days, label) => {
    expect(formatInterval(days)).toBe(label);
  });
});
