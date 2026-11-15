import type { Biomarker, DayRecord, UserProfile } from '../types';
import { clamp, mean, phenoMarkers, round, sum } from '../math';
import { stageTotals } from '../math';

export interface AgeContributor {
  key: 'sleep' | 'activity' | 'fitness' | 'bloodwork';
  label: string;
  years: number; // negative = younger
  detail: string;
  /** False when the term falls back to the age median because no measurement exists. */
  measured?: boolean;
}

export interface BiologicalAgeResult {
  status: 'scored' | 'calibrating';
  age: number | null;
  chronologicalAge: number;
  deltaYears: number;
  confidence: number;
  confidenceLabel: string;
  contributors: AgeContributor[];
  nextUpdateDays: number;
  markerDelta: number;
  updatedAt: string;
}

export const OPTIMAL = {
  steps: { under60: 8000, over60: 6000 },
  zone2MinPerWeek: 150,
  zone45MinPerWeek: 10,
  strengthMinPerWeek: 10,
};

/** Marker deviation in years. Positive = older. All markers are framed so that
 *  landing inside the optimal band contributes 0; direction is encoded in `penaltySign`. */
const MARKER_DIRECTION: Record<string, 1 | -1> = {
  albumin: -1,
  creatinine: 1,
  glucose: 1,
  crp: 1,
  lymphocyte: -1,
  mcv: 1,
  rdw: 1,
  alp: 1,
  wbc: 1,
};

export function markerAgeDelta(biomarkers: Biomarker[]): number {
  let years = 0;
  for (const b of biomarkers) {
    if (!b.phenoAge) continue;
    const sign = MARKER_DIRECTION[b.id] ?? 1;
    const mid = (b.optimalLow + b.optimalHigh) / 2;
    const spread = Math.max(0.0001, (b.optimalHigh - b.optimalLow) / 2);
    const deviation = (b.value - mid) / spread;
    const outside = Math.abs(deviation) > 1 ? Math.abs(deviation) - 1 : 0;
    years += sign * Math.sign(b.value - mid) * outside * 0.28;
  }
  return clamp(round(years, 2), -5, 5);
}

export function lifestyleYears(days: DayRecord[], chronologicalAge: number, vo2max: number | null) {
  const recent = days.slice(-28);
  const sleepScores: number[] = [];
  let steps = 0;
  let zone2 = 0;
  let strength = 0;
  for (const d of recent) {
    if (d.sleep) {
      const t = stageTotals(d.sleep);
      // Rough score proxy for the lifestyle model: duration + stage balance.
      sleepScores.push(clamp((t.asleepMin / 480) * 80 + ((t.deepMin + t.remMin) / Math.max(1, t.asleepMin)) * 40, 40, 100));
    }
    steps += d.metrics.steps;
    zone2 += d.workouts.reduce((a, w) => a + w.zoneMinutes[2] + w.zoneMinutes[3], 0);
    strength += d.workouts.filter((w) => (w.exercises?.length ?? 0) > 0).length * 30;
  }
  const n = Math.max(1, recent.length);
  const avgSleep = sleepScores.length ? mean(sleepScores) : 70;
  const avgSteps = steps / n;
  const weeklyZone2 = (zone2 / n) * 7;
  const weeklyStrength = (strength / n) * 7;
  const stepTarget = chronologicalAge >= 60 ? OPTIMAL.steps.over60 : OPTIMAL.steps.under60;

  const sleepYears = clamp(((avgSleep - 95) / 6) * 1.0, -2.5, 3);
  const activityYears = clamp(((stepTarget - avgSteps) / 1000) * 0.93 + ((OPTIMAL.zone2MinPerWeek - weeklyZone2) / 60) * 0.3, -2.5, 3.5);
  const medianVo2 = chronologicalAge < 30 ? 45 : chronologicalAge < 40 ? 42 : chronologicalAge < 50 ? 38 : 33;
  const fitnessYears = clamp(((medianVo2 - (vo2max ?? medianVo2)) / 4) * 2 + ((OPTIMAL.strengthMinPerWeek - weeklyStrength) / 30) * 0.3, -3.5, 3);

  const contributorDetails = {
    sleep: `${Math.round(avgSleep)} sleep score avg`,
    activity: `${Math.round(avgSteps).toLocaleString()} steps/day · ${Math.round(weeklyZone2)} min Zone 2–3/wk`,
    fitness: vo2max != null ? `VO₂ max ${Math.round(vo2max)}` : 'No VO₂ max measured',
    bloodwork: '9 PhenoAge markers',
  };
  return {
    sleepYears: round(sleepYears, 2),
    activityYears: round(activityYears, 2),
    fitnessYears: round(fitnessYears, 2),
    avgSleep,
    avgSteps,
    weeklyZone2,
    details: contributorDetails,
  };
}

