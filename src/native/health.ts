/**
 * The phone's own health store, as a single source.
 *
 * @capgo/capacitor-health reads Apple HealthKit on iOS and Health Connect on
 * Android, so one adapter covers every watch, ring and strap that writes into
 * either. Everything is read on the device and stored in local state; nothing
 * is uploaded.
 *
 * In a browser there is no health store, so every call resolves to
 * `available: false` rather than throwing.
 */
import { Capacitor } from '@capacitor/core';
import { Health, type HealthDataType, type HealthSample, type Workout as HealthWorkout } from '@capgo/capacitor-health';
import type { DayRecord, ISODate, SleepSession, SleepStageBlock, Stage, Workout, WorkoutKind } from '../domain/types';
import { dateKey } from '../domain/seed';

export type HealthPlatform = 'apple-health' | 'health-connect' | 'unavailable';

/** What Bene reads. Nothing is written back to the store. */
export const READ_TYPES: HealthDataType[] = [
  'sleep',
  'heartRateVariability',
  'restingHeartRate',
  'respiratoryRate',
  'oxygenSaturation',
  'bodyTemperature',
  'steps',
  'calories',
  'heartRate',
  'exerciseTime',
  'workouts',
];

export function platform(): HealthPlatform {
  const p = Capacitor.getPlatform();
  if (p === 'ios') return 'apple-health';
  if (p === 'android') return 'health-connect';
  return 'unavailable';
}

export function platformLabel(p: HealthPlatform = platform()): string {
  if (p === 'apple-health') return 'Apple Health';
  if (p === 'health-connect') return 'Health Connect';
  return 'Not available on this device';
}

export interface HealthStatus {
  available: boolean;
  platform: HealthPlatform;
  readAuthorized: HealthDataType[];
  readDenied: HealthDataType[];
}

/** Ask the OS for read access. The permission sheet appears once. */
export async function requestAccess(): Promise<HealthStatus> {
  const p = platform();
  if (p === 'unavailable') {
    return { available: false, platform: p, readAuthorized: [], readDenied: [] };
  }
  const { available } = await Health.isAvailable();
  if (!available) {
    return { available: false, platform: p, readAuthorized: [], readDenied: [] };
  }
  // Android caps reads to ~30 days without history access; iOS ignores the flag.
  const status = await Health.requestAuthorization({
    read: READ_TYPES,
    requestHistoryAccess: true,
  });
  return {
    available: true,
    platform: p,
    readAuthorized: status.readAuthorized,
    readDenied: status.readDenied,
  };
}

/** Check access without prompting, for the settings screen's status row. */
export async function checkAccess(): Promise<HealthStatus> {
  const p = platform();
  if (p === 'unavailable') {
    return { available: false, platform: p, readAuthorized: [], readDenied: [] };
  }
  try {
    const { available } = await Health.isAvailable();
    if (!available) return { available: false, platform: p, readAuthorized: [], readDenied: [] };
    const status = await Health.checkAuthorization({ read: READ_TYPES });
    return {
      available: true,
      platform: p,
      readAuthorized: status.readAuthorized,
      readDenied: status.readDenied,
    };
  } catch {
    return { available: false, platform: p, readAuthorized: [], readDenied: [] };
  }
}

export async function openSettings(): Promise<void> {
  const p = platform();
  if (p === 'health-connect') await Health.openHealthConnectSettings();
  // iOS has no deep link to the per-app health sheet; settings is the closest.
}

/* ------------------------------------------------------------------ */

const STAGE_MAP: Record<string, Stage> = {
  awake: 'awake',
  rem: 'rem',
  deep: 'deep',
  light: 'core',
  core: 'core',
  asleep: 'core',
  inBed: 'core',
};

/** Midnight-anchored minutes, matching Bene's SleepStageBlock coordinates. */
function minutesFrom(iso: string, anchor: Date): number {
  return Math.round((new Date(iso).getTime() - anchor.getTime()) / 60000);
}

/**
 * Fold raw samples into a sleep session.
 *
 * The plugin returns one sample per stage segment where the platform has stage
 * data, and a single inBed/asleep block where it does not. Both shapes are
 * normalised into Bene's blocks; a session with no stage data keeps one
 * `core` block so sleep duration still scores.
 */
