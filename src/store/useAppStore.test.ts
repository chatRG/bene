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
    settings: { ...state.settings, onboarded: true, demoMode: false, lastHealthSyncAt: null },
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
    useAppStore.getState().importHealthDays([], '2026-11-21T10:15:00.000Z');
    useAppStore.getState().clearAll();
    const state = useAppStore.getState();
    expect(state.settings.onboarded).toBe(false);
    expect(state.settings.lastHealthSyncAt).toBeNull();
    expect(state.days).toEqual({});
    expect(state.chats).toEqual([]);
    expect(state.journalTags.length).toBeGreaterThan(0);
    expect(state.journalTags.map((tag) => tag.id)).toContain('mood');
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

  it('unblocks persistence after an accepted explicit restore', async () => {
    storage.set(STORE_KEY, '{"state":{"profile":{"name":"Kept"}},"version":99}');
    const { fresh, warn } = await importFreshStore();
    try {
      // No snapshot: recovery leaves every write held back.
      expect(fresh.isPersistWriteBlocked()).toBe(true);
      // The person then restores a backup file by hand — an accepted act.
      const file = backupJson(stateWithWeekOfData(new Date('2026-11-14T13:20:00')));
      expect(fresh.useAppStore.getState().importBackupJson(file).ok).toBe(true);
      expect(fresh.isPersistWriteBlocked()).toBe(false);
      // And writes after it really land in storage.
      const before = JSON.parse(storage.get(STORE_KEY) ?? '{}');
      fresh.useAppStore.getState().ensureToday();
      const after = JSON.parse(storage.get(STORE_KEY) ?? '{}');
      expect(Object.keys(after.state.days).length).toBeGreaterThan(Object.keys(before.state.days).length);
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps persistence blocked while an import is rejected', async () => {
    storage.set(STORE_KEY, '{"state":{"profile":{"name":"Kept"}},"version":99}');
    const { fresh, warn } = await importFreshStore();
    try {
      expect(fresh.isPersistWriteBlocked()).toBe(true);
      const result = fresh.useAppStore.getState().importBackupJson('{"app":"bene","version":99,"data":{}}');
      expect(result.ok).toBe(false);
      expect(fresh.isPersistWriteBlocked()).toBe(true);
      // And the damaged blob is still untouched.
      expect(storage.get(STORE_KEY)).toBe('{"state":{"profile":{"name":"Kept"}},"version":99}');
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

  it('does not carry a newer health cursor into an older restored backup', () => {
    const backup = createBackup(stateWithWeekOfData(new Date('2026-11-14T13:20:00')));
    delete (backup.data.settings as Partial<typeof backup.data.settings>).lastHealthSyncAt;
    useAppStore.getState().importHealthDays([], '2026-11-25T10:15:00.000Z');
    expect(useAppStore.getState().settings.lastHealthSyncAt).toBe('2026-11-25T10:15:00.000Z');
    const result = useAppStore.getState().importBackupJson(JSON.stringify(backup));
    expect(result.ok).toBe(true);
    expect(useAppStore.getState().settings.lastHealthSyncAt).toBeNull();
  });

  it('fills new active-tab defaults when restoring an older backup', () => {
    const backup = createBackup(stateWithWeekOfData(new Date('2026-11-14T13:20:00')));
    backup.data.settings.activeTabs = { fitness: true, journal: true } as typeof backup.data.settings.activeTabs;
    const result = useAppStore.getState().importBackupJson(JSON.stringify(backup));
    expect(result.ok).toBe(true);
    expect(useAppStore.getState().settings.activeTabs.nutrition).toBe(true);
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

  it('advances the sync cursor even when a successful read has no samples', () => {
    const syncedAt = '2026-11-21T10:15:00.000Z';
    useAppStore.getState().importHealthDays([], syncedAt);
    expect(useAppStore.getState().settings.lastHealthSyncAt).toBe(syncedAt);
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

  it('keeps known measurements when a partial health read returns empty defaults', () => {
    const date = '2026-03-05';
    const imported = { ...workoutOn(date), id: 'w-imported', imported: true };
    useAppStore.setState((s) => ({
      days: {
        ...s.days,
        [date]: {
          ...emptyDay(date),
          metrics: {
            ...emptyDay(date).metrics,
            steps: 8123,
            activeCalories: 500,
            totalCalories: 2300,
            hrSamples: [{ minute: 600, bpm: 70 }],
            wearMinutes: 800,
          },
          sleep: sleepFor(date),
          workouts: [imported],
        },
      },
      dayOrder: [...s.dayOrder, date].sort(),
    }));

    // One store type failed; this day still appears because another answered,
    // but every failed field is the record-zero default.
    useAppStore.getState().importHealthDays([emptyDay(date)]);

    const day = useAppStore.getState().days[date];
    expect(day.metrics.steps).toBe(8123);
    expect(day.metrics.activeCalories).toBe(500);
    expect(day.metrics.totalCalories).toBe(2300);
    expect(day.metrics.hrSamples).toEqual([{ minute: 600, bpm: 70 }]);
    expect(day.metrics.wearMinutes).toBe(800);
    expect(day.sleep).not.toBeNull();
    expect(day.workouts.map((w) => w.id)).toEqual(['w-imported']);
  });

  it('keeps known overnight metrics when a later sleep sync lacks them', () => {
    const date = '2026-03-06';
    const known = { ...sleepFor(date), hrvMs: 64, rhrBpm: 51, respiratoryRate: 14.2 };
    useAppStore.setState((s) => ({
      days: { ...s.days, [date]: { ...emptyDay(date), sleep: known } },
      dayOrder: [...s.dayOrder, date].sort(),
    }));

    // A partial read returned the stages but not the HRV/RHR scopes.
    useAppStore.getState().importHealthDays([{ ...emptyDay(date), sleep: { ...sleepFor(date), hrvMs: null, rhrBpm: null, respiratoryRate: null } }]);

    const sleep = useAppStore.getState().days[date].sleep!;
    expect(sleep.stages).toEqual(known.stages);
    expect(sleep.hrvMs).toBe(64);
    expect(sleep.rhrBpm).toBe(51);
    expect(sleep.respiratoryRate).toBe(14.2);
  });

  it('fills imported workout zones on import so every training consumer sees the load', () => {
    const date = '2026-03-07';
    const imported = {
      ...workoutOn(date),
      id: 'w-health',
      imported: true,
      avgHr: null,
      maxHr: null,
      strain: 0,
      zoneMinutes: [0, 0, 0, 0, 0, 0] as Workout['zoneMinutes'],
    };
    const start = new Date(imported.start);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const incoming: DayRecord = {
      ...emptyDay(date),
      metrics: {
        ...emptyDay(date).metrics,
        hrSamples: [
          { minute: startMin + 5, bpm: 138 },
          { minute: startMin + 20, bpm: 160 },
          { minute: startMin + 40, bpm: 148 },
        ],
      },
      workouts: [imported],
    };

    useAppStore.getState().importHealthDays([incoming]);

    const stored = useAppStore.getState().days[date].workouts[0];
    expect(stored.zoneMinutes.some((minutes) => minutes > 0)).toBe(true);
    expect(stored.avgHr).toBeGreaterThan(0);
    expect(stored.strain).toBeGreaterThan(0);
  });

  it('does not count a manual workout and its imported twin twice', () => {
    const date = '2026-03-08';
    const manual = workoutOn(date);
    useAppStore.setState((s) => ({
      days: { ...s.days, [date]: { ...emptyDay(date), workouts: [manual] } },
      dayOrder: [...s.dayOrder, date].sort(),
    }));
    const imported = { ...manual, id: 'w-health', imported: true, zoneMinutes: [0, 0, 0, 0, 0, 0] as Workout['zoneMinutes'] };

    useAppStore.getState().importHealthDays([{ ...emptyDay(date), workouts: [imported] }]);

    expect(useAppStore.getState().days[date].workouts.map((w) => w.id)).toEqual([manual.id]);
  });

  it('keeps the manual total stable when the same Android day syncs twice', () => {
    const date = '2026-03-04';
    useAppStore.setState((s) => ({ days: { ...s.days, [date]: { ...emptyDay(date) } }, dayOrder: [...s.dayOrder, date] }));
    useAppStore.getState().logWorkout(workoutOn(date));
    // The Android-shaped read has no exercise-time record, so it reports 0.
    const incoming: DayRecord = {
      ...emptyDay(date),
      metrics: { ...emptyDay(date).metrics, steps: 4000, exerciseMinutes: 0 },
      workouts: [],
    };

    useAppStore.getState().importHealthDays([incoming]);
    useAppStore.getState().importHealthDays([incoming]);

    const day = useAppStore.getState().days[date];
    // Neither dropped by the first sync nor inflated by the second.
    expect(day.metrics.exerciseMinutes).toBe(40);
    expect(day.metrics.steps).toBe(4000);
    expect(day.workouts).toHaveLength(1);
    expect(day.workouts.map((w) => w.id)).toEqual(['w-hand']);
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

  it('creates a real 20-minute core nap without pretending it is the night', () => {
    useAppStore.getState().logNap('2026-11-20');
    const day = useAppStore.getState().days['2026-11-20'];
    const session = day.naps?.[0];
    expect(day.sleep ?? null).toBeNull();
    expect(session).toBeDefined();
    expect(session?.date).toBe('2026-11-20');
    expect(session?.stages).toEqual([{ stage: 'core', startMin: 0, endMin: 20 }]);
    expect(new Date(session?.end ?? '').getTime() - new Date(session?.start ?? '').getTime()).toBe(20 * 60000);
    expect(session?.source).toBe('Bene');
    expect(session?.imported).toBe(false);
    expect(session?.hrvMs).toBeNull();
    expect(session?.alarm).toBeNull();
    expect(useAppStore.getState().dayOrder).toContain('2026-11-20');
  });

  it('falls on the selected local date when the Timeline shows a past day', () => {
    const selected = '2020-05-05';
    useAppStore.getState().logNap(selected);
    const session = useAppStore.getState().days[selected].naps![0];
    const end = new Date(session.end);
    const [y, m, d] = selected.split('-').map(Number);
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([y, m - 1, d]);
    expect(new Date(session.end).getTime() - new Date(session.start).getTime()).toBe(20 * 60000);
    expect(session.date).toBe(selected);
  });

  it('keeps an existing night of sleep and stores the nap separately', () => {
    const date = '2026-11-21';
    const session = sleepFor(date);
    useAppStore.setState((s) => ({
      days: { ...s.days, [date]: { ...emptyDay(date), sleep: session } },
      dayOrder: [...s.dayOrder, date],
    }));
    useAppStore.getState().logNap(date);
    const day = useAppStore.getState().days[date];
    expect(day.sleep).toBe(session);
    expect(day.naps).toHaveLength(1);
  });

  it('preserves a logged nap when the overnight sync lands', () => {
    const date = '2026-11-21';
    useAppStore.getState().logNap(date);
    const napId = useAppStore.getState().days[date].naps![0].id;
    useAppStore.getState().importHealthDays([{ ...emptyDay(date), sleep: sleepFor(date) }]);

    const day = useAppStore.getState().days[date];
    expect(day.sleep?.id).toBe(sleepFor(date).id);
    expect(day.naps?.map((n) => n.id)).toEqual([napId]);
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
