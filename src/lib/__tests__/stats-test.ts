import { barHeights, formatDuration, rememberedPercent, weekdayLabel } from '@/lib/stats';

describe('rememberedPercent', () => {
  test('no reviews gives no percentage', () => {
    expect(rememberedPercent(0, 0)).toBeNull();
  });

  test('share of reviews not rated "again", rounded', () => {
    expect(rememberedPercent(10, 0)).toBe(100);
    expect(rememberedPercent(10, 10)).toBe(0);
    expect(rememberedPercent(3, 1)).toBe(67);
  });
});

describe('formatDuration', () => {
  test('minutes, rounded', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(29_000)).toBe('0 min');
    expect(formatDuration(90_000)).toBe('2 min');
    expect(formatDuration(59 * 60_000)).toBe('59 min');
  });

  test('hours and minutes from one hour on', () => {
    expect(formatDuration(60 * 60_000)).toBe('1 h');
    expect(formatDuration(65 * 60_000)).toBe('1 h 5 min');
  });

  test('a negative time counts as zero', () => {
    expect(formatDuration(-5000)).toBe('0 min');
  });
});

describe('barHeights', () => {
  test('the largest value gets the full height', () => {
    expect(barHeights([5, 10, 0], 100)).toEqual([50, 100, 0]);
  });

  test('a small non-zero value stays visible', () => {
    expect(barHeights([1, 1000], 100)).toEqual([2, 100]);
  });

  test('all zero or empty gives zero heights', () => {
    expect(barHeights([0, 0], 100)).toEqual([0, 0]);
    expect(barHeights([], 100)).toEqual([]);
  });
});

describe('weekdayLabel', () => {
  test('gives the weekday of a calendar date', () => {
    expect(weekdayLabel('2026-11-13')).toBe('Fr');
    expect(weekdayLabel('2026-11-15')).toBe('Su');
  });
});
