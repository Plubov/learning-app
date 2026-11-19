/**
 * Focus timer: pure calculations on time and goals (no database or device
 * access, so they can be unit tested). Times are in milliseconds, dates in
 * "YYYY-MM-DD" form in the device's time zone. Weeks start on Monday.
 *
 * Today's goal for a project follows from its weekly goal: what is still
 * open of the week at the start of today, spread over the days left
 * (today included). A day with less work makes the following days a little
 * longer; a day with more makes them shorter. The app shows what has been
 * achieved against these goals, never what is left.
 */
import { addDays } from '@/lib/streak';

const MINUTE = 60_000;

/** Day of the week, 1 = Monday … 7 = Sunday. */
export function isoWeekday(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return weekday === 0 ? 7 : weekday;
}

/** The Monday of the week the date is in. */
export function weekStart(isoDate: string): string {
  return addDays(isoDate, 1 - isoWeekday(isoDate));
}

/** Days left in the week, today included: 7 on Monday, 1 on Sunday. */
export function daysLeftInWeek(isoDate: string): number {
  return 8 - isoWeekday(isoDate);
}

/**
 * Today's goal in milliseconds; 0 when the week's goal was already reached
 * before today, null when there is no weekly goal.
 * @param weekBeforeTodayMs time worked this week before today
 */
export function todayGoalMs(
  weeklyMinutes: number | null,
  weekBeforeTodayMs: number,
  isoDate: string,
): number | null {
  if (weeklyMinutes === null) return null;
  const open = weeklyMinutes * MINUTE - weekBeforeTodayMs;
  if (open <= 0) return 0;
  // Whole minutes read better ("52 min", not "51 min 25 s").
  return Math.ceil(open / daysLeftInWeek(isoDate) / MINUTE) * MINUTE;
}

/** Share of a goal reached, 0..1; 0 without a goal. */
export function share(doneMs: number, goalMs: number | null): number {
  if (goalMs === null || goalMs <= 0) return 0;
  return Math.min(1, Math.max(0, doneMs / goalMs));
}

/** True when going from `beforeMs` to `afterMs` reaches the goal (a celebration). */
export function reached(beforeMs: number, afterMs: number, goalMs: number | null): boolean {
  return goalMs !== null && goalMs > 0 && beforeMs < goalMs && afterMs >= goalMs;
}

/** Session milestones that earn a small celebration: every 25 minutes. */
export const MILESTONE_MS = 25 * MINUTE;

/** The milestone just passed (25 min, 50 min, …) or null. */
export function milestonePassed(beforeMs: number, afterMs: number): number | null {
  const before = Math.floor(beforeMs / MILESTONE_MS);
  const after = Math.floor(afterMs / MILESTONE_MS);
  return after > before && after > 0 ? after * MILESTONE_MS : null;
}

/** "0 min", "25 min", "1 h", "1 h 05 min". Rounded down to whole minutes. */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, '0')} min`;
}

/** The running clock: "4:07", "25:00", "1:02:09". */
export function formatClock(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Steps for the weekly goal control, in minutes: 30-minute steps; 0 = no goal. */
export const GOAL_STEP_MINUTES = 30;
export const MAX_WEEKLY_MINUTES = 80 * 60;

/** The next goal after pressing − or +; null means no goal. */
export function stepGoal(current: number | null, direction: -1 | 1): number | null {
  const next = (current ?? 0) + direction * GOAL_STEP_MINUTES;
  if (next <= 0) return null;
  return Math.min(MAX_WEEKLY_MINUTES, next);
}

/** An allowed link as typed: trimmed, "https://" added when missing; null when it is not a web address. */
export function normalizeLink(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The short name shown for a link: its host without "www." */
export function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
