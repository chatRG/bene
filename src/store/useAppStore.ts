import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
  UserProfile,
  Workout,
} from '../domain/types';
import { buildSeed, emptyDay } from '../domain/seed';
import { dateOf } from '../domain/derive';
import { generateCoachReply, ghostExpiry } from '../domain/coach';
import { SNAPSHOT_KEY, backupJson, parseBackup, readSnapshot, saveSnapshot } from '../domain/backup';

export const STORE_KEY = 'bene-v1';

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

function withDay(state: AppStore, date: string): DayRecord {
  return state.days[date] ?? emptyDay(date);
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
          // A new account starts empty: one blank day for today and nothing else.
          const today = dateOf(new Date());
          return {
            profile,
            settings: onboardedSettings,
            days: { [today]: emptyDay(today) },
            dayOrder: [today],
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

      // Merge a batch read from the phone's health store. Imported days replace
      // the health fields but keep anything logged by hand: a meal, a journal
      // entry or a workout the person added themselves is never overwritten by
      // a sync.
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
                  metrics: incoming.metrics.steps || incoming.metrics.hrSamples.length
                    ? incoming.metrics
                    : existing.metrics,
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
            { id: `act-${Date.now()}`, status, until: untilISO, at: new Date().toISOString(), note },
            ...s.activityEvents,
          ].slice(0, 50),
        })),

      addMeal: (meal) =>
        set((s) => {
          const day = withDay(s as AppStore, meal.date);
          return {
            days: { ...s.days, [meal.date]: { ...day, meals: [...day.meals, meal] } },
          };
        }),

      removeMeal: (date, id) =>
        set((s) => {
          const day = withDay(s as AppStore, date);
          return { days: { ...s.days, [date]: { ...day, meals: day.meals.filter((m) => m.id !== id) } } };
        }),

      addJournal: (date, tagId, value) =>
        set((s) => {
          const day = withDay(s as AppStore, date);
          const existing = day.journal.find((j) => j.tagId === tagId);
          const entry: JournalEntry = existing
            ? { ...existing, value, at: new Date().toISOString() }
            : { id: `j-${Date.now()}-${tagId}`, tagId, date, value, at: new Date().toISOString() };
          const journal = existing ? day.journal.map((j) => (j.tagId === tagId ? entry : j)) : [...day.journal, entry];
          return {
            days: { ...s.days, [date]: { ...day, journal } },
            journalEntries: [...s.journalEntries.filter((j) => !(j.date === date && j.tagId === tagId)), entry],
          };
        }),

      addJournalTag: (label, kind, unit) =>
        set((s) => ({
          journalTags: [
            ...s.journalTags,
            {
              id: `custom-${Date.now()}`,
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
          const day = withDay(s as AppStore, workout.date);
          return {
            days: {
              ...s.days,
              [workout.date]: {
                ...day,
                workouts: [...day.workouts, workout],
                metrics: { ...day.metrics, exerciseMinutes: day.metrics.exerciseMinutes + workout.durationMin },
              },
            },
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
        const id = `chat-${Date.now()}`;
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
          id: `msg-${Date.now()}`,
          role: 'user',
          text,
          at: now.toISOString(),
          attachmentName,
        };
        let reply: ChatMessage | null = null;
        if (state.settings.aiEnabled) {
          const generated = generateCoachReply(state, `${text} ${attachmentName ?? ''}`, now);
          reply = {
            id: `msg-${Date.now()}-a`,
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
        const id = `rec-${Date.now()}`;
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
        set((s) => ({
          ...parsed.data,
          settings: { ...s.settings, ...parsed.data.settings, onboarded: true, lastBackupAt: new Date().toISOString() },
        }));
        return { ok: true };
      },

      importBackupJson: (json) => {
        const parsed = parseBackup(json);
        if (!parsed.ok) return { ok: false, error: parsed.error };
        set((s) => ({
          ...parsed.data,
          settings: { ...s.settings, ...parsed.data.settings, onboarded: true },
        }));
        return { ok: true };
      },

      exportBackupJson: () => backupJson(get()),

      clearAll: () => {
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
      storage: createJSONStorage(() => localStorage),
      version: 1,
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
