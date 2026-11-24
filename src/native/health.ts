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
import {
  Health,
  type AggregatedSample,
  type HealthDataType,
  type HealthSample,
  type Workout as HealthWorkout,
} from '@capgo/capacitor-health';
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

/**
 * The types to ask the store about, trimmed to the current platform.
 *
 * 'exerciseTime' is a HealthKit type — Apple's exercise minutes — and the
 * plugin has no Health Connect record for it. Passing it to Health Connect's
 * permission calls makes the whole list reject with "Unsupported data type",
 * which Bene then reports as "no health store" on every Android phone,
 * including ones where the store works fine.
 *
 * 'distance' and 'totalCalories' are the other side of that: permissions the
 * Android ask must name or the data silently stays empty. A workout read only
 * carries a distance when the separate distance scope is granted, and total
 * burn is its own record — without it, the only calories Health Connect hands
 * back are active ones, which must never be relabelled as a day's total burn.
 */
export function readTypes(): HealthDataType[] {
  if (platform() !== 'health-connect') return READ_TYPES;
  return READ_TYPES.filter((t) => t !== 'exerciseTime').concat('distance', 'totalCalories');
}

export interface HealthStatus {
  available: boolean;
  platform: HealthPlatform;
  readAuthorized: HealthDataType[];
  readDenied: HealthDataType[];
  /**
   * Why the store is unavailable, as the OS reports it. Health Connect
   * distinguishes "not installed" from "installed but needs an update", and
   * those need different advice, so the distinction is carried out to the UI
   * rather than flattened into one message.
   */
  reason?: string;
}

/**
 * Why the store said no, when it says no.
 *
 * With the pinned plugin the availability probe and the gate are the same
 * thing: every store call checks the SDK status that isAvailable() reports,
 * and refuses with that reason before a client is ever built. There is no
 * device where the probe says unavailable and the store then answers anyway —
 * the status probe is the truth about whether the store can be reached.
 *
 * The call is still attempted first and the probe consulted afterwards, only
 * to explain a failure: that keeps the failure path driven by what the store
 * actually returned rather than by a prediction of it.
 */
async function availabilityReason(): Promise<string | undefined> {
  try {
    const probe = await Health.isAvailable();
    return probe.available ? undefined : probe.reason;
  } catch {
    return undefined;
  }
}

/** The bridge rejects with a plain object or an Error depending on the plugin. */
function messageOf(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return undefined;
}

/** Ask the OS for read access. The permission sheet appears once. */
export async function requestAccess(): Promise<HealthStatus> {
  const p = platform();
  if (p === 'unavailable') {
    return { available: false, platform: p, readAuthorized: [], readDenied: [] };
  }
  try {
    // Android caps reads to ~30 days without history access; iOS ignores the flag.
    const status = await Health.requestAuthorization({
      read: readTypes(),
      requestHistoryAccess: true,
    });
    return {
      available: true,
      platform: p,
      readAuthorized: status.readAuthorized,
      readDenied: status.readDenied,
    };
  } catch (error) {
    return {
      available: false,
      platform: p,
      readAuthorized: [],
      readDenied: [],
      reason: (await availabilityReason()) ?? messageOf(error),
    };
  }
}

/** Check access without prompting, for the settings screen's status row. */
export async function checkAccess(): Promise<HealthStatus> {
  const p = platform();
  if (p === 'unavailable') {
    return { available: false, platform: p, readAuthorized: [], readDenied: [] };
  }
  try {
    const status = await Health.checkAuthorization({ read: readTypes() });
    return {
      available: true,
      platform: p,
      readAuthorized: status.readAuthorized,
      readDenied: status.readDenied,
    };
  } catch (error) {
    return {
      available: false,
      platform: p,
      readAuthorized: [],
      readDenied: [],
      reason: (await availabilityReason()) ?? messageOf(error),
    };
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
    // Unknown workout types fall back to a walk rather than an invented
    // 'other' kind: WorkoutKind is a closed set, and every consumer already
    // handles this one. The platform's own name is kept in `name`.
    kind: WORKOUT_MAP[String(w.workoutType)] ?? 'walk',
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
/**
 * Heart rate for each day of the range, read one day at a time.
 *
 * A single query over 30 days is capped by the platform at a few thousand
 * samples, and there is no continuation token for samples, so a watch-worn
 * user silently loses the tail of the range: those days arrive with fewer
 * samples and a lower worn time, yet look complete. Reading a day at a time
 * keeps every day under the cap and makes a truncated day detectable rather
 * than invisible.
 */
async function readHeartRateByDay(
  start: Date,
  days: number,
): Promise<{ samples: HealthSample[]; truncated: Set<string> }> {
  const PER_DAY = 4000;
  const chunks: { from: Date; to: Date }[] = [];
  for (let i = 0; i < days; i += 1) {
    const from = new Date(start.getTime() + i * 86400000);
    const to = new Date(from.getTime() + 86400000 - 1);
    chunks.push({ from, to });
  }

  const pages = await Promise.all(
    chunks.map(({ from, to }) =>
      Health.readSamples({
        dataType: 'heartRate',
        startDate: from.toISOString(),
        endDate: to.toISOString(),
        limit: PER_DAY,
        ascending: true,
      }).catch(() => ({ samples: [] })),
    ),
  );

  // A day that comes back exactly at the cap may have been cut short. Its rate
  // is still worth showing, but it must not be presented as complete, so mark
  // it and let the caller drop that day's worn-time estimate.
  const samples: HealthSample[] = [];
  const truncated = new Set<string>();
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i].samples;
    // Key the warning by the same local date the samples are filed under, not
    // by the chunk boundary: the window starts from a rolling timestamp, so
    // dateKey(chunks[i].from) need not equal the day the records land on.
    if (page.length >= PER_DAY) {
      for (const s of page) truncated.add(dateKey(new Date(s.startDate)));
    }
    samples.push(...page);
  }
  return { samples, truncated };
}

