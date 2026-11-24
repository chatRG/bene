import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type {
  ActivityStatus,
  AppSettings,
  AppStateData,
  ChatMessage,
  ChatThread,
  DayRecord,
  HealthRecord,
  JournalEntry,
  JournalTag,
  JournalValue,
  MealEntry,
  Routine,
  SleepSession,
  UserProfile,
  Workout,
} from '../domain/types';
import { buildSeed, emptyDay } from '../domain/seed';
import { dateOf } from '../domain/derive';
import { generateCoachReply, ghostExpiry } from '../domain/coach';
import { uid } from '../domain/id';
import { SNAPSHOT_KEY, backupJson, parseBackup, readSnapshot, saveSnapshot } from '../domain/backup';

/**
 * On-disk contracts, read by every existing install:
 *
 * - STORE_KEY is the localStorage key the persisted store lives under. To
 *   rename it, keep the blob: add the old key to LEGACY_STORE_KEYS and the
 *   adoption step below moves it across before the store hydrates.
 * - STORE_VERSION is stamped inside that blob. Bump it only with a matching
 *   entry in STORE_MIGRATIONS; a missing step throws at hydration instead of
 *   quietly seeding a fresh account over a person's data.
 */
export const STORE_KEY = 'bene-v1';
export const STORE_VERSION = 1;

/** localStorage keys the store lived under before STORE_KEY, oldest first. */
const LEGACY_STORE_KEYS: readonly string[] = [];

/** One entry per version bump: STORE_MIGRATIONS[1] moves a version-1 blob to version 2. */
const STORE_MIGRATIONS: Record<number, (state: AppStateData) => AppStateData> = {};

/**
 * Runs before the persist middleware reads storage, so a renamed key adopts
 * its old blob instead of booting a fresh account over it. Newest legacy blob
 * wins; any failure leaves storage untouched.
 */
export function adoptLegacyStoreKey(key: string, legacyKeys: readonly string[]): void {
  try {
    if (localStorage.getItem(key) !== null) return;
    let blob: string | null = null;
    let found: string | null = null;
    for (const legacy of legacyKeys) {
      const value = localStorage.getItem(legacy);
      if (value !== null) {
        blob = value;
        found = legacy;
      }
    }
    if (!blob || !found) return;
    localStorage.setItem(key, blob);
    localStorage.removeItem(found);
  } catch {
    // Missing storage or a full quota: leave the old blob where it is.
  }
}
adoptLegacyStoreKey(STORE_KEY, LEGACY_STORE_KEYS);

/**
 * The persist middleware calls this only when a blob's version differs from
 * STORE_VERSION. It refuses to guess: a version without a migration step, or
 * one written by a newer build, throws — hydration aborts and the blob stays
 * on disk rather than being seeded over.
 */
export function migrateStoreState(persisted: unknown, fromVersion: number): AppStateData {
  if (fromVersion > STORE_VERSION) {
    throw new Error(`Store version ${fromVersion} is newer than this build (${STORE_VERSION}).`);
  }
  let state = persisted as AppStateData;
  for (let version = fromVersion; version < STORE_VERSION; version += 1) {
    const step = STORE_MIGRATIONS[version];
    if (!step) {
      throw new Error(`No store migration from version ${version}; add STORE_MIGRATIONS[${version}].`);
    }
    state = step(state);
  }
  return state;
}

/**
 * Advanced whenever the whole store is cleared.
 *
 * A health read can take seconds; if the person deletes everything while it
 * runs, the result that arrives afterwards belongs to an account that no
 * longer exists. Callers capture this before a read and compare it after, so
 * stale data is discarded instead of silently restored.
 */
let clearGeneration = 0;

export const storeGeneration = () => clearGeneration;

/**
 * Blocks persist writes while the stored blob is unreadable.
 *
 * When the blob under STORE_KEY cannot be parsed or migrated, zustand keeps
 * the module seed in memory and the very next set() would overwrite the
 * person's data on disk with that empty account. While this flag is set the
 * safe storage adapter below refuses every persist write, so the corrupt
 * blob survives until the on-device snapshot can replace it — or forever
 * when no snapshot exists, which keeps it available for manual recovery.
 */
