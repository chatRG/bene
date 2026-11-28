import type { AppStateData } from './types';

export const BACKUP_APP = 'bene';
/**
 * On-disk contract: stamped into every backup file and the on-device snapshot.
 * Files with an older version are accepted and must be normalised inside
 * parseBackup — RETIRED_SETTING_KEYS is the working example; files from a
 * newer build are rejected loudly. Bump only together with that normalisation.
 */
export const BACKUP_VERSION = 1;
export const SNAPSHOT_KEY = 'bene-snapshot';

export type BackupPayload = Omit<AppStateData, never>;

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  data: BackupPayload;
}

/** Everything needed to restore the app, in one plain-JSON document. */
export function createBackup(state: AppStateData): BackupFile {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      profile: state.profile,
      settings: state.settings,
      days: state.days,
      dayOrder: state.dayOrder,
      journalTags: state.journalTags,
      journalEntries: state.journalEntries,
      biomarkers: state.biomarkers,
      healthRecords: state.healthRecords,
      chats: state.chats,
      routines: state.routines,
      activityEvents: state.activityEvents,
      seededAt: state.seededAt,
    },
  };
}

export function backupJson(state: AppStateData): string {
  return JSON.stringify(createBackup(state), null, 2);
}

export type ParseResult =
  | { ok: true; data: BackupPayload; exportedAt: string }
  | { ok: false; error: string };

const DAY_FIELDS = ['sleep', 'metrics', 'workouts', 'meals', 'journal'] as const;

/** Settings that older backups stored but the app no longer reads. */
const RETIRED_SETTING_KEYS = [
  'hrvMethod',
  'hrvWindow',
  'rhrWindow',
  'tempMethod',
  'hrZoneMethod',
  'manualMaxHr',
  'lactateThresholdHr',
] as const;

/** Metric counters that must be plain finite numbers. */
const NUMERIC_METRIC_FIELDS = [
  'steps',
  'activeCalories',
  'exerciseMinutes',
  'daylightMinutes',
  'hydrationMl',
  'caffeineMg',
  'alcoholGrams',
  'wearMinutes',
] as const;

/** Metric counters that are a number or null (never measured that day). */
const NULLABLE_METRIC_FIELDS = ['totalCalories', 'daytimeHrvMs', 'tempDeviationC'] as const;

/** Meal fields screens read directly when they render a log. */
const NUMERIC_MEAL_FIELDS = ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG'] as const;

/** Workout readings the store types as `number | null`. */
const NULLABLE_NUMBER_WORKOUT_FIELDS = ['distanceKm', 'avgHr', 'maxHr', 'calories'] as const;

function isNullableNumber(value: unknown): boolean {
  return value === null || isNumber(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isHeartRateSample(value: unknown): boolean {
  return isRecord(value) && isNumber(value.minute) && isNumber(value.bpm);
}

function isStressSample(value: unknown): boolean {
  return isRecord(value) && isNumber(value.minute) && isNumber(value.score);
}

function isStageBlock(value: unknown): boolean {
  return isRecord(value) && typeof value.stage === 'string' && isNumber(value.startMin) && isNumber(value.endMin);
}

function isSleepSession(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.date === 'string' &&
    typeof value.start === 'string' &&
    typeof value.end === 'string' &&
    typeof value.source === 'string' &&
    Array.isArray(value.stages) &&
    value.stages.every(isStageBlock)
  );
}

function isWorkoutEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || typeof value.kind !== 'string') return false;
  if (typeof value.date !== 'string' || typeof value.start !== 'string') return false;
  if (!isNumber(value.durationMin)) return false;
  // Six zone buckets, every one a number — scoring indexes into them.
  if (!Array.isArray(value.zoneMinutes) || value.zoneMinutes.length !== 6 || !value.zoneMinutes.every(isNumber)) {
    return false;
  }
  // The optional readings are `number | null` in the store: TimelineScreen
  // calls methods on the numbers, so a string that slipped through here
  // would throw after the restore. Valid nulls and numbers both stay.
  return NULLABLE_NUMBER_WORKOUT_FIELDS.every((field) => isNullableNumber(value[field]));
}

function isMealEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return false;
  if (typeof value.date !== 'string' || typeof value.time !== 'string') return false;
  if (value.source !== 'bene' && value.source !== 'imported') return false;
  return NUMERIC_MEAL_FIELDS.every((field) => isNumber(value[field]));
}

function isJournalEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || typeof value.tagId !== 'string') return false;
  if (typeof value.date !== 'string' || typeof value.at !== 'string') return false;
  return value.value === 'yes' || value.value === 'neutral' || value.value === 'no' || isNumber(value.value);
}

const damaged = (date: string, what: string) => `Backup has damaged ${what} on ${date}.`;

/**
 * A day is usable only when every slice the app reads is present and shaped
 * the way the store expects — down to the entries inside each slice. A
 * backup whose workout is missing zoneMinutes, or whose metrics.steps is a
 * string, used to pass validation and brick every screen after the restore.
 *
 * A day present in `days` but missing from `dayOrder` is normalized in rather
 * than rejected: older builds could create a day on an unseen date without
 * adding it to dayOrder, and exportBackupJson writes the whole days map, so a
 * version-1 backup can legitimately hold such a day. Rejecting the file would
 * leave a restorable backup unrestored.
 *
 * Returns null when the day is usable, otherwise an error naming the day.
 */
