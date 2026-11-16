/**
 * How an exam date changes scheduling. Pure functions (the current time is a
 * parameter), so they can be tested.
 *
 * Nothing here schedules a card (CLAUDE.md rule 7). It only decides two
 * settings that ts-fsrs itself offers, for decks with an exam ahead:
 *   - the maximum interval: no card is scheduled past the day before the
 *     exam, so each one is seen again in time;
 *   - the desired retention: how sure FSRS should make recall. Higher means
 *     shorter intervals, i.e. more reviews.
 */

/** In the last days before the exam, recall is aimed higher than the usual 90%. */
const FINAL_DAYS = 21;
const USUAL_RETENTION = 0.9;
const FINAL_RETENTION = 0.95;

/**
 * In the last week, cards that are scheduled for after the exam are brought
 * into the session early (FSRS handles an early review correctly).
 */
export const EARLY_REVIEW_DAYS = 7;

/** Whether text is a real calendar date in the form YYYY-MM-DD. */
export function isValidDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Whole days from today (the device's calendar day) to the date: 0 today, negative when past. */
export function daysUntil(isoDate: string, now: Date): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  // Both as UTC midnights, so daylight saving cannot add or lose an hour.
  const target = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}

export type ExamSettings = { maximumInterval: number; desiredRetention: number };

/**
 * The ts-fsrs settings for a deck with this exam date, or null when the
 * usual settings apply: no date, or the exam is today or over.
 */
export function examSettings(examDate: string | null, now: Date): ExamSettings | null {
  if (!examDate || !isValidDate(examDate)) return null;
  const days = daysUntil(examDate, now);
  if (days < 1) return null;
  return {
    // Due the day before the exam at the latest.
    maximumInterval: Math.max(1, days - 1),
    desiredRetention: days <= FINAL_DAYS ? FINAL_RETENTION : USUAL_RETENTION,
  };
}