let persistWritesBlocked = false;

/** True while the stored blob is unreadable and persist writes are held back. */
export const isPersistWriteBlocked = () => persistWritesBlocked;

/**
 * The localStorage-shaped adapter every persist write goes through.
 *
 * - While persistWritesBlocked is set, setItem is a no-op (see above).
 * - A failed write is warned about and dropped instead of throwing out of
 *   whatever action triggered the save: losing the newest state to a full
 *   quota is bad, crashing the log action on top of it is worse.
 */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    if (persistWritesBlocked) return;
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      console.warn(`[bene] Could not persist state under "${name}".`, error);
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Nothing to do: the key stays as-is when storage is unavailable.
    }
  },
};

/**
 * A day carries data when anything a person or a health read has put in it
 * is non-default. Onboarding keeps exactly these days: imported HRV, stress,
 * temperature, caffeine, hydration or alcohol numbers are data, even when
 * the day has no sleep, steps or workouts yet.
 */
export function dayHasData(rec: DayRecord | undefined): boolean {
  if (!rec) return false;
  if (rec.sleep || rec.workouts.length || rec.meals.length || rec.journal.length) return true;
  const m = rec.metrics;
  return (
    m.steps > 0 ||
    m.activeCalories > 0 ||
    m.totalCalories > 0 ||
    m.exerciseMinutes > 0 ||
    m.daylightMinutes > 0 ||
    m.hydrationMl > 0 ||
    m.caffeineMg > 0 ||
    m.alcoholGrams > 0 ||
    m.hrSamples.length > 0 ||
    m.daytimeHrvMs !== null ||
    m.stressSamples.length > 0 ||
    m.tempDeviationC !== null ||
    m.wearMinutes > 0
  );
}

interface AppActions {
  updateSettings: (patch: Partial<AppSettings>) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  completeOnboarding: (
    name: string,
    opts?: {
      sex?: UserProfile['sex'];
      birthDate?: string;
      heightCm?: number;
      weightKg?: number;
      goal?: UserProfile['goal'];
    },
  ) => void;
  ensureToday: () => void;
  importHealthDays: (records: DayRecord[]) => void;
  setActivityStatus: (status: ActivityStatus, untilISO: string | null, note: string) => void;
  addMeal: (meal: MealEntry) => void;
  removeMeal: (date: string, id: string) => void;
  addJournal: (date: string, tagId: string, value: JournalValue) => void;
  addJournalTag: (label: string, kind: JournalTag['kind'], unit?: string) => void;
  togglePinTag: (tagId: string) => void;
  saveHomeLayout: (order: string[]) => void;
  logWorkout: (workout: Workout) => void;
  /** Contract for the Timeline "Log a 20-minute nap" button. */
  logNap: (date: string) => void;
  addRoutine: (routine: Routine) => void;
  completeRoutineDay: (routineId: string, date: string) => void;
  toggleTab: (tab: 'fitness' | 'journal' | 'biology' | 'nutrition') => void;
  createChatThread: (ghost?: boolean, model?: ChatThread['model']) => string;
  sendChatMessage: (threadId: string, text: string, attachmentName?: string) => void;
  deleteChat: (threadId: string) => void;
  togglePinChat: (threadId: string) => void;
  renameChat: (threadId: string, title: string) => void;
  uploadRecord: (name: string, sizeKb: number, kind: HealthRecord['kind']) => void;
  removeRecord: (id: string) => void;
  clearAll: () => void;
  backupNow: () => { ok: boolean; at: string | null };
  restoreLatestBackup: () => { ok: boolean; error?: string };
  importBackupJson: (json: string) => { ok: boolean; error?: string };
  exportBackupJson: () => string;
}

export type AppStore = AppStateData & AppActions;

const initial = buildSeed(new Date());

/**
 * The day for `date`, plus the dayOrder that must accompany it.
 *
 * Logging on a date the timeline has never seen (a back-dated meal, a
 * workout on a past day) creates the day here — and the date has to join
 * dayOrder with it, or the log becomes an invisible orphan: derive,
 * baselines and scoreHistory all walk dayOrder, never the days map. New
 * dates slot in sorted, matching how importHealthDays orders its batch.
 */
