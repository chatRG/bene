import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { dayFromSearch } from '../domain/day-route';
import { dateKey } from '../domain/seed';

/** The day a day-scoped detail screen should render. */
export function useDayParam(): string {
  const { search } = useLocation();
  const dayOrder = useAppStore((s) => s.dayOrder);
  const today = dateKey(new Date());
  return useMemo(() => dayFromSearch(search, dayOrder, today), [search, dayOrder, today]);
}
