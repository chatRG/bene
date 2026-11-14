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
  NotificationSettings,
  Routine,
  UserProfile,
  Workout,
} from '../domain/types';
import { buildSeed, emptyDay } from '../domain/seed';
import { dateOf } from '../domain/derive';
import { generateCoachReply, ghostExpiry } from '../domain/coach';
import { backupJson, parseBackup, readSnapshot, saveSnapshot } from '../domain/backup';

interface AppActions {
  updateSettings: (patch: Partial<AppSettings>) => void;
  updateNotifications: (patch: Partial<NotificationSettings>) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  completeOnboarding: (name: string, opts?: { sex?: UserProfile['sex']; birthDate?: string; goal?: UserProfile['goal']; demo?: boolean }) => void;
  ensureToday: () => void;
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
  toggleTab: (tab: 'fitness' | 'journal' | 'biology') => void;
  createChatThread: (ghost?: boolean, model?: ChatThread['model']) => string;
  sendChatMessage: (threadId: string, text: string, attachmentName?: string) => void;
  deleteChat: (threadId: string) => void;
  togglePinChat: (threadId: string) => void;
  renameChat: (threadId: string, title: string) => void;
  uploadRecord: (name: string, sizeKb: number, kind: HealthRecord['kind']) => void;
  removeRecord: (id: string) => void;
  spendCredits: (n: number) => void;
  buyCredits: (pack: 350 | 700 | 1400 | 3500) => void;
  setPro: (pro: boolean) => void;
  backupNow: () => string;
  restoreLatestBackup: () => { ok: boolean; error?: string };
  importBackupJson: (json: string) => { ok: boolean; error?: string };
  exportBackupJson: () => string;
  resetDemo: () => void;
}

export type AppStore = AppStateData & AppActions;

const initial = buildSeed(new Date());

const seedSleepFor = (date: string): DayRecord | undefined => initial.days[date];

function withDay(state: AppStore, date: string): DayRecord {
  return state.days[date] ?? seedSleepFor(date) ?? emptyDay(date);
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      ...initial,

      updateSettings: (patch) =>
        set((s) => {
          const next = { ...s.settings, ...patch };
          return {
            settings: next,
            profile: patch.units ? { ...s.profile, units: patch.units } : s.profile,
          };
        }),

      updateNotifications: (patch) =>
        set((s) => ({ settings: { ...s.settings, notifications: { ...s.settings.notifications, ...patch } } })),

      updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),

      completeOnboarding: (name, opts) =>
        set((s) => {
          const onboardedSettings = { ...s.settings, onboarded: true, demoMode: opts?.demo ?? s.settings.demoMode };
          const profile = {
            ...s.profile,
            name: name.trim() || s.profile.name,
            sex: opts?.sex ?? s.profile.sex,
            birthDate: opts?.birthDate ?? s.profile.birthDate,
            goal: opts?.goal ?? s.profile.goal,
          };
          if (opts?.demo === false) {
            const today = dateOf(new Date());
            const resets = new Date();
            resets.setDate(resets.getDate() + 3);
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
              credits: { weeklyAllowance: 700, weeklyUsed: 0, purchased: 0, resetsAt: resets.toISOString() },
              activityEvents: [],
              seededAt: new Date().toISOString(),
            };
          }
          return { profile, settings: onboardedSettings, seededAt: new Date().toISOString() };
        }),

      ensureToday: () => {
        const today = dateOf(new Date());
        set((s) => {
          if (s.days[today]) return s;
          const seed = buildSeed(new Date());
          return {
            days: { ...s.days, [today]: seed.days[today] ?? emptyDay(today) },
            dayOrder: [...s.dayOrder.filter((d) => d !== today), today],
          };
        });
      },

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
          credits: 1,
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
            credits: generated.credits,
            followUps: state.settings.suggestedFollowUps ? generated.followUps : undefined,
            pending: true,
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
          credits: {
            ...s.credits,
            weeklyUsed: Math.min(s.credits.weeklyAllowance, s.credits.weeklyUsed + 1 + (reply?.credits ?? 0)),
          },
        }));
        if (reply) {
          window.setTimeout(() => {
            set((s) => ({
              chats: s.chats.map((c) =>
                c.id === threadId
                  ? {
                      ...c,
                      messages: c.messages.map((m) => (m.id === reply!.id ? { ...m, pending: false } : m)),
                    }
                  : c,
              ),
            }));
          }, 900);
        }
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
          status: 'analyzing',
          sizeKb,
          biomarkerCount: 0,
        };
        set((s) => ({ healthRecords: [record, ...s.healthRecords] }));
        window.setTimeout(() => {
          set((s) => ({
            healthRecords: s.healthRecords.map((r) =>
              r.id === id ? { ...r, status: 'ready', biomarkerCount: 9 } : r,
            ),
          }));
        }, 2600);
      },

      removeRecord: (id) => set((s) => ({ healthRecords: s.healthRecords.filter((r) => r.id !== id) })),

      spendCredits: (n) => set((s) => ({ credits: { ...s.credits, weeklyUsed: Math.min(s.credits.weeklyAllowance, s.credits.weeklyUsed + n) } })),

      buyCredits: (pack) =>
        set((s) => ({
          credits: { ...s.credits, purchased: s.credits.purchased + pack },
          settings: { ...s.settings, pro: true },
        })),

      setPro: (pro) => set((s) => ({ settings: { ...s.settings, pro } })),

      backupNow: () => {
        const at = saveSnapshot(get());
        set((s) => ({ settings: { ...s.settings, lastBackupAt: at } }));
        return at;
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
        saveSnapshot(get());
        return { ok: true };
      },

      exportBackupJson: () => backupJson(get()),

      resetDemo: () => {
        const fresh = buildSeed(new Date());
        fresh.settings.onboarded = get().settings.onboarded;
        set({ ...fresh });
      },
    }),
    {
      name: 'bevel-community-v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
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
          credits,
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
          credits,
          activityEvents,
          seededAt,
        };
      },
    },
  ),
);
