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
