import {
  daysLeftInWeek,
  formatClock,
  formatDuration,
  isoWeekday,
  linkLabel,
  milestonePassed,
  normalizeLink,
  reached,
  share,
  stepGoal,
  todayGoalMs,
  weekStart,
} from '../focus';

const MIN = 60_000;

describe('weeks', () => {
  test('Monday is 1 and Sunday is 7', () => {
    expect(isoWeekday('2026-11-16')).toBe(1);
    expect(isoWeekday('2026-11-22')).toBe(7);
  });

  test('the week starts on Monday, also across a month end', () => {
    expect(weekStart('2026-11-20')).toBe('2026-11-16');
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
    expect(weekStart('2026-12-02')).toBe('2026-11-30');
  });

  test('days left include today', () => {
    expect(daysLeftInWeek('2026-11-16')).toBe(7);
    expect(daysLeftInWeek('2026-11-22')).toBe(1);
  });
});

describe('todayGoalMs', () => {
  test('no weekly goal gives no daily goal', () => {
    expect(todayGoalMs(null, 0, '2026-11-16')).toBeNull();
  });

  test('on Monday the week is spread evenly', () => {
    expect(todayGoalMs(420, 0, '2026-11-16')).toBe(60 * MIN);
  });

  test('a slow start makes the remaining days longer', () => {
    // Friday: 2 h of 7 h done, 5 h left over 3 days = 100 min.
    expect(todayGoalMs(420, 120 * MIN, '2026-11-20')).toBe(100 * MIN);
  });

  test('rounds up to whole minutes', () => {
    expect(todayGoalMs(100, 0, '2026-11-16')).toBe(15 * MIN);
  });

  test('a week already done needs nothing more today', () => {
    expect(todayGoalMs(60, 90 * MIN, '2026-11-18')).toBe(0);
  });
});

describe('progress and celebrations', () => {
  test('share is capped and 0 without a goal', () => {
    expect(share(30 * MIN, 60 * MIN)).toBe(0.5);
    expect(share(90 * MIN, 60 * MIN)).toBe(1);
    expect(share(30 * MIN, null)).toBe(0);
    expect(share(30 * MIN, 0)).toBe(0);
  });

  test('reached is true only for the step that crosses the goal', () => {
    expect(reached(59 * MIN, 60 * MIN, 60 * MIN)).toBe(true);
    expect(reached(60 * MIN, 61 * MIN, 60 * MIN)).toBe(false);
    expect(reached(10 * MIN, 20 * MIN, 60 * MIN)).toBe(false);
    expect(reached(0, 10 * MIN, 0)).toBe(false);
    expect(reached(0, 10 * MIN, null)).toBe(false);
  });

  test('milestones every 25 minutes', () => {
    expect(milestonePassed(24 * MIN, 25 * MIN)).toBe(25 * MIN);
    expect(milestonePassed(25 * MIN, 26 * MIN)).toBeNull();
    expect(milestonePassed(49 * MIN, 51 * MIN)).toBe(50 * MIN);
    expect(milestonePassed(0, 1000)).toBeNull();
  });
});

describe('formatting', () => {
  test('durations', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(25 * MIN + 59_000)).toBe('25 min');
    expect(formatDuration(60 * MIN)).toBe('1 h');
    expect(formatDuration(65 * MIN)).toBe('1 h 05 min');
  });

  test('the clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(247_000)).toBe('4:07');
    expect(formatClock(3_729_000)).toBe('1:02:09');
  });
});

describe('goal steps', () => {
  test('30-minute steps, below the first step means no goal', () => {
    expect(stepGoal(null, 1)).toBe(30);
    expect(stepGoal(30, -1)).toBeNull();
    expect(stepGoal(420, 1)).toBe(450);
    expect(stepGoal(4800, 1)).toBe(4800);
  });
});

describe('allowed links', () => {
  test('adds https and rejects what is not an address', () => {
    expect(normalizeLink(' dict.naver.com ')).toBe('https://dict.naver.com/');
    expect(normalizeLink('https://www.deepl.com/translator')).toBe('https://www.deepl.com/translator');
    expect(normalizeLink('')).toBeNull();
    expect(normalizeLink('hello')).toBeNull();
  });

  test('shows the host without www', () => {
    expect(linkLabel('https://www.deepl.com/translator')).toBe('deepl.com');
  });
});
