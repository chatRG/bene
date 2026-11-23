import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateKey } from '../domain/seed';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

const { useAppStore, STORE_KEY, STORE_VERSION, adoptLegacyStoreKey, migrateStoreState } = await import('./useAppStore');

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

describe('on-disk store contracts', () => {
  const LEGACY = 'bene-v0';

  afterEach(() => {
    storage.delete(STORE_KEY);
    storage.delete(LEGACY);
  });

  it('adopts the newest legacy blob when the current key is empty', () => {
    // Importing the store stamps the seed blob under STORE_KEY; clear it to
    // recreate the moment after a rename, when only the legacy key exists.
    storage.delete(STORE_KEY);
    storage.set(LEGACY, JSON.stringify({ state: { profile: { name: 'Legacy' } }, version: 1 }));
    adoptLegacyStoreKey(STORE_KEY, [LEGACY]);
    const adopted = JSON.parse(storage.get(STORE_KEY) ?? '{}');
    expect(adopted.state.profile.name).toBe('Legacy');
    expect(storage.has(LEGACY)).toBe(false);
  });

  it('never touches storage when the current key already has data', () => {
    storage.set(STORE_KEY, JSON.stringify({ state: { profile: { name: 'Current' } }, version: 1 }));
    storage.set(LEGACY, JSON.stringify({ state: { profile: { name: 'Old' } }, version: 1 }));
    adoptLegacyStoreKey(STORE_KEY, [LEGACY]);
    expect(JSON.parse(storage.get(STORE_KEY) ?? '{}').state.profile.name).toBe('Current');
    expect(storage.has(LEGACY)).toBe(true);
  });

  it('passes the current version through unchanged', () => {
    const data = { profile: { name: 'X' } };
    expect(migrateStoreState(data, STORE_VERSION)).toBe(data);
  });

  it('defines a migration step for every older store version', () => {
    // Tripwire for future bumps: a version without a step must fail here,
    // not silently seed over a person's data at runtime.
    const sample = { profile: { name: 'X' } };
    for (let from = 1; from < STORE_VERSION; from += 1) {
      expect(() => migrateStoreState(sample, from)).not.toThrow();
    }
  });

  it('refuses versions with no migration instead of seeding over them', () => {
    const data = { profile: { name: 'X' } };
    expect(() => migrateStoreState(data, 0)).toThrow(/No store migration/);
    expect(() => migrateStoreState(data, STORE_VERSION + 1)).toThrow(/newer than this build/);
  });
});