export function toSleepSession(samples: HealthSample[], date: ISODate): SleepSession | null {
  const relevant = samples.filter((s) => s.dataType === 'sleep');
  if (!relevant.length) return null;

  // Prefer the most complete block: the longest session that morning.
  const primary = relevant.reduce((a, b) =>
    new Date(b.endDate).getTime() - new Date(b.startDate).getTime() >
    new Date(a.endDate).getTime() - new Date(a.startDate).getTime()
      ? b
      : a,
  );

  const start = new Date(primary.startDate);
  const end = new Date(primary.endDate);
  if (!(end.getTime() > start.getTime())) return null;

  const rawStages = primary.stages ?? [];
  const blocks: SleepStageBlock[] = rawStages
    .map((s) => ({
      stage: STAGE_MAP[s.stage] ?? 'core',
      startMin: minutesFrom(s.startDate, start),
      endMin: minutesFrom(s.endDate, start),
    }))
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  if (!blocks.length) {
    blocks.push({ stage: 'core', startMin: 0, endMin: Math.round((end.getTime() - start.getTime()) / 60000) });
  }

  return {
    id: primary.platformId ?? `hc-${date}`,
    date,
    start: start.toISOString(),
    end: end.toISOString(),
    stages: blocks,
    source: primary.sourceName ?? platformLabel(),
    hrvMs: null,
    rhrBpm: null,
    respiratoryRate: null,
    spo2: null,
    wristTempC: null,
    minHrBpm: null,
    timeToFallAsleepMin: null,
    alarm: null,
    imported: true,
  };
}

/** Mean of the samples that fall inside a window, or null when there are none. */
function meanIn(samples: HealthSample[], type: HealthDataType, from?: string, to?: string): number | null {
  const inWindow = samples.filter(
    (s) =>
      s.dataType === type &&
      (!from || s.startDate >= from) &&
      (!to || s.startDate <= to) &&
      Number.isFinite(s.value),
  );
  if (!inWindow.length) return null;
  return inWindow.reduce((n, s) => n + s.value, 0) / inWindow.length;
}

const WORKOUT_MAP: Record<string, WorkoutKind> = {
  running: 'run',
  walking: 'walk',
  hiking: 'hike',
  cycling: 'cycle',
  swimming: 'swim',
  functionalStrengthTraining: 'strength',
  traditionalStrengthTraining: 'strength',
  highIntensityIntervalTraining: 'hiit',
  yoga: 'yoga',
};

/**
 * Map a platform workout onto Bene's own shape.
 *
 * The health store does not expose per-workout heart rate here, so zone minutes
 * and strain are left to Bene's scoring pass, which derives them from the heart
 * rate samples already read for the day. `imported` marks the row so the UI can
 * say where it came from.
 */
function toWorkout(w: HealthWorkout): Workout {
  const minutes = w.duration
    ? Math.round(w.duration / 60)
    : Math.round((new Date(w.endDate).getTime() - new Date(w.startDate).getTime()) / 60000);
  return {
    id: w.platformId ?? `hc-${w.startDate}`,
    kind: WORKOUT_MAP[String(w.workoutType)] ?? 'other',
    name: String(w.workoutType),
    date: dateKey(new Date(w.startDate)),
    start: w.startDate,
    durationMin: minutes,
    distanceKm: w.totalDistance != null ? Math.round((w.totalDistance / 1000) * 10) / 10 : null,
    avgHr: null,
    maxHr: null,
    calories: w.totalEnergyBurned != null ? Math.round(w.totalEnergyBurned) : null,
    strain: 0,
    source: w.sourceName ?? platformLabel(),
    imported: true,
    zoneMinutes: [0, 0, 0, 0, 0, 0],
  };
}


/**
 * Read the last `days` days from the health store and return one DayRecord per
 * date that has anything in it. Days with nothing are omitted so the caller
 * never overwrites a hand-logged day with emptiness.
 */
