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
  'basalBodyTemperature',
  'appleSleepingWristTemperature',
  'steps',
  'calories',
  'totalCalories',
  'basalCalories',
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
 * Number of per-type queries that failed in the most recent readDays call.
 * The caller leaves the sync cursor untouched when this is non-zero, so the
 * failed type is retried instead of being skipped forever.
 */
let lastReadFailures = 0;
export const lastHealthReadFailures = () => lastReadFailures;

/**
 * The types to ask the store about, trimmed to the current platform.
 *
 * 'exerciseTime' is a HealthKit type — Apple's exercise minutes — and the
 * plugin has no Health Connect record for it. Passing it to Health Connect's
 * permission calls makes the whole list reject with "Unsupported data type",
 * which Bene then reports as "no health store" on every Android phone,
 * including ones where the store works fine.
 *
 * The ask must also name what the data silently depends on. A workout read
 * only carries a distance when the separate distance scope is granted, so
 * Android asks for 'distance' too.
 *
 * Total energy is split by platform. 'calories' is *active* energy on both;
 * the basal half comes from a different record. Health Connect answers
 * 'totalCalories' with TotalCaloriesBurnedRecord — an energy — so Android
 * reads it directly. Its 'basalCalories' is a BasalMetabolicRateRecord, a
 * *rate* in kcal/day, and summing rates would be nonsense. iOS has no useful
 * 'totalCalories' either: the plugin maps it to activeEnergyBurned, the same
 * store as 'calories', so reading both would double-count. There it reads
 * 'basalCalories' (basalEnergyBurned, an energy) and Bene adds the two.
 */
