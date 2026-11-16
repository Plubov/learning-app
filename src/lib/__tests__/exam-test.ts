import { daysUntil, examSettings, isValidDate } from '../exam';
import { priorityFirst } from '../review-session';

/** Noon on 10 November 2026, device time. */
const now = new Date(2026, 10, 10, 12, 0, 0);

describe('isValidDate', () => {
  it('accepts real dates in the form YYYY-MM-DD only', () => {
    expect(isValidDate('2027-02-14')).toBe(true);
    expect(isValidDate('2027-02-30')).toBe(false);
    expect(isValidDate('14.02.2027')).toBe(false);
    expect(isValidDate('2027-2-14')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });
});

describe('daysUntil', () => {
  it('counts calendar days, whatever the time of day', () => {
    expect(daysUntil('2026-11-10', now)).toBe(0);
    expect(daysUntil('2026-11-11', new Date(2026, 10, 10, 23, 59))).toBe(1);
    expect(daysUntil('2026-11-09', now)).toBe(-1);
    expect(daysUntil('2027-02-14', now)).toBe(96);
  });
});

describe('examSettings', () => {
  it('keeps every card due before the exam', () => {
    expect(examSettings('2027-02-14', now)).toEqual({ maximumInterval: 95, desiredRetention: 0.9 });
  });

  it('aims for surer recall in the last three weeks', () => {
    expect(examSettings('2026-11-20', now)).toEqual({ maximumInterval: 9, desiredRetention: 0.95 });
  });

  it('never asks for an interval under a day', () => {
    expect(examSettings('2026-11-11', now)?.maximumInterval).toBe(1);
  });

  it('changes nothing without a date, on the exam day, afterwards, or for a bad date', () => {
    expect(examSettings(null, now)).toBeNull();
    expect(examSettings('2026-11-10', now)).toBeNull();
    expect(examSettings('2026-10-01', now)).toBeNull();
    expect(examSettings('soon', now)).toBeNull();
  });
});

describe('priorityFirst', () => {
  it('moves priority entries to the front and keeps the order otherwise', () => {
    const cards = [
      { id: 'a', deck: 'x' },
      { id: 'b', deck: 'p' },
      { id: 'c', deck: 'x' },
      { id: 'd', deck: 'p' },
    ];
    expect(priorityFirst(cards, (card) => card.deck === 'p').map((card) => card.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });
});
