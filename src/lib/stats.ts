/**
 * Statistics screen: the shape of the database function `review_stats` and
 * pure helpers for showing its numbers (no database or device access here,
 * so they can be unit tested).
 */

export type DayStats = { date: string; reviews: number; again: number };

/** Result of `review_stats` (see its migration for how each number is counted). */
export type ReviewStats = {
  today: { reviews: number; again: number; duration_ms: number; new_items: number };
  /** One entry per day, oldest first, ending today. */
  days: DayStats[];
  items: { not_started: number; learning: number; known: number };
  due: { tomorrow: number; next_7_days: number };
};

/**
 * Share of reviews that were remembered (rated anything but "again"), as a
 * whole percentage; null when there were no reviews.
 */
export function rememberedPercent(reviews: number, again: number): number | null {
  if (reviews <= 0) return null;
  return Math.round(((reviews - again) / reviews) * 100);
}

/** Study time for display: "0 min", "12 min", "1 h 5 min". */
export function formatDuration(ms: number): string {
  const minutes = Math.round(Math.max(0, ms) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Bar heights in pixels for a chart whose tallest bar is `maxHeight`.
 * A day with at least one review is never thinner than `minHeight`, so it
 * stays visible next to a busy day; a day without reviews has height 0.
 */
export function barHeights(values: readonly number[], maxHeight: number, minHeight = 2): number[] {
  const largest = Math.max(0, ...values);
  if (largest === 0) return values.map(() => 0);
  return values.map((v) =>
    v <= 0 ? 0 : Math.max(minHeight, Math.round((v / largest) * maxHeight)),
  );
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Short weekday label for a date in "YYYY-MM-DD" form, e.g. "Fr". */
export function weekdayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  // Built from the parts (not new Date(isoDate), which means UTC midnight)
  // so the weekday is the same in every time zone.
  return WEEKDAYS[new Date(year, month - 1, day).getDay()];
}
