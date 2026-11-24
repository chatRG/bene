import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayRecord, MealEntry, Workout } from '../domain/types';
import { dateKey, emptyDay } from '../domain/seed';
import { sleepFor, stateWithWeekOfData } from '../domain/fixtures';
import { SNAPSHOT_KEY, backupJson, createBackup } from '../domain/backup';

const storage = new Map<string, string>();
const mapStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};
vi.stubGlobal('localStorage', mapStorage);

const { useAppStore, STORE_KEY, STORE_VERSION, adoptLegacyStoreKey, migrateStoreState, storeGeneration } =
  await import('./useAppStore');

/** Reset the live store to a small onboarded account, like the real app after setup. */
function resetToOnboardedAccount() {
  const state = useAppStore.getState();
  useAppStore.setState({
    days: {},
    dayOrder: [],
    settings: { ...state.settings, onboarded: true, demoMode: false },
    profile: { ...state.profile, name: 'Test', birthDate: '1990-01-01' },
  });
}

describe('store data safety', () => {
  beforeEach(() => {
    resetToOnboardedAccount();
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

/** Re-import the store module against a prepared storage, so hydration runs again. */
async function importFreshStore() {
  vi.resetModules();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fresh = await import('./useAppStore');
  // Recovery runs on a microtask queued during module evaluation.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { fresh, warn };
}

describe('hydration safety', () => {
  afterEach(() => {
    storage.delete(STORE_KEY);
    storage.delete(SNAPSHOT_KEY);
  });

  it('keeps the corrupt blob write-blocked when there is no snapshot', async () => {
    const corrupt = '{"state":{"profile":{"name":"Kept"}},"version":99}';
    storage.set(STORE_KEY, corrupt);
    const { fresh, warn } = await importFreshStore();
    try {
      // The corrupt state is not adopted: the store stays at the seed...
      expect(fresh.useAppStore.getState().profile.name).toBe('');
      // ...every persist write is held back...
      expect(fresh.isPersistWriteBlocked()).toBe(true);
      fresh.useAppStore.getState().ensureToday();
      expect(storage.get(STORE_KEY)).toBe(corrupt);
      // ...and the failure is loud, not silent.
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps the corrupt blob when it is not even valid JSON', async () => {
    storage.set(STORE_KEY, 'not json{');
    const { fresh, warn } = await importFreshStore();
    try {
      expect(fresh.useAppStore.getState().profile.name).toBe('');
      expect(storage.get(STORE_KEY)).toBe('not json{');
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('recovers the on-device snapshot when the blob is unreadable', async () => {
    storage.set(STORE_KEY, '{"state":{"profile":{"name":"Kept"}},"version":99}');
    storage.set(SNAPSHOT_KEY, JSON.stringify(createBackup(stateWithWeekOfData(new Date('2026-11-14T13:20:00')))));
    const { fresh, warn } = await importFreshStore();
    try {
      expect(fresh.useAppStore.getState().profile.name).toBe('Test User');
      expect(fresh.isPersistWriteBlocked()).toBe(false);
      // The recovered state replaces the damaged blob on disk.
      const persisted = JSON.parse(storage.get(STORE_KEY) ?? '{}');
      expect(persisted.state.profile.name).toBe('Test User');
      expect(Object.keys(persisted.state.days).length).toBe(7);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('persist write failures', () => {
  afterEach(() => {
    vi.stubGlobal('localStorage', mapStorage);
    vi.restoreAllMocks();
    storage.delete(SNAPSHOT_KEY);
  });

  it('warns and keeps working when the persist write fails', () => {
    vi.stubGlobal('localStorage', {
      ...mapStorage,
      setItem: (key: string, value: string) => {
        if (key === STORE_KEY) throw new Error('QuotaExceededError');
        storage.set(key, value);
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => useAppStore.getState().addJournal('2026-02-02', 'energy', 4)).not.toThrow();
    expect(useAppStore.getState().days['2026-02-02'].journal).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not fake lastBackupAt when the post-restore snapshot fails to save', () => {
    resetToOnboardedAccount();
    vi.stubGlobal('localStorage', {
      ...mapStorage,
      setItem: (key: string, value: string) => {
        if (key === SNAPSHOT_KEY) throw new Error('QuotaExceededError');
        storage.set(key, value);
      },
    });
    const file = backupJson(stateWithWeekOfData(new Date('2026-11-14T13:20:00')));
    const result = useAppStore.getState().importBackupJson(file);
    expect(result.ok).toBe(true);
    expect(useAppStore.getState().profile.name).toBe('Test User');
    expect(useAppStore.getState().settings.lastBackupAt).toBeNull();
  });
});

describe('restore semantics', () => {
  beforeEach(() => {
    resetToOnboardedAccount();
  });

  afterEach(() => {
    storage.delete(SNAPSHOT_KEY);
    vi.stubGlobal('localStorage', mapStorage);
    vi.restoreAllMocks();
  });

  it('writes a fresh snapshot and stamps lastBackupAt from it on snapshot restore', () => {
    storage.set(SNAPSHOT_KEY, JSON.stringify(createBackup(stateWithWeekOfData(new Date('2026-11-14T13:20:00')))));
    const result = useAppStore.getState().restoreLatestBackup();
    expect(result.ok).toBe(true);
    expect(useAppStore.getState().profile.name).toBe('Test User');
    const snap = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    // The snapshot matches the restored state and carries its own timestamp...
    expect(snap.data.profile.name).toBe('Test User');
    // ...which is the only value lastBackupAt may claim.
    expect(useAppStore.getState().settings.lastBackupAt).toBe(snap.exportedAt);
  });

  it('writes a fresh snapshot on file import', () => {
    storage.delete(SNAPSHOT_KEY);
    const result = useAppStore.getState().importBackupJson(backupJson(stateWithWeekOfData(new Date('2026-11-14T13:20:00'))));
    expect(result.ok).toBe(true);
    const snap = JSON.parse(storage.get(SNAPSHOT_KEY) ?? '{}');
    expect(snap.data.profile.name).toBe('Test User');
    expect(useAppStore.getState().settings.lastBackupAt).toBe(snap.exportedAt);
  });

  it('advances the generation on restore so in-flight health reads are dropped', () => {
    const before = storeGeneration();
    const result = useAppStore.getState().importBackupJson(backupJson(stateWithWeekOfData(new Date('2026-11-14T13:20:00'))));
    expect(result.ok).toBe(true);
    expect(storeGeneration()).toBe(before + 1);
  });

  it('does not advance the generation when the import is rejected', () => {
    const before = storeGeneration();
    const result = useAppStore.getState().importBackupJson('{"app":"bene","version":99,"data":{}}');
    expect(result.ok).toBe(false);
    expect(storeGeneration()).toBe(before);
  });
});

function workoutOn(date: string): Workout {
  return {
    id: 'w-hand',
    kind: 'walk',
    name: 'Evening walk',
    date,
    start: `${date}T18:00:00.000Z`,
    durationMin: 40,
    distanceKm: null,
    avgHr: null,
    maxHr: null,
    calories: null,
    strain: 2,
    source: 'bene',
    imported: false,
    zoneMinutes: [0, 0, 40, 0, 0, 0],
  };
}

function mealOn(date: string): MealEntry {
  return {
    id: 'm-hand',
    name: 'Toast and peanut butter',
    date,
    time: '07:30',
    calories: 320,
    proteinG: 12,
    carbsG: 38,
    fatG: 14,
    fiberG: 4,
    vegGrams: 0,
    fruitCups: 0,
    wholeGrainServings: 1,
    healthyOilPctOfCalories: 0,
    nutsGrams: 20,
    omega3Mg: 0,
    redMeatGrams: 0,
    processedMeatGrams: 0,
    alcoholGrams: 0,
    sodiumMg: 180,
    addedSugarG: 3,
    source: 'bene',
  };
}

describe('health import merging', () => {
  beforeEach(() => {
    resetToOnboardedAccount();
  });

  it('keeps hand-logged counters when a health read replaces the measured ones', () => {
    const date = '2026-03-03';
    useAppStore.setState((s) => ({
      days: { ...s.days, [date]: { ...emptyDay(date), metrics: { ...emptyDay(date).metrics, hydrationMl: 1500, caffeineMg: 90, daylightMinutes: 35 } } },
      dayOrder: [...s.dayOrder, date],
    }));
    useAppStore.getState().logWorkout(workoutOn(date));
    // Android-shaped read: it owns the measurements and reports 0 exercise
    // minutes because the hand-logged walk is not in the health store.
    const incoming: DayRecord = {
      ...emptyDay(date),
      metrics: {
        ...emptyDay(date).metrics,
        steps: 8000,
        activeCalories: 300,
        totalCalories: 2100,
        exerciseMinutes: 0,
        hrSamples: [{ minute: 600, bpm: 71 }],
        wearMinutes: 900,
      },
      workouts: [],
    };
    useAppStore.getState().importHealthDays([incoming]);
    const day = useAppStore.getState().days[date];
    // The 40 hand-logged minutes survive a health read that says 0.
    expect(day.metrics.exerciseMinutes).toBe(40);
    expect(day.metrics.steps).toBe(8000);
    expect(day.metrics.hrSamples).toEqual([{ minute: 600, bpm: 71 }]);
    expect(day.workouts.map((w) => w.id)).toEqual(['w-hand']);
    // Lifestyle numbers the person logged by hand are never overwritten.
    expect(day.metrics.hydrationMl).toBe(1500);
    expect(day.metrics.caffeineMg).toBe(90);
    expect(day.metrics.daylightMinutes).toBe(35);
  });

  it('registers an off-timeline date in dayOrder when a log creates the day', () => {
    useAppStore.getState().logWorkout(workoutOn('2020-05-05'));
    expect(useAppStore.getState().dayOrder).toContain('2020-05-05');
    useAppStore.getState().addMeal(mealOn('2020-05-06'));
    const order = useAppStore.getState().dayOrder;
    expect(order).toContain('2020-05-06');
    expect(order).toEqual([...order].sort());
  });
});

describe('naps', () => {
  beforeEach(() => {
    resetToOnboardedAccount();
  });

  it('creates a real 20-minute core nap on a day without sleep', () => {
    useAppStore.getState().logNap('2026-11-20');
    const day = useAppStore.getState().days['2026-11-20'];
    const session = day.sleep;
    expect(session).not.toBeNull();
    expect(session?.date).toBe('2026-11-20');
    expect(session?.stages).toEqual([{ stage: 'core', startMin: 0, endMin: 20 }]);
    expect(new Date(session?.end ?? '').getTime() - new Date(session?.start ?? '').getTime()).toBe(20 * 60000);
    expect(session?.source).toBe('Bene');
    expect(session?.imported).toBe(false);
    expect(session?.hrvMs).toBeNull();
    expect(session?.alarm).toBeNull();
    expect(useAppStore.getState().dayOrder).toContain('2026-11-20');
  });

  it('leaves an existing night of sleep alone', () => {
    const date = '2026-11-21';
    const session = sleepFor(date);
    useAppStore.setState((s) => ({
      days: { ...s.days, [date]: { ...emptyDay(date), sleep: session } },
      dayOrder: [...s.dayOrder, date],
    }));
    useAppStore.getState().logNap(date);
    expect(useAppStore.getState().days[date].sleep).toBe(session);
  });
});

describe('onboarding keeps imported days', () => {
  beforeEach(() => {
    resetToOnboardedAccount();
    useAppStore.setState((s) => ({ settings: { ...s.settings, onboarded: false } }));
  });

  it('keeps days that carry only hydration, caffeine or daytime HRV', () => {
    const onlyHydration = { ...emptyDay('2026-11-01'), metrics: { ...emptyDay('2026-11-01').metrics, hydrationMl: 2000 } };
    const onlyHrv = { ...emptyDay('2026-11-02'), metrics: { ...emptyDay('2026-11-02').metrics, daytimeHrvMs: 55 } };
    const empty = emptyDay('2026-11-03');
    useAppStore.setState({
      days: { '2026-11-01': onlyHydration, '2026-11-02': onlyHrv, '2026-11-03': empty },
      dayOrder: ['2026-11-01', '2026-11-02', '2026-11-03'],
    });
    useAppStore.getState().completeOnboarding('Sam');
    const state = useAppStore.getState();
    expect(state.settings.onboarded).toBe(true);
    expect(state.days['2026-11-01']).toBeDefined();
    expect(state.days['2026-11-02']).toBeDefined();
    // A day with no data at all is still dropped.
    expect(state.days['2026-11-03']).toBeUndefined();
  });
});
