import { strFromU8, unzipSync } from 'fflate';
import type { DayRecord, HeartRateSample, MealEntry, SleepSession, SleepStageBlock, Stage, Workout, WorkoutKind } from '../types';
import { round } from '../math';
import { edwardsZoneWeight, strainFromTrimp } from '../scoring/strain';
import { workoutTrimp } from '../scoring/zones';

/**
 * Apple Health export importer.
 *
 * Apple's Health app exports a ZIP containing `apple_health_export/export.xml`.
 * Records are flat XML elements; the export has no sleep-session object, so
 * night assembly is done here. This is deliberately a local, best-effort
 * importer: every mapped object is marked `imported: true`, and any metric
 * Apple does not export (e.g. alarm state, time-to-fall-asleep) stays null.
 *
 * Reference for the export shape:
 * https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier
 */

export interface AppleHealthSummary {
  days: number;
  sleepSessions: number;
  workouts: number;
  meals: number;
  firstDate: string | null;
  lastDate: string | null;
  skippedRecords: number;
}

export interface AppleHealthImport {
  days: DayRecord[];
  dayOrder: string[];
  summary: AppleHealthSummary;
}

const MAX_IMPORT_DAYS = 365;

const dateKey = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function attributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out[m[1]] = decode(m[2]);
  return out;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  // Apple uses "2026-11-13 23:34:00 +0000".
  const normalized = value.includes('T') ? value : value.replace(' ', 'T').replace(/ ([+-]\d{4})$/, '$1');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function number(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function unitToMinutes(value: number, unit: string | undefined): number {
  const u = (unit ?? 'min').toLowerCase();
  if (u === 'sec' || u === 's' || u === 'second' || u === 'seconds') return value / 60;
  if (u === 'hr' || u === 'h' || u === 'hour' || u === 'hours') return value * 60;
  return value;
}

function unitToKm(value: number, unit: string | undefined): number {
  const u = (unit ?? 'km').toLowerCase();
  if (u === 'mi' || u === 'mile' || u === 'miles') return value * 1.609344;
  if (u === 'm' || u === 'meter' || u === 'meters') return value / 1000;
  return value;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Apple stores SpO2 either as a fraction (0.97) or a percentage (97). */
function normaliseSpo2(value: number): number {
  return value <= 1 ? value * 100 : value;
}

const STAGE_BY_VALUE: Record<string, Stage | null> = {
  HKCategoryValueSleepAnalysisAwake: 'awake',
  HKCategoryValueSleepAnalysisAsleepREM: 'rem',
  HKCategoryValueSleepAnalysisAsleepCore: 'core',
  HKCategoryValueSleepAnalysisAsleepDeep: 'deep',
  HKCategoryValueSleepAnalysisAsleep: 'core',
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'core',
  HKCategoryValueSleepAnalysisInBed: null,
};

interface SleepRecord {
  stage: Stage | null;
  start: Date;
  end: Date;
  source: string;
  generic: boolean;
  inBed: boolean;
}

interface WorkoutRecord {
  start: Date;
  end: Date;
  kind: WorkoutKind;
  durationMin: number;
  distanceKm: number | null;
  calories: number | null;
  avgHr: number | null;
  maxHr: number | null;
  source: string;
}

function workoutKind(type: string | undefined): WorkoutKind {
  const t = (type ?? '').toLowerCase();
  if (t.includes('running') || t.includes('run')) return 'run';
  if (t.includes('cycling') || t.includes('biking')) return 'cycle';
  if (t.includes('swimming')) return 'swim';
  if (t.includes('hiking')) return 'hike';
  if (t.includes('yoga')) return 'yoga';
  if (t.includes('highintensity') || t.includes('hiit')) return 'hiit';
  if (t.includes('strength') || t.includes('functional')) return 'strength';
  return 'walk';
}

function parseXml(xml: string): {
  records: Array<{ type: string; source: string; start: Date; end: Date; value: string; unit?: string }>;
  workouts: WorkoutRecord[];
  skipped: number;
} {
  const records: Array<{ type: string; source: string; start: Date; end: Date; value: string; unit?: string }> = [];
  let skipped = 0;
  const recordRe = /<Record\b([^>]*?)\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = recordRe.exec(xml))) {
    const a = attributes(match[1]);
    const start = parseDate(a.startDate);
    const end = parseDate(a.endDate ?? a.startDate);
    if (!a.type || !start || !end || a.value == null) {
      skipped += 1;
      continue;
    }
    records.push({ type: a.type, source: a.sourceName ?? 'Apple Health', start, end, value: a.value, unit: a.unit });
  }

  const workouts: WorkoutRecord[] = [];
  const workoutRe = /<Workout\b([^>]*)>([\s\S]*?)<\/Workout>/g;
  while ((match = workoutRe.exec(xml))) {
    const a = attributes(match[1]);
    const start = parseDate(a.startDate);
    const end = parseDate(a.endDate);
    if (!start || !end) {
      skipped += 1;
      continue;
    }
    const durationRaw = number(a.duration);
    const durationMin = durationRaw != null ? unitToMinutes(durationRaw, a.durationUnit) : (end.getTime() - start.getTime()) / 60000;
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      skipped += 1;
      continue;
    }
    const statMatches = [...match[2].matchAll(/<WorkoutStatistics\b([^>]*?)\/?>/g)].map((m) => attributes(m[1]));
    const hrStat = statMatches.find((s) => (s.type ?? '').includes('HeartRate')) ?? {};
    const avgHr = number(hrStat.average) ?? number(a.averageHeartRate);
    const maxHr = number(hrStat.maximum) ?? number(a.maximumHeartRate);
    const dist = number(a.totalDistance);
    workouts.push({
      start,
      end,
      kind: workoutKind(a.workoutActivityType),
      durationMin,
      distanceKm: dist != null ? unitToKm(dist, a.totalDistanceUnit) : null,
      calories: number(a.totalEnergyBurned),
      avgHr,
      maxHr,
      source: a.sourceName ?? 'Apple Watch',
    });
  }

  return { records, workouts, skipped };
}

