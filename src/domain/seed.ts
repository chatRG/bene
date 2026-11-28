import type { AppSettings, AppStateData, DayRecord, JournalTag, UserProfile } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const defaultJournalTags: JournalTag[] = [
  { id: 'alcohol', label: 'Alcohol', kind: 'yesno', pinned: true, category: 'lifestyle', icon: '🍷' },
  { id: 'caffeine', label: 'Caffeine after 2pm', kind: 'yesno', pinned: true, category: 'lifestyle', icon: '☕' },
  { id: 'mood', label: 'Mood', kind: 'yesneutralno', pinned: true, category: 'mind', icon: '🙂' },
  { id: 'stretch', label: 'Stretching', kind: 'yesno', pinned: true, category: 'recovery', icon: '🧘' },
  { id: 'hydrated', label: 'Hydration', kind: 'numeric', unit: 'L', min: 0, max: 5, pinned: false, category: 'nutrition', icon: '💧' },
  { id: 'screen', label: 'Screen time', kind: 'numeric', unit: 'h', min: 0, max: 12, pinned: false, category: 'lifestyle', icon: '📱' },
  { id: 'vitamins', label: 'Vitamins', kind: 'yesno', pinned: false, category: 'nutrition', icon: '💊' },
  { id: 'lateMeal', label: 'Late meal', kind: 'yesno', pinned: false, category: 'nutrition', icon: '🌙' },
  { id: 'sauna', label: 'Sauna', kind: 'yesno', pinned: false, category: 'recovery', icon: '🔥' },
  { id: 'reading', label: 'Reading before bed', kind: 'yesno', pinned: false, category: 'mind', icon: '📖' },
  { id: 'daylight', label: 'Daylight', kind: 'yesno', pinned: false, category: 'lifestyle', icon: '☀️' },
  { id: 'sleepNoise', label: 'Sleeping noise', kind: 'numeric', unit: 'dB', min: 0, max: 100, pinned: false, category: 'recovery', autoOnly: true, icon: '🔊' },
  { id: 'energy', label: 'Energy', kind: 'numeric', unit: '/10', min: 1, max: 10, pinned: false, category: 'mind', icon: '⚡' },
  { id: 'stress', label: 'Stress', kind: 'numeric', unit: '/10', min: 1, max: 10, pinned: false, category: 'mind', icon: '😮‍💨' },
  { id: 'coldplunge', label: 'Cold plunge', kind: 'yesno', pinned: false, category: 'custom', icon: '🧊' },
];

/**
 * The starting state for a new install. Everything the person has not logged
 * yet is empty; only defaults that describe the app itself (settings, the
 * starter journal tags) are filled in.
 */
export function buildSeed(now = new Date()): AppStateData {
  const seededAt = now.toISOString();

  const settings: AppSettings = {
    theme: 'system',
    onboarded: false,
    demoMode: false,
    activeTabs: { fitness: true, journal: true, biology: true, nutrition: true },
    homeCards: ['scores', 'coach', 'stress', 'sleep', 'timeline', 'nutrition', 'journal'],
    homeOrder: ['scores', 'coach', 'stress', 'sleep', 'timeline', 'nutrition', 'journal'],
    sleepGoalMin: 552,
    calorieGoal: 2504,
    proteinGoalG: 180,
    carbGoalG: 240,
    fatGoalG: 70,
    aiPersonality: 'supportive',
    aiEnabled: true,
    ghostDefault: false,
    ghostRetentionMin: 60,
    aiModel: 'standard',
    expandedThinking: false,
    suggestedFollowUps: true,
    excludedContributors: [],
    nutritionUnits: 'percent',
    activityStatus: 'active',
    activityStatusUntil: null,
    activityStatusNote: '',
    autoBackup: true,
    lastBackupAt: null,
    lastHealthSyncAt: null,
    lastHealthAttemptAt: null,
  };

  const profile: UserProfile = {
    name: '',
    birthDate: '',
    heightCm: 0,
    weightKg: 0,
    sex: 'unspecified',
    goal: 'general',
    createdAt: seededAt,
  };

  return {
    profile,
    settings,
    days: {},
    dayOrder: [],
    journalTags: defaultJournalTags.map((tag) => ({ ...tag })),
    journalEntries: [],
    biomarkers: [],
    healthRecords: [],
    chats: [],
    routines: [],
    activityEvents: [],
    seededAt,
  };
}

export function emptyDay(date: string): DayRecord {
  return {
    date,
    sleep: null,
    metrics: {
      date,
      steps: 0,
      activeCalories: 0,
      totalCalories: null,
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
    },
    workouts: [],
    meals: [],
    journal: [],
    naps: [],
  };
}
