/**
 * The device's IANA time zone, e.g. "Europe/Berlin". The database uses it to
 * decide which day a review belongs to, so "today" starts at local midnight.
 */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}