function sleepSessions(records: Array<{ type: string; source: string; start: Date; end: Date; value: string; unit?: string }>): SleepSession[] {
  const all: SleepRecord[] = [];
  for (const r of records) {
    if (r.type !== 'HKCategoryTypeIdentifierSleepAnalysis') continue;
    const stage = STAGE_BY_VALUE[r.value] ?? null;
    const inBed = r.value === 'HKCategoryValueSleepAnalysisInBed';
    const generic = r.value === 'HKCategoryValueSleepAnalysisAsleep';
    if (stage == null && !inBed) continue;
    all.push({ stage, start: r.start, end: r.end, source: r.source, generic, inBed });
  }
  all.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Apple emits one record per stage. Join records into nights, allowing a
  // two-hour gap for wake-ups; a record that ends before noon is attributed
  // to that morning, a nap that ends after noon to its start date.
  const groups: SleepRecord[][] = [];
  for (const r of all) {
    const current = groups[groups.length - 1];
    if (current && r.start.getTime() - current[current.length - 1].end.getTime() <= 120 * 60000) {
      current.push(r);
    } else {
      groups.push([r]);
    }
  }

  const byDate = new Map<string, SleepSession>();
  for (const raw of groups) {
    const sorted = raw.sort((a, b) => a.start.getTime() - b.start.getTime());
    const hasStages = sorted.some((r) => r.stage != null && !r.generic);
    let usable = hasStages ? sorted.filter((r) => r.stage != null && !r.generic) : sorted.filter((r) => r.stage != null || r.inBed);
    if (!usable.length) continue;
    if (!usable.some((r) => r.stage != null)) {
      usable = usable.map((r) => ({ ...r, stage: 'core' as Stage }));
    }
    usable = usable.filter((r) => r.stage != null);

    const start = Math.min(...usable.map((r) => r.start.getTime()));
    let end = Math.max(...usable.map((r) => r.end.getTime()));
    if ((end - start) / 60000 < 20) continue;
    if ((end - start) / 60000 > 20 * 60) {
      end = Math.min(...usable.map((r) => r.end.getTime())) + 60 * 60000;
    }

    const endDate = new Date(end);
    const date = endDate.getHours() < 12 ? dateKey(endDate) : dateKey(new Date(start));

    const blocks: SleepStageBlock[] = [];
    let cursor = start;
    for (const r of usable) {
      const s = Math.max(cursor, r.start.getTime());
      const e = Math.min(end, r.end.getTime());
      if (e <= s) continue;
      if (e - s < 1) continue;
      const previous = blocks[blocks.length - 1];
      const startMin = Math.round((s - start) / 60000);
      const endMin = Math.round((e - start) / 60000);
      if (previous && previous.stage === r.stage && previous.endMin >= startMin - 1) {
        previous.endMin = endMin;
      } else {
        blocks.push({ stage: r.stage as Stage, startMin, endMin });
      }
      cursor = e;
    }
    if (!blocks.length) continue;

    const inWindow = (d: Date) => d.getTime() >= start && d.getTime() <= end;
    const values = (type: string) => records.filter((r) => r.type === type && inWindow(r.start)).map((r) => number(r.value)).filter((v): v is number => v != null);
    const hrv = mean(values('HKQuantityTypeIdentifierHeartRateVariabilitySDNN'));
    const rhr = mean(values('HKQuantityTypeIdentifierRestingHeartRate'));
    const rr = mean(values('HKQuantityTypeIdentifierRespiratoryRate'));
    const spo2Raw = mean(values('HKQuantityTypeIdentifierOxygenSaturation'));
    const temp = mean(values('HKQuantityTypeIdentifierAppleSleepingWristTemperature'));
    const hr = values('HKQuantityTypeIdentifierHeartRate');
    const source = usable[0].source || 'Apple Health';

    const session: SleepSession = {
      id: `sleep-apple-${date}`,
      date,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      stages: blocks,
      source,
      hrvMs: hrv != null ? round(hrv, 1) : null,
      rhrBpm: rhr != null ? Math.round(rhr) : null,
      respiratoryRate: rr != null ? round(rr, 1) : null,
      spo2: spo2Raw != null ? Math.round(normaliseSpo2(spo2Raw)) : null,
      wristTempC: temp != null ? round(temp, 2) : null,
      minHrBpm: hr.length ? Math.round(Math.min(...hr)) : null,
      timeToFallAsleepMin: null,
      alarm: null,
      imported: true,
    };
    const previous = byDate.get(date);
    if (!previous || new Date(session.end).getTime() - new Date(session.start).getTime() > new Date(previous.end).getTime() - new Date(previous.start).getTime()) {
      byDate.set(date, session);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function dailyMetrics(
  records: Array<{ type: string; source: string; start: Date; end: Date; value: string; unit?: string }>,
  cutoff: Date,
): Map<string, DayRecord['metrics']> {
  const out = new Map<string, DayRecord['metrics']>();
  const get = (date: string) => {
    let m = out.get(date);
    if (!m) {
      m = {
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
      };
      out.set(date, m);
    }
    return m;
  };

  const buckets = new Map<string, Map<number, { sum: number; n: number }>>();
  for (const r of records) {
    if (r.start < cutoff) continue;
    const date = dateKey(r.start);
    const v = number(r.value);
    if (v == null) continue;
    const m = get(date);
    switch (r.type) {
      case 'HKQuantityTypeIdentifierStepCount':
        m.steps += v;
        break;
      case 'HKQuantityTypeIdentifierActiveEnergyBurned':
        m.activeCalories += v;
        break;
      case 'HKQuantityTypeIdentifierBasalEnergyBurned':
        m.totalCalories += v;
        break;
      case 'HKQuantityTypeIdentifierAppleExerciseTime':
        m.exerciseMinutes += unitToMinutes(v, r.unit);
        break;
      case 'HKQuantityTypeIdentifierAppleTimeInDaylight':
        m.daylightMinutes += unitToMinutes(v, r.unit);
        break;
      case 'HKQuantityTypeIdentifierDietaryWater':
        m.hydrationMl += (r.unit ?? '').toLowerCase().includes('l') && !(r.unit ?? '').toLowerCase().includes('ml') ? v * 1000 : v;
        break;
      case 'HKQuantityTypeIdentifierDietaryCaffeine':
        m.caffeineMg += v;
        break;
      case 'HKQuantityTypeIdentifierDietaryAlcohol':
        m.alcoholGrams += v;
        break;
      case 'HKQuantityTypeIdentifierHeartRate': {
        const minute = r.start.getHours() * 60 + r.start.getMinutes();
        const bucket = Math.floor(minute / 10) * 10;
        let day = buckets.get(date);
        if (!day) {
          day = new Map();
          buckets.set(date, day);
        }
        const b = day.get(bucket) ?? { sum: 0, n: 0 };
        b.sum += v;
        b.n += 1;
        day.set(bucket, b);
        break;
      }
      default:
        break;
    }
  }

  for (const [date, day] of buckets) {
    const m = get(date);
    const samples: HeartRateSample[] = [...day.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([minute, v]) => ({ minute, bpm: Math.round(v.sum / v.n) }));
    m.hrSamples = samples;
    m.wearMinutes = Math.min(1440, samples.length * 10);
  }

  for (const m of out.values()) {
    m.steps = Math.round(m.steps);
    m.activeCalories = Math.round(m.activeCalories);
    m.totalCalories = Math.round(m.totalCalories + m.activeCalories);
    m.exerciseMinutes = Math.round(m.exerciseMinutes);
    m.daylightMinutes = Math.round(m.daylightMinutes);
    m.hydrationMl = Math.round(m.hydrationMl);
    m.caffeineMg = Math.round(m.caffeineMg);
    m.alcoholGrams = Math.round(m.alcoholGrams);
  }
  return out;
}

function workoutsFor(records: WorkoutRecord[], hrByDate: Map<string, HeartRateSample[]>): Workout[] {
  return records.map((w, i) => {
    const date = dateKey(w.start);
    const samples = hrByDate.get(date) ?? [];
    const startMin = w.start.getHours() * 60 + w.start.getMinutes();
    const zoneMinutes: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    for (const s of samples) {
      if (s.minute < startMin || s.minute > startMin + w.durationMin) continue;
      const zone = edwardsZoneWeight(s.bpm, 55, 190);
      zoneMinutes[zone] += 10;
    }
    if (!zoneMinutes.some((m) => m > 0)) {
      const zone = w.avgHr ? edwardsZoneWeight(w.avgHr, 55, 190) : 2;
      zoneMinutes[zone] = Math.max(1, Math.round(w.durationMin));
    }
    return {
      id: `workout-apple-${date}-${i}`,
      kind: w.kind,
      name: w.kind === 'strength' ? 'Strength training' : `${w.kind[0].toUpperCase()}${w.kind.slice(1)}`,
      date,
      start: w.start.toISOString(),
      durationMin: Math.round(w.durationMin),
      distanceKm: w.distanceKm != null ? round(w.distanceKm, 2) : null,
      avgHr: w.avgHr != null ? Math.round(w.avgHr) : null,
      maxHr: w.maxHr != null ? Math.round(w.maxHr) : null,
      calories: w.calories != null ? Math.round(w.calories) : null,
      strain: round(strainFromTrimp(workoutTrimp(zoneMinutes)), 1),
      source: w.source,
      imported: true,
      zoneMinutes,
    };
  });
}

function mealsFor(
  records: Array<{ type: string; source: string; start: Date; end: Date; value: string; unit?: string }>,
  cutoff: Date,
): Map<string, MealEntry[]> {
  const totals = new Map<string, { calories: number; protein: number; carbs: number; fat: number; fiber: number }>();
  for (const r of records) {
    if (r.start < cutoff) continue;
    const v = number(r.value);
    if (v == null) continue;
    const date = dateKey(r.start);
    const t = totals.get(date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    if (r.type === 'HKQuantityTypeIdentifierDietaryEnergyConsumed') t.calories += v;
    if (r.type === 'HKQuantityTypeIdentifierDietaryProtein') t.protein += v;
    if (r.type === 'HKQuantityTypeIdentifierDietaryCarbohydrates') t.carbs += v;
    if (r.type === 'HKQuantityTypeIdentifierDietaryFatTotal') t.fat += v;
    if (r.type === 'HKQuantityTypeIdentifierDietaryFiber') t.fiber += v;
    totals.set(date, t);
  }
  const out = new Map<string, MealEntry[]>();
  for (const [date, t] of totals) {
    if (t.calories <= 0 && t.protein <= 0 && t.carbs <= 0 && t.fat <= 0) continue;
    out.set(date, [
      {
        id: `meal-apple-${date}`,
        name: 'Apple Health nutrition import',
        date,
        time: '12:00',
        calories: Math.round(t.calories),
        proteinG: Math.round(t.protein),
        carbsG: Math.round(t.carbs),
        fatG: Math.round(t.fat),
        fiberG: Math.round(t.fiber),
        vegGrams: 0,
        fruitCups: 0,
        wholeGrainServings: 0,
        healthyOilPctOfCalories: 0,
        nutsGrams: 0,
        omega3Mg: 0,
        redMeatGrams: 0,
        processedMeatGrams: 0,
        alcoholGrams: 0,
        sodiumMg: 0,
        addedSugarG: 0,
        source: 'imported',
        emoji: '🍎',
        loggedVia: 'custom',
      },
    ]);
  }
  return out;
}

/** Extract export.xml from a ZIP or decode a plain XML export. */
export function extractAppleHealthXml(data: ArrayBuffer, name: string): string {
  const bytes = new Uint8Array(data);
  const looksZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (looksZip || name.toLowerCase().endsWith('.zip')) {
    const files = unzipSync(bytes, { filter: (f) => f.name.toLowerCase().endsWith('export.xml') });
    const key = Object.keys(files).sort((a, b) => a.length - b.length)[0];
    if (!key) throw new Error('This ZIP does not contain an Apple Health export.xml file.');
    return strFromU8(files[key]);
  }
  return strFromU8(bytes);
}

export function parseAppleHealthXml(xml: string, now = new Date()): AppleHealthImport {
  const parsed = parseXml(xml);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - MAX_IMPORT_DAYS);
  const sessions = sleepSessions(parsed.records).filter((s) => new Date(`${s.date}T12:00:00`) >= cutoff);
  const metrics = dailyMetrics(parsed.records, cutoff);
  const hrByDate = new Map<string, HeartRateSample[]>();
  for (const [date, m] of metrics) hrByDate.set(date, m.hrSamples);
  const workouts = workoutsFor(parsed.workouts.filter((w) => w.start >= cutoff), hrByDate);
  const meals = mealsFor(parsed.records, cutoff);

  const dates = new Set<string>([...metrics.keys(), ...sessions.map((s) => s.date), ...workouts.map((w) => w.date), ...meals.keys()]);
  const dayOrder = [...dates].sort();
  const days: DayRecord[] = dayOrder.map((date) => ({
    date,
    sleep: sessions.find((s) => s.date === date) ?? null,
    metrics: metrics.get(date) ?? {
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
    workouts: workouts.filter((w) => w.date === date),
    meals: meals.get(date) ?? [],
    journal: [],
  }));

  return {
    days,
    dayOrder,
    summary: {
      days: days.length,
      sleepSessions: sessions.length,
      workouts: workouts.length,
      meals: [...meals.values()].reduce((a, m) => a + m.length, 0),
      firstDate: dayOrder[0] ?? null,
      lastDate: dayOrder[dayOrder.length - 1] ?? null,
      skippedRecords: parsed.skipped,
    },
  };
}

export async function importAppleHealthFile(file: File, now = new Date()): Promise<AppleHealthImport> {
  if (file.size > 300 * 1024 * 1024) throw new Error('This export is larger than 300 MB. Export a shorter date range from Apple Health and try again.');
  const xml = extractAppleHealthXml(await file.arrayBuffer(), file.name);
  if (!xml.includes('<HealthData')) throw new Error('This file does not look like an Apple Health export.');
  const result = parseAppleHealthXml(xml, now);
  if (!result.days.length) throw new Error('No health records were found in this export.');
  return result;
}
