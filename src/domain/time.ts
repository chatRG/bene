import { format, isValid, parseISO } from 'date-fns';

/**
 * Combine a local calendar date (`yyyy-MM-dd`) and a wall-clock time
 * (`HH:mm`) into one local Date. Callers must use this instead of `new Date()`
 * when the entry belongs to a day other than today, or the stored timestamp
 * carries today's clock for a back-dated entry.
 */
export function dateAtTime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const parsed = parseISO(`${date}T${time}`);
  return isValid(parsed) ? parsed : null;
}

/**
 * Format a stored ISO timestamp as local wall-clock time (`7:10 AM`).
 * Timestamps are written in UTC, so slicing the ISO string would show the
 * UTC clock to anyone outside UTC.
 */
export function clockLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isValid(d) ? format(d, 'h:mm a') : '—';
}

/**
 * Kilocalories as a display label, or '—' when the day's total burn is
 * unknown — a Health Connect day with no total-calorie record is unknown, not
 * zero, and printing 0 would read as a real measurement.
 */
export function kcal(value: number | null | undefined): string {
  return value != null ? value.toLocaleString() : '—';
}

/**
 * The resting part of a day's burn: total minus active. Unknown when the total
 * is unknown, never guessed from the active part alone.
 */
export function restingBurn(metrics: { totalCalories: number | null; activeCalories: number }): number | null {
  return metrics.totalCalories != null ? metrics.totalCalories - metrics.activeCalories : null;
}
