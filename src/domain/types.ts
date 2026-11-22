/** Core domain types for Bene. All health data stays on-device. */

export type ISODate = string; // yyyy-MM-dd
export type ISODateTime = string; // ISO 8601
export type Sex = 'male' | 'female' | 'unspecified';
export type UnitSystem = 'metric' | 'imperial';
export type ThemeMode = 'system' | 'light' | 'dark' | 'midnight';
export type ActivityStatus = 'active' | 'sick' | 'injured' | 'break';
export type ScoreAvailability = 'scored' | 'calibrating' | 'insufficient';
export type Stage = 'awake' | 'rem' | 'core' | 'deep';
export type WorkoutKind = 'run' | 'strength' | 'cycle' | 'walk' | 'swim' | 'hiit' | 'yoga' | 'hike';

export interface UserProfile {
  name: string;
  sex: Sex;
  birthDate: ISODate;
  heightCm: number;
  weightKg: number;
  goal: 'recovery' | 'performance' | 'sleep' | 'fatloss' | 'general';
  createdAt: ISODateTime;
}

export interface SleepStageBlock {
  stage: Stage;
  startMin: number; // minutes from session start
  endMin: number;
}

export interface SleepSession {
  id: string;
  /** Local date the sleep is attributed to (the morning you wake). */
  date: ISODate;
  start: ISODateTime;
  end: ISODateTime;
  stages: SleepStageBlock[];
  source: string;
  /** Overnight values, measured inside the sleep window. */
  hrvMs: number | null;
  rhrBpm: number | null;
  respiratoryRate: number | null;
  spo2: number | null;
  wristTempC: number | null;
  /** Lowest sleeping heart rate, used for the HR-dip metric. */
  minHrBpm: number | null;
  /** Minutes from alarm arm to first sleep stage; null when no alarm was armed. */
  timeToFallAsleepMin: number | null;
  alarm: AlarmSettings | null;
  imported?: boolean;
}

export interface StageTotals {
  awakeMin: number;
  remMin: number;
  coreMin: number;
  deepMin: number;
  asleepMin: number;
  inBedMin: number;
}

export type AlarmType = 'none' | 'smart' | 'regular' | 'sleepNeed';
export interface AlarmSettings {
  type: AlarmType;
  time: string; // HH:mm
  windowMin: number;
  enabled: boolean;
}

export interface HeartRateSample {
  /** Minutes from local midnight. */
  minute: number;
  bpm: number;
}

export interface StrengthSet {
  id: string;
  reps: number;
  weightKg: number;
  rpe: number;
  type: 'normal' | 'warmup' | 'drop' | 'failure';
  completed: boolean;
}

export interface StrengthExercise {
  id: string;
  name: string;
  muscle: MuscleGroup;
  sets: StrengthSet[];
}

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core';

export interface Workout {
  id: string;
  kind: WorkoutKind;
  name: string;
  date: ISODate;
  start: ISODateTime;
  durationMin: number;
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  strain: number;
  source: string;
  imported: boolean;
  zoneMinutes: [number, number, number, number, number, number];
  exercises?: StrengthExercise[];
  notes?: string;
}

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  serving: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  vegGrams: number;
  fruitCups: number;
  wholeGrainServings: number;
  healthyOilPctOfCalories: number;
  nutsGrams: number;
  omega3Mg: number;
  redMeatGrams: number;
  processedMeatGrams: number;
  alcoholGrams: number;
  sodiumMg: number;
  addedSugarG: number;
  emoji?: string;
}

export interface MealEntry {
  id: string;
  name: string;
  date: ISODate;
  time: string; // HH:mm
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  vegGrams: number;
  fruitCups: number;
  wholeGrainServings: number;
  healthyOilPctOfCalories: number;
  nutsGrams: number;
  omega3Mg: number;
  redMeatGrams: number;
  processedMeatGrams: number;
  alcoholGrams: number;
  sodiumMg: number;
  addedSugarG: number;
  source: 'bene' | 'imported';
  emoji?: string;
  loggedVia?: 'search' | 'barcode' | 'photo' | 'describe' | 'recipe' | 'custom';
}

export interface JournalTag {
  id: string;
  label: string;
  kind: 'yesno' | 'yesneutralno' | 'numeric';
  unit?: string;
  min?: number;
  max?: number;
  pinned: boolean;
  category: 'lifestyle' | 'nutrition' | 'recovery' | 'mind' | 'custom';
  autoOnly?: boolean;
  icon?: string;
}

