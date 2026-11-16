/**
 * Daily goal and streak: pure functions on calendar dates in "YYYY-MM-DD"
 * form (no database or device access, so they can be unit tested).
 *
 * Rule: a day counts when one of its two goals was met: the number of
 * reviews, or the number of points (earned by reviews and by practice). The streak
 * is the number of days in a row that count, ending today, or ending
 * yesterday while today's goal is not met yet (the streak is not lost until
 * the day is over).
 */

/** The calendar date of a moment in the device's time zone. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The date `days` days after (or before, if negative) the given date. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  // UTC has no daylight saving, so adding whole days is exact.
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Days in a row with the goal met, ending today or yesterday. */
export function currentStreak(metDates: readonly string[], today: string): number {
  const met = new Set(metDates);
  let day = met.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (met.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

/** The longest run of consecutive days with the goal met. */
export function longestStreak(metDates: readonly string[]): number {
  const sorted = [...new Set(metDates)].sort();
  let longest = 0;
  let run = 0;
  sorted.forEach((date, index) => {
    run = index > 0 && addDays(sorted[index - 1], 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return longest;
}

/** Progress towards today's goal between 0 and 1, for a progress bar. */
export function goalProgress(reviews: number, goal: number): number {
  if (goal <= 0) return 1;
  return Math.min(1, Math.max(0, reviews / goal));
}

/**
 * Progress towards today counting for the streak, between 0 and 1: the
 * further of the two goals, because reaching either one is enough.
 */
export function dayProgress(
  reviews: number,
  goal: number,
  points: number,
  pointsGoal: number,
): number {
  return Math.max(goalProgress(reviews, goal), goalProgress(points, pointsGoal));
}

/** "1-day streak", "5-day streak". */
export function streakLabel(days: number): string {
  return `${days}-day streak`;
}
