import {
  addDays,
  currentStreak,
  goalProgress,
  longestStreak,
  toIsoDate,
} from '@/lib/streak';

describe('toIsoDate', () => {
  test('uses the local calendar date with leading zeros', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 10, 13, 0, 1))).toBe('2026-11-13');
  });
});

describe('addDays', () => {
  test('moves across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  test('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  test('is not affected by daylight saving changes', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-03-29', -1)).toBe('2026-03-28');
  });
});

describe('currentStreak', () => {
  const today = '2026-11-13';

  test('no days met gives 0', () => {
    expect(currentStreak([], today)).toBe(0);
  });

  test('counts back from today when today is met', () => {
    expect(currentStreak(['2026-11-11', '2026-11-12', '2026-11-13'], today)).toBe(3);
  });

  test('today not met yet: the streak up to yesterday still counts', () => {
    expect(currentStreak(['2026-11-11', '2026-11-12'], today)).toBe(2);
  });

  test('a missed day ends the streak', () => {
    expect(currentStreak(['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13'], today)).toBe(2);
  });

  test('yesterday missed and today not met gives 0', () => {
    expect(currentStreak(['2026-11-10', '2026-11-11'], today)).toBe(0);
  });

  test('order and duplicates do not matter', () => {
    expect(currentStreak(['2026-11-13', '2026-11-12', '2026-11-12'], today)).toBe(2);
  });

  test('continues across a month end', () => {
    expect(currentStreak(['2026-11-30', '2026-12-01'], '2026-12-01')).toBe(2);
  });
});

describe('longestStreak', () => {
  test('no days gives 0', () => {
    expect(longestStreak([])).toBe(0);
  });

  test('finds the longest run anywhere in the history', () => {
    expect(
      longestStreak(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-10', '2026-11-11']),
    ).toBe(3);
  });

  test('unsorted input with duplicates', () => {
    expect(longestStreak(['2026-11-02', '2026-11-01', '2026-11-02'])).toBe(2);
  });
});

describe('goalProgress', () => {
  test('share of the goal, capped at 1', () => {
    expect(goalProgress(0, 20)).toBe(0);
    expect(goalProgress(5, 20)).toBe(0.25);
    expect(goalProgress(30, 20)).toBe(1);
  });

  test('a goal of 0 counts as reached', () => {
    expect(goalProgress(0, 0)).toBe(1);
  });
});
