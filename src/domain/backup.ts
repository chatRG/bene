import type { AppStateData } from './types';

export const BACKUP_APP = 'bevel-community';
export const BACKUP_VERSION = 1;
export const SNAPSHOT_KEY = 'bevel-community-snapshot';

export type BackupPayload = Omit<AppStateData, never>;

export interface BackupFile {
  app: typeof BACKUP_APP;
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
      credits: state.credits,
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

export function parseBackup(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That file isn’t valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Backup file is empty or unreadable.' };
  const obj = parsed as Partial<BackupFile> & { data?: unknown };
  if (obj.app !== BACKUP_APP) return { ok: false, error: 'This isn’t a Bevel Community backup.' };
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was created by a newer version of the app.' };
  }
  const data = obj.data as BackupPayload | undefined;
  if (!data || typeof data !== 'object' || !data.profile || !data.days || !Array.isArray(data.dayOrder)) {
    return { ok: false, error: 'Backup is missing required health data.' };
  }
  if (typeof data.days !== 'object' || data.dayOrder.length === 0) {
    return { ok: false, error: 'Backup contains no days of data.' };
  }
  return { ok: true, data, exportedAt: obj.exportedAt ?? new Date().toISOString() };
}

export function saveSnapshot(state: AppStateData): string {
  const file = createBackup(state);
  const at = new Date().toISOString();
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...file, exportedAt: at }));
  } catch {
    // Storage can be full; the downloadable file is the source of truth.
  }
  return at;
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