function dayRecordError(date: string, value: unknown): string | null {
  if (!isRecord(value)) return damaged(date, 'data');
  if (!DAY_FIELDS.every((field) => hasOwn(value, field))) return damaged(date, 'incomplete');
  if (value.sleep !== null && !isSleepSession(value.sleep)) return damaged(date, 'sleep');
  const metrics = value.metrics;
  if (!isRecord(metrics)) return damaged(date, 'metrics');
  if (typeof metrics.date !== 'string') return damaged(date, 'metrics');
  if (!NUMERIC_METRIC_FIELDS.every((field) => isNumber(metrics[field]))) return damaged(date, 'metrics');
  if (!NULLABLE_METRIC_FIELDS.every((field) => metrics[field] === null || isNumber(metrics[field]))) {
    return damaged(date, 'metrics');
  }
  if (!Array.isArray(metrics.hrSamples) || !metrics.hrSamples.every(isHeartRateSample)) return damaged(date, 'metrics');
  if (!Array.isArray(metrics.stressSamples) || !metrics.stressSamples.every(isStressSample)) {
    return damaged(date, 'metrics');
  }
  if (!Array.isArray(value.workouts) || !value.workouts.every(isWorkoutEntry)) return damaged(date, 'workouts');
  if (value.naps !== undefined && (!Array.isArray(value.naps) || !value.naps.every(isSleepSession))) {
    return damaged(date, 'naps');
  }
  if (!Array.isArray(value.meals) || !value.meals.every(isMealEntry)) return damaged(date, 'meals');
  if (!Array.isArray(value.journal) || !value.journal.every(isJournalEntry)) return damaged(date, 'journal');
  return null;
}

export function parseBackup(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That file isn’t valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Backup file is empty or unreadable.' };
  const obj = parsed as Partial<BackupFile> & { data?: unknown };
  if (obj.app !== BACKUP_APP) {
    return { ok: false, error: 'This isn’t a Bene backup.' };
  }
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was created by a newer version of the app.' };
  }
  const data = obj.data as BackupPayload | undefined;
  if (!isRecord(data) || !isRecord(data.profile) || !isRecord(data.days) || !Array.isArray(data.dayOrder)) {
    return { ok: false, error: 'Backup is missing required health data.' };
  }
  if (data.dayOrder.length === 0 || Object.keys(data.days).length === 0) {
    return { ok: false, error: 'Backup contains no days of data.' };
  }
  const days = data.days as Record<string, unknown>;
  // Normalize before validating: a version-1 backup can contain days its
  // dayOrder never names (older writers created the day without listing it).
  // Every day key joins the list, the list is sorted like the store keeps it,
  // and the normalized list is written back so the restored state keeps the
  // day. A listed day that is missing from days stays an error.
  const dayOrder = new Set<string>(data.dayOrder as string[]);
  let addedUnlisted = false;
  for (const date of Object.keys(days)) {
    if (!dayOrder.has(date)) {
      dayOrder.add(date);
      addedUnlisted = true;
    }
  }
  if (addedUnlisted) {
    data.dayOrder = [...dayOrder].sort();
  }
  const listed = new Set<string>();
  for (const date of data.dayOrder) {
    if (typeof date !== 'string' || !hasOwn(days, date)) {
      return { ok: false, error: `Backup lists a day it does not contain (${String(date)}).` };
    }
    const dayError = dayRecordError(date, days[date]);
    if (dayError) return { ok: false, error: dayError };
    listed.add(date);
  }
  // Calculation methods are fixed now, not user settings. Older backups still
  // carry them; drop them so the restored state matches today's shape.
  const settings: Record<string, unknown> = isRecord(data.settings) ? { ...data.settings } : {};
  for (const key of RETIRED_SETTING_KEYS) delete settings[key];
  // Older backups predate incremental health sync. Never retain the live
  // account's newer cursor when one of those backups is restored, and reject
  // impossible future timestamps that would suppress the backlog read.
  const cursor = settings.lastHealthSyncAt;
  const cursorMs = typeof cursor === 'string' ? Date.parse(cursor) : Number.NaN;
  settings.lastHealthSyncAt = Number.isFinite(cursorMs) && cursorMs <= Date.now() + 5 * 60000 ? cursor : null;
  const attempt = settings.lastHealthAttemptAt;
  const attemptMs = typeof attempt === 'string' ? Date.parse(attempt) : Number.NaN;
  settings.lastHealthAttemptAt = Number.isFinite(attemptMs) && attemptMs <= Date.now() + 5 * 60000 ? attempt : null;
  return { ok: true, data: { ...data, settings: settings as unknown as BackupPayload['settings'] }, exportedAt: obj.exportedAt ?? new Date().toISOString() };
}

export interface SnapshotResult {
  ok: boolean;
  /** Timestamp written to the snapshot, or null when nothing was saved. */
  at: string | null;
}

/**
 * Writes the on-device undo copy. Reports failure instead of pretending a
 * full quota still produced a backup — the caller must not advance
 * `lastBackupAt` unless `ok` is true.
 */
export function saveSnapshot(state: AppStateData): SnapshotResult {
  const at = new Date().toISOString();
  try {
    const file = createBackup(state);
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...file, exportedAt: at }));
    return { ok: true, at };
  } catch {
    // Quota errors, disabled storage and serialisation failures all land here.
    return { ok: false, at: null };
  }
}

export function readSnapshot(): ParseResult {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return { ok: false, error: 'No on-device backup yet.' };
  return parseBackup(raw);
}

export function snapshotInfo(): { exists: boolean; exportedAt: string | null; sizeKb: number } {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return { exists: false, exportedAt: null, sizeKb: 0 };
  try {
    const parsed = JSON.parse(raw) as BackupFile;
    return { exists: true, exportedAt: parsed.exportedAt ?? null, sizeKb: Math.round(raw.length / 1024) };
  } catch {
    return { exists: true, exportedAt: null, sizeKb: Math.round(raw.length / 1024) };
  }
}