function withDayEntry(state: AppStore, date: string): { day: DayRecord; dayOrder: string[] } {
  const existing = state.days[date];
  if (existing) return { day: existing, dayOrder: state.dayOrder };
  return {
    day: emptyDay(date),
    dayOrder: [...state.dayOrder.filter((d) => d !== date), date].sort(),
  };
}

/**
 * Recovery for an unreadable stored blob.
 *
 * Runs as a microtask: the persist middleware finishes hydration during
 * store creation, before the module-level store binding exists, so the
 * snapshot has to be applied one tick later — still before React renders.
 * The on-device snapshot, the last state Bene managed to save, is the only
 * copy that does not depend on the damaged blob, so it wins.
 */
function recoverFromUnreadableBlob(seedSettings: AppSettings, error: unknown): void {
  console.warn(
    '[bene] The stored data could not be read. Holding back every write so the damaged blob survives for recovery.',
    error,
  );
  persistWritesBlocked = true;
  // Storage can be gone entirely (disabled, torn down under us); a missing
  // snapshot read must not turn recovery itself into the crash.
  let parsed: ReturnType<typeof readSnapshot> | null;
  try {
    parsed = readSnapshot();
  } catch {
    parsed = null;
  }
  if (!parsed || !parsed.ok) {
    console.warn(
      '[bene] No on-device snapshot could be read either. Writes stay blocked so the damaged data can be recovered manually.',
    );
    return;
  }
  // The snapshot parsed: put it back in the store and let persist overwrite
  // the damaged blob with it on the next write.
  persistWritesBlocked = false;
  useAppStore.setState({
    ...parsed.data,
    settings: {
      ...seedSettings,
      ...parsed.data.settings,
      activeTabs: { ...seedSettings.activeTabs, ...parsed.data.settings?.activeTabs },
    },
  });
  console.warn('[bene] Restored the on-device snapshot over the unreadable stored data.');
}

/**
 * The tail of both restore paths.
 *
 * docs/BACKUP.md, Restore semantics: "Bene writes a fresh snapshot of the
 * restored state." The snapshot save is the thing being promised, so
 * `lastBackupAt` moves only when it actually saved — to the snapshot's own
 * timestamp, never to the current time and never to a fabricated value when
 * the save failed.
 */
