import type { AppStateData } from './types';

export const BACKUP_APP = 'bene';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * A day is usable only when every slice the app reads is present and shaped
 * the way the store expects. A day missing `workouts`, for example, crashes
 * every screen that maps over it.
 */
function isDayRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!DAY_FIELDS.every((field) => hasOwn(value, field))) return false;
  if (value.sleep !== null && !isRecord(value.sleep)) return false;
  return (
    isRecord(value.metrics) &&
    Array.isArray(value.workouts) &&
    Array.isArray(value.meals) &&
    Array.isArray(value.journal)
  );
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
  for (const date of data.dayOrder) {
    if (typeof date !== 'string' || !hasOwn(days, date)) {
      return { ok: false, error: `Backup lists a day it does not contain (${String(date)}).` };
    }
    if (!isDayRecord(days[date])) {
      return { ok: false, error: `Backup has an incomplete day of data (${date}).` };
    }
  }
  // Calculation methods are fixed now, not user settings. Older backups still
  // carry them; drop them so the restored state matches today's shape.
  const settings = isRecord(data.settings) ? { ...data.settings } : data.settings;
  if (isRecord(settings)) for (const key of RETIRED_SETTING_KEYS) delete settings[key];
  return { ok: true, data: { ...data, settings: settings as BackupPayload['settings'] }, exportedAt: obj.exportedAt ?? new Date().toISOString() };
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
