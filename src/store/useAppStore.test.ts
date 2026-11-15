import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dateKey } from '../domain/seed';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

const { useAppStore } = await import('./useAppStore');

describe('store data safety', () => {
  beforeEach(() => {
    const state = useAppStore.getState();
    useAppStore.setState({
      days: {},
      dayOrder: [],
      settings: { ...state.settings, onboarded: true, demoMode: false },
      profile: { ...state.profile, name: 'Test', birthDate: '1990-01-01' },
    });
  });

  it('creates an empty day for a real user, not the demo day', () => {
    useAppStore.getState().ensureToday();
    const day = useAppStore.getState().days[dateKey(new Date())];
    expect(day).toBeDefined();
    expect(day.sleep).toBeNull();
    expect(day.workouts).toEqual([]);
    expect(day.meals).toEqual([]);
  });

  it('does not inject demo data when logging on a missing date', () => {
    useAppStore.getState().addJournal('2020-01-01', 'energy', 3);
    const day = useAppStore.getState().days['2020-01-01'];
    expect(day.sleep).toBeNull();
    expect(day.workouts).toEqual([]);
    expect(day.meals).toEqual([]);
  });

  it('clears all data and returns to onboarding', () => {
    useAppStore.getState().ensureToday();
    useAppStore.getState().clearAll();
    const state = useAppStore.getState();
    expect(state.settings.onboarded).toBe(false);
    expect(state.days).toEqual({});
    expect(state.chats).toEqual([]);
  });
});