/** An aggregated day bucket, reshaped into the sample shape the daily fold reads. */
function toAggregatedSample(bucket: AggregatedSample): HealthSample {
  return { dataType: 'steps', unit: bucket.unit, value: bucket.value, startDate: bucket.startDate, endDate: bucket.endDate };
}

export async function readDays(days = 30): Promise<DayRecord[]> {
  const p = platform();
  if (p === 'unavailable') return [];

  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end.getTime() - days * 86400000);
  const range = { startDate: start.toISOString(), endDate: end.toISOString() };

  // Steps on Health Connect are read through the aggregate API, not raw
  // samples: the store applies source priority to overlapping devices, so its
  // bucket total is already deduplicated across a phone and a watch recording
  // the same walk. Raw StepsRecord reads are not — summing them counts every
  // overlapped step twice.
  //
  // The aggregated window is anchored at a local midnight because the plugin
  // slices its 'day' buckets as 24-hour durations counted from the window
  // start: anchored anywhere else, every bucket straddles Bene's local dates
  // and each day's steps land under the neighbouring date. A DST shift moves
  // those 24-hour buckets by an hour, so on that one day a bucket can follow
  // the wall clock rather than the calendar.
  const aggStart = new Date(end);
  aggStart.setDate(aggStart.getDate() - (days - 1));
  aggStart.setHours(0, 0, 0, 0);

  const [sleep, hrv, rhr, resp, spo2, temp, steps, cals, totalCals, hr, exercise, workouts] = await Promise.all([
    Health.readSamples({ dataType: 'sleep', ...range, limit: 500, ascending: true }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'heartRateVariability', ...range, limit: 2000 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'restingHeartRate', ...range, limit: 500 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'respiratoryRate', ...range, limit: 500 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'oxygenSaturation', ...range, limit: 500 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'bodyTemperature', ...range, limit: 500 }).catch(() => ({ samples: [] })),
    p === 'health-connect'
      ? Health.queryAggregated({
          dataType: 'steps',
          startDate: aggStart.toISOString(),
          endDate: end.toISOString(),
          bucket: 'day',
          aggregation: 'sum',
        })
          .then((r) => ({ samples: r.samples.map(toAggregatedSample) }))
          .catch(() => ({ samples: [] }))
      : Health.readSamples({ dataType: 'steps', ...range, limit: 2000 }).catch(() => ({ samples: [] })),
    Health.readSamples({ dataType: 'calories', ...range, limit: 2000 }).catch(() => ({ samples: [] })),
    p === 'health-connect'
      ? Health.readSamples({ dataType: 'totalCalories', ...range, limit: 2000 }).catch(() => ({ samples: [] }))
      : Promise.resolve({ samples: [] }),
    readHeartRateByDay(start, days),
    // exerciseTime is HealthKit-only (see readTypes): Health Connect has no
    // such record, so there is nothing to query for. Exercise minutes stay 0
    // on Android, exactly as a store without the record would report.
    p === 'apple-health'
      ? Health.readSamples({ dataType: 'exerciseTime', ...range, limit: 500 }).catch(() => ({ samples: [] }))
      : Promise.resolve({ samples: [] }),
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
        totalCalories: p === 'health-connect' ? null : 0,
        exerciseMinutes: 0,
        exerciseUnsupported: p === 'health-connect',
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

  const hasFor = (samples: HealthSample[], type: HealthDataType, date: ISODate): boolean =>
    samples.some((s) => s.dataType === type && dateKey(new Date(s.startDate)) === date);

  const dates = new Set<string>([
    ...sleep.samples.map((s) => dateKey(new Date(s.endDate))),
    ...steps.samples.map((s) => dateKey(new Date(s.startDate))),
    ...workouts.workouts.map((w) => dateKey(new Date(w.startDate))),
    // A day evidenced only by heart rate still happened, and its samples are
    // what build the stress and worn-time picture.
    ...hr.samples.map((s) => dateKey(new Date(s.startDate))),
  ]);

  for (const date of dates) {
    const day = dayFor(date);
    day.metrics.steps = Math.round(sumFor(steps.samples, 'steps', date));
    day.metrics.exerciseMinutes = Math.round(sumFor(exercise.samples, 'exerciseTime', date));
    if (p === 'health-connect') {
      // 'calories' is active burn on Health Connect — the plugin maps it to
      // ActiveCaloriesBurnedRecord, the same record Bene's active-calorie
      // permission names. Storing it as the day's total counted every active
      // kilocalorie as resting burn and inflated Nutrition's surplus.
      day.metrics.activeCalories = Math.round(sumFor(cals.samples, 'calories', date));
      // Total burn is the store's own total-calorie record. Where the device
      // records none, keep it unknown rather than relabelling active burn.
      day.metrics.totalCalories = hasFor(totalCals.samples, 'totalCalories', date)
        ? Math.round(sumFor(totalCals.samples, 'totalCalories', date))
        : null;
    } else {
      day.metrics.totalCalories = Math.round(sumFor(cals.samples, 'calories', date));
    }
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
    // A day whose read hit the per-day cap has an unknown amount of missing
    // data, so its worn time would read low. Leave it unknown rather than
    // reporting a number the store cannot stand behind.
    day.metrics.wearMinutes = hr.truncated.has(date) ? 0 : hrMinutes;
    day.workouts = workouts.workouts
      .filter((w) => dateKey(new Date(w.startDate)) === date)
      .map(toWorkout);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
