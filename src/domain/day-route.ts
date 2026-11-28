import { dateKey } from './seed';

export const DAY_QUERY = 'date';

/**
 * The detail screens are day-scoped. A Home card carries its selected day as a
 * query parameter so the destination shows the same day, while direct links
 * without one keep opening today.
 *
 * Only real dates inside the user's timeline at or before today are accepted.
 * The date does not need a DayRecord: Home lets the user select a day before
 * anything was logged, and its detail screens must keep that same day rather
 * than silently switching to today.
 */
export function dayFromSearch(
  search: string,
  dayOrder: readonly string[],
  today = dateKey(new Date()),
): string {
  const value = new URLSearchParams(search).get(DAY_QUERY);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return today;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime()) || dateKey(parsed) !== value) return today;
  if (dayOrder.length > 0 && value < dayOrder[0]) return today;
  return value;
}

/** Add the selected day to a route, leaving today's URLs unchanged. */
export function dayPath(path: string, day: string, today = dateKey(new Date())): string {
  return day === today ? path : `${path}?${DAY_QUERY}=${encodeURIComponent(day)}`;
}