function finishRestore(): { ok: boolean; error?: string } {
  const snap = saveSnapshot(useAppStore.getState());
  useAppStore.setState((s) => ({ settings: { ...s.settings, lastBackupAt: snap.at } }));
  return { ok: true };
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...initial,

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),

      completeOnboarding: (name, opts) =>
        set((s) => {
          const onboardedSettings = { ...s.settings, onboarded: true };
          const profile = {
            ...s.profile,
            name: name.trim() || s.profile.name,
            sex: opts?.sex ?? s.profile.sex,
            birthDate: opts?.birthDate ?? s.profile.birthDate,
            // Body metrics are only overwritten when the person actually gave them.
            heightCm: opts?.heightCm ?? s.profile.heightCm,
            weightKg: opts?.weightKg ?? s.profile.weightKg,
            goal: opts?.goal ?? s.profile.goal,
          };
          // A new account starts empty: one blank day for today and nothing
          // else. Anything already imported during onboarding survives, so
          // connecting a health store on the first run is not thrown away when
          // the person finishes the flow.
          const today = dateOf(new Date());
          const imported = s.dayOrder.filter((d) => dayHasData(s.days[d]));
          const days: Record<string, DayRecord> = {};
          for (const date of imported) days[date] = s.days[date];
          days[today] = days[today] ?? emptyDay(today);
          return {
            profile,
            settings: onboardedSettings,
            days,
            dayOrder: imported.includes(today) ? imported : [...imported, today],
            journalEntries: [],
            biomarkers: [],
            healthRecords: [],
            chats: [],
            routines: [],
            activityEvents: [],
            seededAt: new Date().toISOString(),
          };
        }),

      ensureToday: () => {
        const today = dateOf(new Date());
        set((s) => {
          if (s.days[today]) return s;
          return {
            days: { ...s.days, [today]: emptyDay(today) },
            dayOrder: [...s.dayOrder.filter((d) => d !== today), today],
          };
        });
      },

      // Merge a batch read from the phone's health store. Health owns the
      // numbers it measures: steps, calories, exercise minutes, HR and HRV,
      // wear time, temperature and stress. Everything the person logs by
      // hand — daylight, hydration, caffeine, alcohol — is kept exactly as
      // logged, and meals, journal entries and hand-logged workouts are
      // never overwritten by a sync.
      //
      // exerciseMinutes is the one ambiguous counter: logWorkout folds
      // hand-logged minutes into the same number health reports, so neither
      // value can simply win. The larger one does — an Android-shaped read
      // that says 0 (its store has no exercise-time record at all) while the
      // person logged 40 minutes by hand keeps the 40.
      importHealthDays: (records) =>
        set((s) => {
          if (!records.length) return s;
          const days = { ...s.days };
          const order = [...s.dayOrder];
          for (const incoming of records) {
            const existing = days[incoming.date];
            days[incoming.date] = existing
              ? {
                  ...existing,
                  sleep: incoming.sleep ?? existing.sleep,
                  metrics: {
                    ...existing.metrics,
                    steps: incoming.metrics.steps,
                    activeCalories: incoming.metrics.activeCalories,
                    totalCalories: incoming.metrics.totalCalories,
                    exerciseMinutes: Math.max(incoming.metrics.exerciseMinutes, existing.metrics.exerciseMinutes),
                    hrSamples: incoming.metrics.hrSamples,
                    daytimeHrvMs: incoming.metrics.daytimeHrvMs,
                    stressSamples: incoming.metrics.stressSamples,
                    tempDeviationC: incoming.metrics.tempDeviationC,
                    wearMinutes: incoming.metrics.wearMinutes,
                    daylightMinutes: existing.metrics.daylightMinutes,
                    hydrationMl: existing.metrics.hydrationMl,
                    caffeineMg: existing.metrics.caffeineMg,
                    alcoholGrams: existing.metrics.alcoholGrams,
                  },
                  workouts: [
                    ...existing.workouts.filter((w) => !w.imported),
                    ...incoming.workouts,
                  ],
                  meals: existing.meals,
                  journal: existing.journal,
                }
              : incoming;
            if (!order.includes(incoming.date)) order.push(incoming.date);
          }
          order.sort();
          return { days, dayOrder: order };
        }),

      setActivityStatus: (status, untilISO, note) =>
        set((s) => ({
          settings: { ...s.settings, activityStatus: status, activityStatusUntil: untilISO, activityStatusNote: note },
          activityEvents: [
            { id: uid('act-'), status, until: untilISO, at: new Date().toISOString(), note },
            ...s.activityEvents,
          ].slice(0, 50),
        })),

      addMeal: (meal) =>
        set((s) => {
          const { day, dayOrder } = withDayEntry(s as AppStore, meal.date);
          return {
            days: { ...s.days, [meal.date]: { ...day, meals: [...day.meals, meal] } },
            dayOrder,
          };
        }),

      removeMeal: (date, id) =>
        set((s) => {
          const { day, dayOrder } = withDayEntry(s as AppStore, date);
          return {
            days: { ...s.days, [date]: { ...day, meals: day.meals.filter((m) => m.id !== id) } },
            dayOrder,
          };
        }),

      addJournal: (date, tagId, value) =>
        set((s) => {
          const { day, dayOrder } = withDayEntry(s as AppStore, date);
          const existing = day.journal.find((j) => j.tagId === tagId);
          const entry: JournalEntry = existing
            ? { ...existing, value, at: new Date().toISOString() }
            : { id: uid('j-'), tagId, date, value, at: new Date().toISOString() };
          const journal = existing ? day.journal.map((j) => (j.tagId === tagId ? entry : j)) : [...day.journal, entry];
          return {
            days: { ...s.days, [date]: { ...day, journal } },
            dayOrder,
            journalEntries: [...s.journalEntries.filter((j) => !(j.date === date && j.tagId === tagId)), entry],
          };
        }),

      addJournalTag: (label, kind, unit) =>
        set((s) => ({
          journalTags: [
            ...s.journalTags,
            {
              id: uid('custom-'),
              label,
              kind,
              unit,
              pinned: false,
              category: 'custom',
              icon: '✨',
            },
          ],
        })),

      togglePinTag: (tagId) =>
        set((s) => ({
          journalTags: s.journalTags.map((t) => (t.id === tagId ? { ...t, pinned: !t.pinned } : t)),
        })),

      saveHomeLayout: (order) =>
        set((s) => ({
          settings: { ...s.settings, homeOrder: order, homeCards: order },
        })),

      logWorkout: (workout) =>
        set((s) => {
          const { day, dayOrder } = withDayEntry(s as AppStore, workout.date);
          return {
            days: {
              ...s.days,
              [workout.date]: {
                ...day,
                workouts: [...day.workouts, workout],
                metrics: { ...day.metrics, exerciseMinutes: day.metrics.exerciseMinutes + workout.durationMin },
              },
            },
            dayOrder,
          };
        }),

      // A 20-minute nap as the Timeline sheet describes it. When the day
      // already has a sleep session the overnight record covers the balance,
      // so logging again is a no-op rather than a second, competing session.
      logNap: (date) =>
        set((s) => {
          const existing = s.days[date];
          if (existing?.sleep) return s;
          const now = new Date();
          const session: SleepSession = {
            id: uid('nap-'),
            date,
            start: new Date(now.getTime() - 20 * 60000).toISOString(),
            end: now.toISOString(),
            stages: [{ stage: 'core', startMin: 0, endMin: 20 }],
            source: 'Bene',
            hrvMs: null,
            rhrBpm: null,
            respiratoryRate: null,
            spo2: null,
            wristTempC: null,
            minHrBpm: null,
            timeToFallAsleepMin: null,
            alarm: null,
            imported: false,
          };
          return {
            days: { ...s.days, [date]: { ...(existing ?? emptyDay(date)), sleep: session } },
            ...(existing ? null : { dayOrder: [...s.dayOrder.filter((d) => d !== date), date].sort() }),
          };
        }),

      addRoutine: (routine) => set((s) => ({ routines: [...s.routines, routine] })),

      completeRoutineDay: (routineId, date) =>
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id === routineId ? { ...r, completedDates: [...new Set([...r.completedDates, date])] } : r,
          ),
        })),

      toggleTab: (tab) =>
        set((s) => ({ settings: { ...s.settings, activeTabs: { ...s.settings.activeTabs, [tab]: !s.settings.activeTabs[tab] } } })),

      createChatThread: (ghost = false, model) => {
        const id = uid('chat-');
        const now = new Date().toISOString();
        const thread: ChatThread = {
          id,
          title: 'New chat',
          createdAt: now,
          updatedAt: now,
          messages: [],
          ghost,
          pinned: false,
          model: model ?? get().settings.aiModel,
          expiresAt: ghost ? ghostExpiry(new Date(), get().settings.ghostRetentionMin) : undefined,
        };
        set((s) => ({ chats: [thread, ...s.chats] }));
        return id;
      },

      sendChatMessage: (threadId, text, attachmentName) => {
        const state = get();
        const now = new Date();
        const userMsg: ChatMessage = {
          id: uid('msg-'),
          role: 'user',
          text,
          at: now.toISOString(),
          attachmentName,
        };
        let reply: ChatMessage | null = null;
        if (state.settings.aiEnabled) {
          const generated = generateCoachReply(state, `${text} ${attachmentName ?? ''}`, now);
          reply = {
            id: uid('msg-'),
            role: 'assistant',
            text: generated.text,
            at: new Date(now.getTime() + 1000).toISOString(),
            followUps: state.settings.suggestedFollowUps ? generated.followUps : undefined,
            pending: false,
          };
        }
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === threadId
              ? {
                  ...c,
                  title: c.messages.length === 0 ? text.slice(0, 42) : c.title,
                  updatedAt: now.toISOString(),
                  messages: [...c.messages, userMsg, ...(reply ? [reply] : [])],
                  expiresAt: c.ghost ? ghostExpiry(now, s.settings.ghostRetentionMin) : c.expiresAt,
                }
              : c,
          ),
        }));
      },

      deleteChat: (threadId) => set((s) => ({ chats: s.chats.filter((c) => c.id !== threadId) })),
      togglePinChat: (threadId) =>
        set((s) => ({ chats: s.chats.map((c) => (c.id === threadId ? { ...c, pinned: !c.pinned } : c)) })),
      renameChat: (threadId, title) =>
        set((s) => ({ chats: s.chats.map((c) => (c.id === threadId ? { ...c, title } : c)) })),

      uploadRecord: (name, sizeKb, kind) => {
        const id = uid('rec-');
        const record: HealthRecord = {
          id,
          name,
          kind,
          uploadedAt: new Date().toISOString(),
          status: 'ready',
          sizeKb,
          biomarkerCount: 0,
        };
        set((s) => ({ healthRecords: [record, ...s.healthRecords] }));
      },

      removeRecord: (id) => set((s) => ({ healthRecords: s.healthRecords.filter((r) => r.id !== id) })),

      backupNow: () => {
        const result = saveSnapshot(get());
        if (result.ok && result.at) {
          set((s) => ({ settings: { ...s.settings, lastBackupAt: result.at } }));
        }
        return result;
      },

      restoreLatestBackup: () => {
        const parsed = readSnapshot();
        if (!parsed.ok) return { ok: false, error: parsed.error };
        // A restore replaces the data slice under any in-flight health read;
        // bump the generation so the read's late result is discarded, same
        // as clearAll does.
        clearGeneration += 1;
        set((s) => ({
          ...parsed.data,
          settings: { ...s.settings, ...parsed.data.settings, onboarded: true },
        }));
        return finishRestore();
      },

      importBackupJson: (json) => {
        const parsed = parseBackup(json);
        if (!parsed.ok) return { ok: false, error: parsed.error };
        clearGeneration += 1;
        set((s) => ({
          ...parsed.data,
          settings: { ...s.settings, ...parsed.data.settings, onboarded: true },
        }));
        return finishRestore();
      },

      exportBackupJson: () => backupJson(get()),

      clearAll: () => {
        clearGeneration += 1;
        localStorage.removeItem(SNAPSHOT_KEY);
        const now = new Date().toISOString();
        set({
          profile: { ...initial.profile, name: '', birthDate: '', createdAt: now },
          settings: { ...initial.settings, onboarded: false, demoMode: false, lastBackupAt: null },
          days: {},
          dayOrder: [],
          journalTags: [],
          journalEntries: [],
          biomarkers: [],
          healthRecords: [],
          chats: [],
          routines: [],
          activityEvents: [],
          seededAt: now,
        });
      },
    }),
    {
      name: STORE_KEY,
      storage: createJSONStorage(() => safeLocalStorage),
      version: STORE_VERSION,
      migrate: migrateStoreState,
      // A blob that fails to parse or migrate must never be replaced by the
      // seed: block writes, then try the on-device snapshot. Without this,
      // the first set after boot (ensureToday on mount) persists a fresh
      // empty account over the person's data.
      onRehydrateStorage: (seedState) => (_state, error) => {
        // The middleware finishes hydration during store creation, before
        // the module-level store binding exists, so recovery is deferred
        // one tick — still before React renders anything.
        if (error) queueMicrotask(() => recoverFromUnreadableBlob(seedState.settings, error));
      },
      // Settings gained keys over time (nutrition joined activeTabs). A stored
      // snapshot without them would read back `undefined`, which every toggle
      // and switch treats as off — so fill defaults in rather than guess.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<typeof current>;
        return {
          ...current,
          ...saved,
          settings: {
            ...current.settings,
            ...saved.settings,
            activeTabs: { ...current.settings.activeTabs, ...saved.settings?.activeTabs },
          },
        };
      },
      partialize: (state) => {
        const {
          profile,
          settings,
          days,
          dayOrder,
          journalTags,
          journalEntries,
          biomarkers,
          healthRecords,
          chats,
          routines,
          activityEvents,
          seededAt,
        } = state;
        return {
          profile,
          settings,
          days,
          dayOrder,
          journalTags,
          journalEntries,
          biomarkers,
          healthRecords,
          chats,
          routines,
          activityEvents,
          seededAt,
        };
      },
    },
  ),
);