export function biologicalAge(input: {
  profile: UserProfile;
  chronologicalAge: number;
  days: DayRecord[];
  biomarkers: Biomarker[];
  vo2max: number | null;
  today: string;
  lastLabDaysAgo: number | null;
}): BiologicalAgeResult {
  const markers = phenoMarkers(input.biomarkers);
  const markerCount = Object.keys(markers).length;
  const wearDays = input.days.filter((d) => d.metrics.wearMinutes > 600).length;
  const markerDelta = markerAgeDelta(input.biomarkers);
  const life = lifestyleYears(input.days, input.chronologicalAge, input.vo2max);
  const delta = round(markerDelta + life.sleepYears + life.activityYears + life.fitnessYears, 2);
  const confidence = Math.round(
    clamp(
      30 + markerCount * 4 + Math.min(15, wearDays / 2) + (input.lastLabDaysAgo != null && input.lastLabDaysAgo <= 120 ? 4 : 0),
      20,
      98,
    ),
  );
  const status = markerCount >= 7 && wearDays >= 7 ? 'scored' : 'calibrating';
  const nextMonday = nextMondayDays(input.today);

  return {
    status,
    age: status === 'scored' ? round(input.chronologicalAge + delta, 1) : null,
    chronologicalAge: round(input.chronologicalAge, 1),
    deltaYears: round(delta, 1),
    confidence,
    confidenceLabel:
      confidence >= 80
        ? 'Model estimate, not a lab result — taps open the inputs'
        : confidence >= 55
          ? 'More wearable data would narrow the range'
          : 'Wide range — add recent bloodwork or more nights of data',
    contributors: [
      { key: 'sleep', label: 'Sleep', years: life.sleepYears, detail: life.details.sleep },
      { key: 'activity', label: 'Activity', years: life.activityYears, detail: life.details.activity },
      { key: 'fitness', label: 'Fitness', years: life.fitnessYears, detail: life.details.fitness, measured: input.vo2max != null },
      { key: 'bloodwork', label: 'Bloodwork', years: markerDelta, detail: life.details.bloodwork },
    ],
    nextUpdateDays: nextMonday,
    markerDelta,
    updatedAt: input.today,
  };
}

export function nextMondayDays(today: string): number {
  const d = new Date(`${today}T12:00:00`);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const days = (8 - day) % 7 || 7;
  return days;
}

export function biomarkerStatus(b: Biomarker): 'optimal' | 'borderline' | 'out' {
  if (b.value >= b.optimalLow && b.value <= b.optimalHigh) return 'optimal';
  const span = Math.max(0.001, b.optimalHigh - b.optimalLow);
  const distance = b.value < b.optimalLow ? b.optimalLow - b.value : b.value - b.optimalHigh;
  return distance <= span * 0.25 ? 'borderline' : 'out';
}

export function sumContributors(contributors: AgeContributor[]): number {
  return round(sum(contributors.map((c) => c.years)), 1);
}

/**
 * Uth–Sørensen: VO₂ max ≈ 15.3 × HRmax / HRrest.
 * Needs a measured peak heart rate (workouts) and a measured resting heart rate
 * (overnight sleep). With no measured pair there is no estimate — the caller
 * must fall back to the population median rather than invent a value.
 */
export function vo2MaxFromDays(days: DayRecord[]): number | null {
  const restingSamples = days
    .map((d) => d.sleep?.rhrBpm)
    .filter((bpm): bpm is number => bpm != null && Number.isFinite(bpm) && bpm > 0)
    .slice(-14);
  const maxHrSamples = days
    .flatMap((d) => d.workouts)
    .map((w) => w.maxHr)
    .filter((bpm): bpm is number => bpm != null && Number.isFinite(bpm) && bpm > 0);
  if (restingSamples.length === 0 || maxHrSamples.length === 0) return null;

  const estimate = 15.3 * (Math.max(...maxHrSamples) / mean(restingSamples));
  // Outside this range the pair is not a usable measurement (e.g. HRmax from a
  // wrist sensor that never saw a hard effort). Do not clamp it into looking valid.
  if (!Number.isFinite(estimate) || estimate < 15 || estimate > 90) return null;
  return round(estimate, 1);
}
