import { describe, expect, it } from 'vitest';
import { dayFromSearch, dayPath } from './day-route';

const days = ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'];
const today = '2026-11-25';

describe('day routes', () => {
  it('reads an existing past day from the query', () => {
    expect(dayFromSearch('?date=2026-11-24', days, today)).toBe('2026-11-24');
  });

  it('falls back to today for a missing, future or impossible day', () => {
    expect(dayFromSearch('', days, today)).toBe(today);
    expect(dayFromSearch('?date=2026-11-26', days, today)).toBe(today);
    expect(dayFromSearch('?date=2026-02-31', days, today)).toBe(today);
    expect(dayFromSearch('?date=not-a-day', days, today)).toBe(today);
  });

  it('does not open a day outside the timeline', () => {
    expect(dayFromSearch('?date=2026-11-20', days, today)).toBe(today);
  });

  it('keeps today free of a query string', () => {
    expect(dayPath('/sleep', today, today)).toBe('/sleep');
    expect(dayPath('/sleep', '2026-11-24', today)).toBe('/sleep?date=2026-11-24');
  });
});