export type JournalValue = 'yes' | 'neutral' | 'no' | number;
export interface JournalEntry {
  id: string;
  tagId: string;
  date: ISODate;
  value: JournalValue;
  at: ISODateTime;
}

export interface DayMetrics {
  date: ISODate;
  steps: number;
  activeCalories: number;
  totalCalories: number;
  exerciseMinutes: number;
  daylightMinutes: number;
  hydrationMl: number;
  caffeineMg: number;
  alcoholGrams: number;
  hrSamples: HeartRateSample[];
  /** Daytime HRV (stress pipeline) — deliberately separate from overnight HRV. */
  daytimeHrvMs: number | null;
  stressSamples: { minute: number; score: number }[];
  /** Wrist temperature deviation from personal baseline, in °C. */
  tempDeviationC: number | null;
  /** True when movement/HR data is sparse or the app was not worn. */
  wearMinutes: number;
}

export interface DayRecord {
  date: ISODate;
  sleep: SleepSession | null;
  metrics: DayMetrics;
  workouts: Workout[];
  meals: MealEntry[];
  journal: JournalEntry[];
}

export interface Biomarker {
  id: string;
  name: string;
  value: number;
  unit: string;
  optimalLow: number;
  optimalHigh: number;
  category: 'metabolic' | 'inflammation' | 'blood' | 'lipids' | 'vitamins' | 'liver' | 'kidney';
  phenoAge: boolean;
  recordedAt: ISODate;
}

export interface HealthRecord {
  id: string;
  name: string;
  kind: 'bloodwork' | 'document' | 'image';
  uploadedAt: ISODateTime;
  status: 'analyzing' | 'ready' | 'failed';
  sizeKb: number;
  biomarkerCount: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: ISODateTime;
  attachmentName?: string;
  followUps?: string[];
  pending?: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  messages: ChatMessage[];
  ghost: boolean;
  pinned: boolean;
  model: 'standard' | 'upgraded';
  expiresAt?: ISODateTime;
}

export interface RoutineSet {
  id: string;
  reps: number;
  weightKg: number;
  type: 'normal' | 'warmup' | 'drop' | 'failure';
}

export interface RoutineExercise {
  id: string;
  name: string;
  muscle: MuscleGroup;
  sets: RoutineSet[];
  restSec: number;
}

export interface WorkoutBlock {
  id: string;
  kind: 'warmup' | 'repeat' | 'steady' | 'cooldown';
  title: string;
  durationMin: number;
  repeats?: number;
  target: string;
}

export interface Routine {
  id: string;
  name: string;
  subtitle: string;
  kind: WorkoutKind;
  durationMin: number;
  blocks: WorkoutBlock[];
  exercises: RoutineExercise[];
  scheduledDates: ISODate[];
  completedDates: ISODate[];
  skippedDates: ISODate[];
}

export interface AppSettings {
  theme: ThemeMode;
  onboarded: boolean;
  demoMode: boolean;
  activeTabs: { fitness: boolean; journal: boolean; biology: boolean };
  homeCards: string[];
  homeOrder: string[];
  sleepGoalMin: number;
  calorieGoal: number;
  proteinGoalG: number;
  aiPersonality: 'supportive' | 'direct' | 'analytical' | 'playful';
  aiEnabled: boolean;
  ghostDefault: boolean;
  ghostRetentionMin: 30 | 60 | 360 | 1440;
  aiModel: 'standard' | 'upgraded';
  expandedThinking: boolean;
  suggestedFollowUps: boolean;
  excludedContributors: string[];
  nutritionUnits: 'g' | 'percent';
  activityStatus: ActivityStatus;
  activityStatusUntil: ISODateTime | null;
  activityStatusNote: string;
  autoBackup: boolean;
  lastBackupAt: ISODateTime | null;
}

export interface ActivityStatusEvent {
  id: string;
  status: ActivityStatus;
  until: ISODateTime | null;
  at: ISODateTime;
  note: string;
}

export interface Insight {
  id: string;
  title: string;
  body: string;
  tone: 'positive' | 'neutral' | 'warning';
  metric: string;
  minSamples?: number;
}

export interface AppStateData {
  profile: UserProfile;
  settings: AppSettings;
  days: Record<ISODate, DayRecord>;
  dayOrder: ISODate[];
  journalTags: JournalTag[];
  journalEntries: JournalEntry[];
  biomarkers: Biomarker[];
  healthRecords: HealthRecord[];
  chats: ChatThread[];
  routines: Routine[];
  activityEvents: ActivityStatusEvent[];
  seededAt: ISODateTime;
}