export async function readDays(days = 30): Promise<DayRecord[]> {
  const p = platform();
  if (p === 'unavailable') return [];

  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end.getTime() - days * 86400000);
  const range = { startDate: start.toISOString(), endDate: end.toISOString() };

  const [sleep, hrv, rhr, resp, spo2, temp, steps, cals, hr, exercise, workouts] = await Promise.all([
    Health.readSamples({ dataType: 'sleep', ...range, limit: 500, ascending: true }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'heartRateVariability', ...range, limit: 2000 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'restingHeartRate', ...range, limit: 500 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'respiratoryRate', ...range, limit: 500 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'oxygenSaturation', ...range, limit: 500 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'bodyTemperature', ...range, limit: 500 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'steps', ...range, limit: 2000 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'calories', ...range, limit: 2000 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'heartRate', ...range, limit: 4000 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'exerciseTime', ...range, limit: 500 }).catch(() => ({ samples: [] })),
    Health.queryWorkouts({ ...range, limit: 200, ascending: true }).catch(() => ({ workouts: [] })),
  ]);

  const byDate = new Map<string, DayRecord>();
  const dayFor = (date: ISODate): DayRecord => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const fresh: DayRecord = {
      date,
      sleep: null,
      metrics: {
        date,
        steps: 0,
        activeCalories: 0,
        totalCalories: 0,
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
    };
    byDate.set(date, fresh);
    return fresh;
  };

  // Sleep is attributed to the morning it ends on.
  const sleepByDate = new Map<string, HealthSample[]>();
  for (const s of sleep.samples) {
    const d = dateKey(new Date(s.endDate));
    sleepByDate.set(d, [...(sleepByDate.get(d) ?? []), s]);
  }
  for (const [date, samples] of sleepByDate) {
    const session = toSleepSession(samples, date);
    if (!session) continue;
    const day = dayFor(date);
    const from = session.start;
    const to = session.end;
    session.hrvMs = meanIn(hrv.samples, 'heartRateVariability', from, to);
    session.rhrBpm = meanIn(rhr.samples, 'restingHeartRate', from, to);
    session.respiratoryRate = meanIn(resp.samples, 'respiratoryRate', from, to);
    session.spo2 = meanIn(spo2.samples, 'oxygenSaturation', from, to);
    const t = meanIn(temp.samples, 'bodyTemperature', from, to);
    // Health stores report absolute temperature; Bene wants the deviation, which
    // it computes against its own baseline, so keep the reading only if it is
    // already a delta-sized value.
    session.wristTempC = t != null && Math.abs(t) < 5 ? t : null;
    session.minHrBpm = (() => {
      const inSleep = hr.samples.filter((s) => s.dataType === 'heartRate' && s.startDate >= from && s.startDate <= to);
      return inSleep.length ? Math.round(Math.min(...inSleep.map((s) => s.value))) : null;
    })();
    day.sleep = session;
  }

  const sumFor = (samples: HealthSample[], type: HealthDataType, date: ISODate): number =>
    samples
      .filter((s) => s.dataType === type && dateKey(new Date(s.startDate)) === date)
      .reduce((n, s) => n + s.value, 0);

  const dates = new Set<string>([
    ...sleep.samples.map((s) => dateKey(new Date(s.endDate))),
    ...steps.samples.map((s) => dateKey(new Date(s.startDate))),
    ...workouts.workouts.map((w) => dateKey(new Date(w.startDate))),
  ]);

  for (const date of dates) {
    const day = dayFor(date);
    day.metrics.steps = Math.round(sumFor(steps.samples, 'steps', date));
    day.metrics.totalCalories = Math.round(sumFor(cals.samples, 'calories', date));
    day.metrics.exerciseMinutes = Math.round(sumFor(exercise.samples, 'exerciseTime', date));
    day.metrics.hrSamples = hr.samples
      .filter((s) => s.dataType === 'heartRate' && dateKey(new Date(s.startDate)) === date)
      .map((s) => {
        const d = new Date(s.startDate);
        return { minute: d.getHours() * 60 + d.getMinutes(), bpm: Math.round(s.value) };
      });
    day.metrics.daytimeHrvMs = meanIn(
      hrv.samples.filter((s) => dateKey(new Date(s.startDate)) === date),
      'heartRateVariability',
    );
    // Worn time is approximated from heart-rate coverage: a phone in a pocket
    // reports nothing, a watch reports continuously.
    const hrMinutes = new Set(
      hr.samples
        .filter((s) => dateKey(new Date(s.startDate)) === date)
        .map((s) => Math.floor(new Date(s.startDate).getTime() / 60000)),
    ).size;
    day.metrics.wearMinutes = hrMinutes;
    day.workouts = workouts.workouts
      .filter((w) => dateKey(new Date(w.startDate)) === date)
      .map(toWorkout);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
