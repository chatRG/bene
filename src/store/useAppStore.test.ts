import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateKey } from '../domain/seed';
import type { DayMetrics, DayRecord } from '../domain/types';

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

/**
 * The import merge contract. Health Connect has no exercise-time record, so an
 * imported Android day always reports zero exercise minutes — an unsupported
 * metric, not a measured zero. A sync must never turn that zero into the day's
 * total when a hand-logged workout already contributed real minutes.
 */
describe('importHealthDays: the import merge', () => {
  const D = '2026-11-20';

  const metrics = (over: Partial<DayMetrics> = {}): DayMetrics => ({
    date: D,
    steps: 0,
    activeCalories: 0,
    totalCalories: 0,
    exerciseMinutes: 0,
    daylightMinutes: 0,
    hydrationMl: 0,
    caffeineMg: 0,
    alcoholGrams: 0,
    hrSamples: [],
    daytimeHrvMs: null,
    stressSamples: [],
    tempDeviationC: null,
    wearMinutes: 0,
    ...over,
  });

  const day = (over: Partial<DayRecord> = {}): DayRecord => ({
    date: D,
    sleep: null,
    metrics: metrics(),
    workouts: [],
    meals: [],
    journal: [],
    ...over,
  });

  const handWorkout = {
    id: 'w-hand',
    kind: 'run' as const,
    name: 'Morning run',
    date: D,
    start: `${D}T07:00:00.000Z`,
    durationMin: 30,
    distanceKm: null,
    avgHr: null,
    maxHr: null,
    calories: null,
    strain: 0,
    source: 'bene',
    imported: false,
    zoneMinutes: [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number],
  };

  beforeEach(() => {
    // Tests share the module's store, so start from an empty timeline.
    useAppStore.setState({ days: {}, dayOrder: [] });
    useAppStore.getState().logWorkout(handWorkout);
  });

  it('keeps a manually logged exercise total when the source cannot measure exercise', () => {
    useAppStore.getState().importHealthDays([day({ metrics: metrics({ steps: 4000, exerciseUnsupported: true }) })]);

    const saved = useAppStore.getState().days[D];
    expect(saved.metrics.exerciseMinutes).toBe(30);
    expect(saved.workouts).toHaveLength(1);
    expect(saved.metrics.steps).toBe(4000);
  });

  it('keeps the manual total stable when the same Android day syncs twice', () => {
    const incoming = [day({ metrics: metrics({ steps: 4000, exerciseUnsupported: true }) })];
    useAppStore.getState().importHealthDays(incoming);
    useAppStore.getState().importHealthDays(incoming);

    const saved = useAppStore.getState().days[D];
    expect(saved.metrics.exerciseMinutes).toBe(30);
    expect(saved.workouts).toHaveLength(1);
    // And the workout itself is not duplicated by the repeats.
    expect(saved.workouts.filter((w) => w.id === 'w-hand')).toHaveLength(1);
  });

  it('still replaces the total with a measured value, including a measured zero', () => {
    // Apple Health does supply exercise minutes, so its import carries no
    // unsupported mark — even a measured zero is a real reading and wins.
    useAppStore.getState().importHealthDays([day({ metrics: metrics({ steps: 4000, exerciseMinutes: 0 }) })]);

    expect(useAppStore.getState().days[D].metrics.exerciseMinutes).toBe(0);
  });
});