export function readTypes(): HealthDataType[] {
  if (platform() !== 'health-connect') return READ_TYPES.filter((t) => t !== 'totalCalories');
  return READ_TYPES.filter(
    (t) => t !== 'exerciseTime' && t !== 'basalCalories' && t !== 'appleSleepingWristTemperature',
  ).concat('distance');
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
 * The two platforms shape the same night differently. Health Connect emits one
 * sample per SleepSessionRecord whose stages array carries every stage; iOS
 * HealthKit has no session object, so the plugin emits ONE sample per
 * HKCategorySample — one stage segment each with a single-element stages
 * array. Choosing "the longest sample" on that shape would make the longest
 * *stage* the whole night and discard every other stage.
 *
 * So the iOS shape is detected and merged first: when every sample for a
 * morning carries at most one stage, they are one night, and the session
 * bounds are the union. Anything else keeps the single longest sample — the
 * Health Connect shape, where a morning may legitimately hold a nap and a
 * night as separate records.
 */
export function toSleepSession(samples: HealthSample[], date: ISODate): SleepSession | null {
  const relevant = samples.filter((s) => s.dataType === 'sleep');
  if (!relevant.length) return null;

  // HealthKit returns samples from every app that writes sleep. Choose one
  // source for the night — the one with the most real stage segments — rather
  // than summing a watch and a ring recording the same hours.
  const groups = new Map<string, HealthSample[]>();
  for (const sample of relevant) {
    const key = sample.sourceName ?? '';
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  // HealthKit normally stamps every segment with its source. If only one
  // named source exists and some segments omit the name, treat them as that
  // source rather than silently choosing only the named subset.
  const named = [...groups.keys()].filter(Boolean);
  if (named.length === 1 && groups.has('')) {
    groups.set(named[0], [...groups.get(named[0])!, ...groups.get('')!]);
    groups.delete('');
  }
  const nightScore = (group: HealthSample[]) => {
    const staged = group.filter((s) => (s.stages ?? []).some((b) => b.stage !== 'inBed')).length;
    const span = group.reduce((sum, s) => sum + Math.max(0, new Date(s.endDate).getTime() - new Date(s.startDate).getTime()), 0);
    return [staged, span] as const;
  };
  const chosen = [...groups.values()].sort((a, b) => {
    const [aStages, aSpan] = nightScore(a);
    const [bStages, bSpan] = nightScore(b);
    return bStages - aStages || bSpan - aSpan;
  })[0];

  // One stage per sample, more than one sample: the iOS per-segment shape.
  if (chosen.length > 1 && chosen.every((s) => (s.stages?.length ?? 0) === 1)) {
    return mergeSleepSegments(chosen, date);
  }

  // Prefer the most complete block: the longest session that morning.
  const primary = chosen.reduce((a, b) =>
    new Date(b.endDate).getTime() - new Date(b.startDate).getTime() >
    new Date(a.endDate).getTime() - new Date(a.startDate).getTime()
      ? b
      : a,
  );

  return finishSleepSession(primary.platformId, primary.sourceName, new Date(primary.startDate), new Date(primary.endDate), primary.stages ?? [], date);
}

/**
 * Union of iOS's per-segment samples: one session from many one-stage
 * records. The first sample in the store's order donates the identity.
 */
function mergeSleepSegments(samples: HealthSample[], date: ISODate): SleepSession | null {
  const start = new Date(Math.min(...samples.map((s) => new Date(s.startDate).getTime())));
  const end = new Date(Math.max(...samples.map((s) => new Date(s.endDate ?? s.startDate).getTime())));
  return finishSleepSession(samples[0].platformId, samples[0].sourceName, start, end, samples.flatMap((s) => s.stages ?? []), date);
}

/** Shared assembly so both shapes produce the same SleepSession fields. */
function finishSleepSession(
  platformId: string | undefined,
  sourceName: string | undefined,
  start: Date,
  end: Date,
  rawStages: NonNullable<HealthSample['stages']>,
  date: ISODate,
): SleepSession | null {
  if (!(end.getTime() > start.getTime())) return null;

  const mapped = rawStages
    .map((s) => ({
      rawStage: s.stage,
      stage: STAGE_MAP[s.stage] ?? 'core',
      startMin: minutesFrom(s.startDate, start),
      endMin: minutesFrom(s.endDate, start),
    }))
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  // Apple Health writes an inBed span covering the whole night *and* the
  // staged segments inside it. Summing both doubles every asleep minute, so
  // drop the in-bed envelope whenever real sleep stages exist.
  const hasRealStages = mapped.some((b) => b.rawStage !== 'inBed');
  const blocks: SleepStageBlock[] = (hasRealStages ? mapped.filter((b) => b.rawStage !== 'inBed') : mapped).map(
    ({ stage, startMin, endMin }) => ({ stage, startMin, endMin }),
  );

  let staged = hasRealStages;
  if (!blocks.length) {
    blocks.push({ stage: 'core', startMin: 0, endMin: Math.round((end.getTime() - start.getTime()) / 60000) });
    staged = false;
  }

  return {
    id: platformId ?? `hc-${date}`,
    date,
    start: start.toISOString(),
    end: end.toISOString(),
    stages: blocks,
    source: sourceName ?? platformLabel(),
    hrvMs: null,
    rhrBpm: null,
    respiratoryRate: null,
    spo2: null,
    wristTempC: null,
    minHrBpm: null,
    timeToFallAsleepMin: null,
    alarm: null,
    imported: true,
    staged,
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

/**
 * Plugin workout names onto Bene's closed WorkoutKind set.
 *
 * The keys are names the plugin *emits*, not the aliases it accepts. Android's
 * WorkoutType.toWorkoutTypeString emits e.g. strengthTraining, crossTraining,
 * swimmingPool, swimmingOpenWater, bikingStationary, rowingMachine; iOS's
 * fromHKWorkoutActivityType emits its WorkoutType enum case names —
 * .traditionalStrengthTraining comes back as strengthTraining, while
 * functionalStrengthTraining, highIntensityIntervalTraining, elliptical,
 * waterFitness and swimmingOpenWater are emitted as themselves. Mapping only
 * the aliases used to send every imported strength and HIIT session to the
 * 'walk' fallback, which counted them towards the cardio-goal minutes.
 *
 * What is not listed here is genuinely unclassifiable against the eight kinds
 * Bene has (boxing, pilates, tennis, dance, …) and falls back to 'walk': the
 * cardio-goal minutes stay roughly right and no invented kind leaks into the
 * closed set. Rowing is steady machine cardio; 'cycle' is the closest kind.
 */
const WORKOUT_MAP: Record<string, WorkoutKind> = {
  running: 'run',
  runningTreadmill: 'run',
  walking: 'walk',
  hiking: 'hike',
  cycling: 'cycle',
  bikingStationary: 'cycle',
  elliptical: 'cycle',
  rowing: 'cycle',
  rowingMachine: 'cycle',
  swimming: 'swim',
  swimmingPool: 'swim',
  swimmingOpenWater: 'swim',
  waterFitness: 'swim',
  strengthTraining: 'strength',
  traditionalStrengthTraining: 'strength',
  functionalStrengthTraining: 'strength',
  weightlifting: 'strength',
  crossTraining: 'hiit',
  highIntensityIntervalTraining: 'hiit',
  yoga: 'yoga',
  // 'other' and every sport Bene has no kind for keep the walk fallback.
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

/** Local midnight `i` days before today. */
function localMidnight(i: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
}

/** The last millisecond of the local day `i` days before today. */
function localDayEnd(i: number): Date {
  const midnight = localMidnight(i);
  return new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() + 1, 0, 0, 0, -1);
}

/**
 * One window per local calendar day, oldest first, tiling the range with no
 * gaps or overlap — and covering exactly the dates the range query spans,
 * oldest included: a fallback that skipped the oldest day would silently drop
 * it whenever the single range read hit its cap and was discarded. Calendar
 * days, not `+864****0000` offsets: a raw-millisecond window slides an hour
 * off local midnight across a DST change and drops part of a whole local day
 * from the query.
 */
function dayWindows(days: number): { from: Date; to: Date }[] {
  const windows: { from: Date; to: Date }[] = [];
  for (let i = days; i >= 0; i -= 1) {
    windows.push({ from: localMidnight(i), to: localDayEnd(i) });
  }
  return windows;
}

/**
 * Sleep windows, one per morning in the range. A night is filed under the day
 * it *ends* on but starts the evening before, so day D's window reaches back
 * into D−1. That makes neighbouring windows overlap a little; callers that
 * use them must dedupe (see readSleep).
 */
function sleepWindows(days: number): { from: Date; to: Date }[] {
  const windows: { from: Date; to: Date }[] = [];
  for (let i = days; i >= 0; i -= 1) {
    windows.push({ from: localMidnight(i + 1), to: localDayEnd(i) });
  }
  return windows;
}

interface ReadStats {
  attempted: number;
  failed: number;
}

/** Read one data type with one query per window. */
async function readWindows(
  dataType: HealthDataType,
  windows: { from: Date; to: Date }[],
  limitPerDay: number,
  stats: ReadStats,
): Promise<{ samples: HealthSample[]; truncated: Set<string> }> {
  const pages = await Promise.all(
    windows.map(({ from, to }) => {
      stats.attempted += 1;
      return Health.readSamples({
        dataType,
        startDate: from.toISOString(),
        endDate: to.toISOString(),
        limit: limitPerDay,
        ascending: true,
      }).catch(() => {
        stats.failed += 1;
        return { samples: [] as HealthSample[] };
      });
    }),
  );

  // A window that comes back exactly at the cap may have been cut short. Its
  // samples are still worth showing, but they must not be presented as
  // complete, so mark them and let the caller decide what to withhold.
  const samples: HealthSample[] = [];
  const truncated = new Set<string>();
  for (const page of pages) {
    if (page.samples.length >= limitPerDay) {
      for (const s of page.samples) truncated.add(dateKey(new Date(s.startDate)));
    }
    samples.push(...page.samples);
  }
  return { samples, truncated };
}

/**
 * Wall-clock span of a sleep cluster, oldest start to latest end. The longer
 * of two clusters ending on the same morning is the night; the shorter is a
 * nap.
 */
function nightSpan(samples: HealthSample[]): number {
  const starts = samples.map((s) => new Date(s.startDate).getTime());
  const ends = samples.map((s) => new Date(s.endDate ?? s.startDate).getTime());
  return Math.max(...ends) - Math.min(...starts);
}

/**
 * The single-query fast path: one range read, and only when it returns exactly
 * the cap — the plugin has no continuation token for samples, so a page at the
 * limit may have dropped the oldest days of a heavy month — fall back to
 * reading the type one local day at a time. Most months never pay for that.
 */
async function readRange(
  dataType: HealthDataType,
  range: { startDate: string; endDate: string },
  days: number,
  limit: number,
  stats: ReadStats,
): Promise<{ samples: HealthSample[]; truncated: Set<string> }> {
  stats.attempted += 1;
  const page = await Health.readSamples({ dataType, ...range, limit, ascending: true }).catch(() => {
    stats.failed += 1;
    return { samples: [] as HealthSample[] };
  });
  if (page.samples.length < limit) return { samples: page.samples, truncated: new Set() };
  return readWindows(dataType, dayWindows(days), limit, stats);
}

/** Merge pages that may overlap, keeping each record once. */
function dedupeByIdentity(samples: HealthSample[]): HealthSample[] {
  const seen = new Set<string>();
  return samples.filter((s) => {
    const key = s.platformId ?? `${s.startDate}|${s.endDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Heart rate for each day of the range, read one day at a time.
 *
 * A single query over 30 days is capped by the platform at a few thousand
 * samples, and a watch-worn user exceeds it: those days arrive with fewer
 * samples and a lower worn time, yet look complete. Reading a day at a time
 * keeps every day under the cap and makes a truncated day detectable rather
 * than invisible.
 */
async function readHeartRateByDay(days: number, stats: ReadStats): Promise<{ samples: HealthSample[]; truncated: Set<string> }> {
  return readWindows('heartRate', dayWindows(days), 4000, stats);
}

/**
 * Sleep, like heart rate, can overrun a single capped query — on iOS each
 * stage is its own sample and a month of nights is thousands of records, and
 * ascending order would keep the oldest nights and silently drop the newest.
 * The cap triggers per-morning re-reads, whose windows overlap by design, so
 * the pages are deduped by record identity before they are returned.
 *
 * A per-morning window can itself hit the cap (a night with more stage
 * segments than the cap). It is not accepted as complete: it is bisected and
 * the halves re-read, so a heavy morning still arrives whole. A window still
 * capped after the splitting limit marks its dates truncated, and readDays
 * withholds the affected session rather than scoring a silently shortened
 * night.
 */
const SLEEP_SPLIT_DEPTH = 3;
const SLEEP_WINDOW_LIMIT = 500;

async function readSleepWindow(
  from: Date,
  to: Date,
  depth: number,
  stats: ReadStats,
): Promise<{ samples: HealthSample[]; truncated: Set<string> }> {
  stats.attempted += 1;
  const page = await Health.readSamples({
    dataType: 'sleep',
    startDate: from.toISOString(),
    endDate: to.toISOString(),
    limit: SLEEP_WINDOW_LIMIT,
    ascending: true,
  }).catch(() => {
    stats.failed += 1;
    return { samples: [] as HealthSample[] };
  });
  if (page.samples.length < SLEEP_WINDOW_LIMIT) return { samples: page.samples, truncated: new Set() };

  // Capped even after the limit: the page is genuinely incomplete. Its dates
  // are marked so the caller withholds them; the samples are still returned
  // for the caller to decide.
  if (depth >= SLEEP_SPLIT_DEPTH) {
    const truncated = new Set<string>();
    for (const s of page.samples) truncated.add(dateKey(new Date(s.startDate)));
    return { samples: page.samples, truncated };
  }

  const mid = new Date(Math.round((from.getTime() + to.getTime()) / 2) + 1);
  const [lo, hi] = await Promise.all([
    readSleepWindow(from, new Date(mid.getTime() - 1), depth + 1, stats),
    readSleepWindow(mid, to, depth + 1, stats),
  ]);
  return {
    samples: dedupeByIdentity([...lo.samples, ...hi.samples]),
    truncated: new Set([...lo.truncated, ...hi.truncated]),
  };
}

async function readSleep(
  range: { startDate: string; endDate: string },
  days: number,
  stats: ReadStats,
): Promise<{ samples: HealthSample[]; truncated: Set<string> }> {
  const LIMIT = 2000;
  stats.attempted += 1;
  const page = await Health.readSamples({ dataType: 'sleep', ...range, limit: LIMIT, ascending: true }).catch(() => {
    stats.failed += 1;
    return { samples: [] as HealthSample[] };
  });
  if (page.samples.length < LIMIT) return { samples: page.samples, truncated: new Set() };
  const results = await Promise.all(
    sleepWindows(days).map(({ from, to }) => readSleepWindow(from, to, 0, stats)),
  );
  return {
    samples: dedupeByIdentity(results.flatMap((r) => r.samples)),
    truncated: new Set(results.flatMap((r) => [...r.truncated])),
  };
}

/** An aggregated day bucket, reshaped into the sample shape the daily fold reads. */
function toAggregatedSample(bucket: AggregatedSample): HealthSample {
  return { dataType: 'steps', unit: bucket.unit, value: bucket.value, startDate: bucket.startDate, endDate: bucket.endDate };
}

export async function readDays(days = 30): Promise<DayRecord[]> {
  const p = platform();
  if (p === 'unavailable') {
    lastReadFailures = 0;
    return [];
  }

  // The window is built from local calendar dates, not raw milliseconds: end
  // of today back to local midnight `days` ago. A `days * 86400000` offset
  // across a DST fall-back lands one hour past the oldest local midnight and
  // drops that whole local day from every query.
  const end = localDayEnd(0);
  const start = localMidnight(days);
  const range = { startDate: start.toISOString(), endDate: end.toISOString() };

  // Where the store reports the non-active half of the day's energy (see
  // readTypes): Health Connect as a total, HealthKit as basal samples.
  const basalType: HealthDataType = p === 'health-connect' ? 'totalCalories' : 'basalCalories';
  // Wrist-specific records carry the overnight temperature; generic body
  // temperature is the fallback for stores that only expose that.
  const wristTempType: HealthDataType = p === 'health-connect' ? 'basalBodyTemperature' : 'appleSleepingWristTemperature';

  // Steps on Health Connect are read through the aggregate API, not raw
  // samples: the store applies source priority to overlapping devices, so its
  // bucket total is already deduplicated across a phone and a watch recording
  // the same walk. Raw StepsRecord reads are not — summing them counts every
  // overlapped step twice. The aggregated window is anchored at `start`, a
  // local midnight, because the plugin slices its 'day' buckets as 24-hour
  // durations counted from the window start: anchored anywhere else, every
  // bucket straddles Bene's local dates. A DST shift moves those 24-hour
  // buckets by an hour, so on that one day a bucket can follow the wall clock
  // rather than the calendar.
  // Sleep is filed under the morning it ends on. The oldest covered day's
  // night starts on the evening before that day, so its read range must reach
  // back one more midnight than every other metric.
  const sleepRange = { ...range, startDate: localMidnight(days + 1).toISOString() };

  const stats: ReadStats = { attempted: 0, failed: 0 };

  const stepsRead: Promise<{ samples: HealthSample[] }> =
    p === 'health-connect'
      ? (async () => {
          stats.attempted += 1;
          try {
            const r = await Health.queryAggregated({
              dataType: 'steps',
              startDate: start.toISOString(),
              endDate: end.toISOString(),
              bucket: 'day',
              aggregation: 'sum',
            });
            return { samples: r.samples.map(toAggregatedSample) };
          } catch {
            stats.failed += 1;
            return { samples: [] as HealthSample[] };
          }
        })()
      : readRange('steps', range, days, 2000, stats).then((r) => ({ samples: r.samples }));

  const workoutsRead = (async () => {
    stats.attempted += 1;
    try {
      return await Health.queryWorkouts({ ...range, limit: 200, ascending: false });
    } catch {
      stats.failed += 1;
      return { workouts: [] as HealthWorkout[] };
    }
  })();

  const [sleep, hrv, rhr, resp, spo2, temp, wristTemp, steps, cals, basal, hr, exercise, workouts] = await Promise.all([
    readSleep(sleepRange, days, stats),
    readRange('heartRateVariability', range, days, 2000, stats),
    readRange('restingHeartRate', range, days, 500, stats),
    readRange('respiratoryRate', range, days, 500, stats),
    readRange('oxygenSaturation', range, days, 500, stats),
    readRange('bodyTemperature', range, days, 500, stats),
    readRange(wristTempType, range, days, 500, stats),
    stepsRead,
    readRange('calories', range, days, 2000, stats),
    readRange(basalType, range, days, 2000, stats),
    readHeartRateByDay(days, stats),
    // exerciseTime is HealthKit-only (see readTypes): Health Connect has no
    // such record, so there is nothing to query for. Exercise minutes stay 0
    // on Android, exactly as a store without the record would report.
    p === 'apple-health' ? readRange('exerciseTime', range, days, 500, stats) : Promise.resolve({ samples: [] as HealthSample[], truncated: new Set<string>() }),
    // Descending, not ascending: the plugin sorts then take(limit), so an
    // ascending ask silently dropped the NEWEST workouts once the cap hit.
    // If exactly the limit come back there may be more in the window (the
    // result carries a paging anchor Bene does not follow yet) — the oldest
    // workouts are the ones missing, and that is the acceptable loss.
    workoutsRead,
  ]);

  // A totally failed store read used to look exactly like an empty store: every
  // query was swallowed into []. That advanced the sync cursor and permanently
  // skipped the whole window. Partial failures still import the types that did
  // answer, but the caller must leave the cursor alone so the failed type is
  // read again on the next sync.
  lastReadFailures = stats.failed;
  if (stats.attempted > 0 && stats.failed === stats.attempted) {
    throw new Error('Every health-store read failed.');
  }

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

  // Sleep is attributed to the morning it ends on. iOS's per-segment records
  // make one night several samples, though, and a segment that ends before
  // local midnight would otherwise be filed under the evening's date — the
  // night would be split across two days and scored as two short sleeps. So
  // the samples are clustered into nights by proximity first (a gap of more
  // than a couple of hours starts a new night) and the whole night is
  // attributed to the morning its last segment ends on.
  const NIGHT_GAP_MS = 2 * 60 * 60000;
  const nights: HealthSample[][] = [];
  for (const s of [...sleep.samples].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())) {
    const cluster = nights[nights.length - 1];
    const last = cluster?.[cluster.length - 1];
    if (cluster && new Date(s.startDate).getTime() - new Date(last!.endDate).getTime() <= NIGHT_GAP_MS) {
      cluster.push(s);
    } else {
      nights.push([s]);
    }
  }
  const sleepByDate = new Map<string, HealthSample[]>();
  const isNightCluster = (cluster: HealthSample[]) => {
    const start = new Date(cluster[0].startDate);
    const hours = start.getHours();
    const span = cluster.reduce((sum, s) => sum + Math.max(0, new Date(s.endDate).getTime() - new Date(s.startDate).getTime()), 0);
    return hours >= 18 || (hours < 12 && span >= 2 * 60 * 60000);
  };
  for (const night of nights) {
    const ended = Math.max(...night.map((s) => new Date(s.endDate ?? s.startDate).getTime()));
    const d = dateKey(new Date(ended));
    const current = sleepByDate.get(d);
    // Two clusters can end on the same morning: a split night (a long waking
    // gap, a removed watch) or a daytime nap. Union two night-shaped clusters
    // so a broken night is not silently truncated; a nap stays separate and
    // the longer cluster wins.
    if (current && isNightCluster(current) && isNightCluster(night)) {
      sleepByDate.set(d, [...current, ...night]);
    } else if (!current || nightSpan(night) > nightSpan(current)) {
      sleepByDate.set(d, night);
    }
  }
  for (const [date, samples] of sleepByDate) {
    // A night whose read window was still capped after splitting is missing an
    // unknown number of segments. Withhold the session rather than score a
    // silently shortened night as complete.
    if (samples.some((s) => sleep.truncated.has(dateKey(new Date(s.startDate))))) continue;
    const session = toSleepSession(samples, date);
    if (!session) continue;
    const day = dayFor(date);
    const from = session.start;
    const to = session.end;
    // Ring exporters often write one overnight summary at waking, a little
    // after the last stage ends. A short waking grace captures that reading
    // without folding in a genuinely daytime sample.
    const wakeTo = new Date(new Date(to).getTime() + 2 * 60 * 60000).toISOString();
    session.hrvMs = meanIn(hrv.samples, 'heartRateVariability', from, wakeTo);
    session.rhrBpm = meanIn(rhr.samples, 'restingHeartRate', from, wakeTo);
    session.respiratoryRate = meanIn(resp.samples, 'respiratoryRate', from, wakeTo);
    const spo2Value = meanIn(spo2.samples, 'oxygenSaturation', from, wakeTo);
    // HealthKit reports SpO2 as a 0–1 fraction; Health Connect as 0–100.
    session.spo2 = spo2Value == null ? null : spo2Value <= 1.5 ? spo2Value * 100 : spo2Value;
    // Absolute Celsius, preferring the wrist-specific overnight record. The
    // old |value| < 5 heuristic discarded every real 36.x °C reading.
    const t = meanIn(wristTemp.samples, wristTempType, from, wakeTo) ?? meanIn(temp.samples, 'bodyTemperature', from, wakeTo);
    session.wristTempC = t != null && t >= 25 && t <= 42 ? t : null;
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
    ...sleepByDate.keys(),
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
    // 'calories' is *active* energy on both platforms (ActiveCaloriesBurned /
    // activeEnergyBurned). Filing it under totalCalories used to hide the
    // active part and count it as resting burn.
    day.metrics.activeCalories = Math.round(sumFor(cals.samples, 'calories', date));
    if (p === 'health-connect') {
      // Total burn is the store's own total-calorie record (already active +
      // basal). Where the device records none, keep it unknown rather than
      // relabelling active burn.
      day.metrics.totalCalories = hasFor(basal.samples, 'totalCalories', date)
        ? Math.round(sumFor(basal.samples, 'totalCalories', date))
        : null;
    } else {
      // No basal samples means the store said nothing about the basal half:
      // total stays at active rather than dropping to zero.
      day.metrics.totalCalories =
        day.metrics.activeCalories + Math.round(sumFor(basal.samples, 'basalCalories', date));
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
    // Health Connect has no exerciseTime record (see readTypes). The imported
    // sessions themselves are the only evidence of exercise minutes, so count
    // their durations instead of leaving every Android day at 0.
    if (p === 'health-connect' && exercise.samples.length === 0) {
      day.metrics.exerciseMinutes = day.workouts.reduce((sum, w) => sum + w.durationMin, 0);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
