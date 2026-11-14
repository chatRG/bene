import type { DayRecord, HeartRateSample, Workout } from '../types';
import { clamp, mean } from '../math';
import type { ZoneConfig } from './zones';
import { estimatedMaxHr, workoutTrimp, zoneIndex } from './zones';

export interface StrainResult {
  score: number;
  activeTrimp: number;
  passiveTrimp: number;
  target: number;
  normLow: number;
  normHigh: number;
  status: 'below' | 'within' | 'above';
  label: string;
}

/**
 * NOOP's logarithmic Effort map: 100 × ln(TRIMP + 1) / ln(7201).
 * The denominator is the Edwards daily ceiling (top zone weight 5
 * sustained for 24 h = 7200), so a theoretical maximum day maps to 100.
 * Values are deliberately not clamped at 100.
 */
export const STRAIN_DENOMINATOR = 7201;

export function strainFromTrimp(trimp: number): number {
  if (trimp <= 0) return 0;
  return (100 * Math.log(trimp + 1)) / Math.log(STRAIN_DENOMINATOR);
}

/**
 * Edwards-style zone weight 0–5 on %heart-rate reserve, as used by NOOP's
 * StrainScorer. Thresholds are 50/60/70/80/90 %HRR.
 */
export function edwardsZoneWeight(bpm: number, restingHr: number, maxHr: number): number {
  const reserve = maxHr - restingHr;
  if (reserve <= 0) return 0;
  const pct = ((bpm - restingHr) / reserve) * 100;
  if (pct >= 90) return 5;
  if (pct >= 80) return 4;
  if (pct >= 70) return 3;
  if (pct >= 60) return 2;
  if (pct >= 50) return 1;
  return 0;
}

/** Background load: HR outside logged workout windows, weighted by Edwards zone. */
export function passiveTrimp(
  hrSamples: HeartRateSample[],
  restingHr: number,
  upToMinute = 1440,
  maxHr = 190,
  sampleMinutes = 10,
): number {
  let trimp = 0;
  for (const s of hrSamples) {
    if (s.minute > upToMinute) continue;
    trimp += edwardsZoneWeight(s.bpm, restingHr, maxHr) * sampleMinutes;
  }
  return trimp;
}

/** Documented direction: better recovery raises the target. The mapping is a
 *  transparent community model (Bevel does not publish its weights); it lands
 *  recovery 41 at a target of ~51, matching the reference normal range 34–67. */
export function targetStrain(recovery: number | null, _recentAverage = 50): number {
  const target = recovery == null ? 50 : 24 + recovery * 0.65;
  return Math.round(clamp(target, 20, 95));
}

function workoutStartMinute(w: Workout): number {
  const d = new Date(w.start);
  return d.getHours() * 60 + d.getMinutes();
}

function isInsideWorkout(minute: number, workouts: Workout[]): boolean {
  return workouts.some((w) => {
    const start = workoutStartMinute(w);
    return minute >= start && minute <= start + w.durationMin;
  });
}

export function computeStrain(input: {
  workouts: Workout[];
  hrSamples: HeartRateSample[];
  restingHr: number;
  recovery: number | null;
  recentStrainAvg: number;
  recentStrainRange: number[];
  age?: number;
  maxHr?: number;
  nowMinute?: number;
  sampleMinutes?: number;
}): StrainResult {
  const maxHr = input.maxHr ?? estimatedMaxHr(input.age ?? 30);
  const upTo = input.nowMinute ?? 1440;
  const sampleMinutes = input.sampleMinutes ?? 10;
  const active = input.workouts.reduce((acc, w) => acc + workoutTrimp(w.zoneMinutes), 0);
  let passive = 0;
  for (const s of input.hrSamples) {
    if (s.minute > upTo) continue;
    if (isInsideWorkout(s.minute, input.workouts)) continue;
    passive += edwardsZoneWeight(s.bpm, input.restingHr, maxHr) * sampleMinutes;
  }
  const total = active + passive;
  const score = strainFromTrimp(total);
  const target = targetStrain(input.recovery, input.recentStrainAvg);
  const normLow = Math.round(clamp(target - 16, 10, 95));
  const normHigh = Math.round(clamp(target + 16, 25, 110));
  const rounded = Math.round(score * 10) / 10;
  const status = rounded < normLow ? 'below' : rounded > normHigh ? 'above' : 'within';
  return {
    score: rounded,
    activeTrimp: Math.round(active),
    passiveTrimp: Math.round(passive),
    target,
    normLow,
    normHigh,
    status,
    label: status === 'below' ? 'Below normal range' : status === 'above' ? 'Above normal range' : 'Normal range',
  };
}

export function exerciseDurationMin(workouts: Workout[]): number {
  return workouts.reduce((acc, w) => acc + w.durationMin, 0);
}

export function strainSeriesForDay(
  hrSamples: HeartRateSample[],
  workouts: Workout[],
  restingHr: number,
  _config: ZoneConfig,
  age = 30,
  sampleMinutes = 10,
) {
  const maxHr = estimatedMaxHr(age);
  const points: { minute: number; value: number }[] = [];
  let passive = 0;
  let active = 0;
  const added = new Set<string>();
  for (const w of workouts) {
    const start = workoutStartMinute(w);
    if (!added.has(w.id)) {
      active += workoutTrimp(w.zoneMinutes);
      added.add(w.id);
    }
    if (start === 0) continue;
  }
  for (const s of hrSamples) {
    if (!isInsideWorkout(s.minute, workouts)) {
      passive += edwardsZoneWeight(s.bpm, restingHr, maxHr) * sampleMinutes;
    }
    points.push({ minute: s.minute, value: Math.round(strainFromTrimp(active + passive) * 10) / 10 });
  }
  return points;
}

export function daytimeAverageHr(samples: HeartRateSample[], fromMinute = 6 * 60, toMinute = 22 * 60): number | null {
  const xs = samples.filter((s) => s.minute >= fromMinute && s.minute <= toMinute).map((s) => s.bpm);
  return xs.length ? Math.round(mean(xs)) : null;
}

export function hrZoneDistribution(workouts: Workout[], samples: HeartRateSample[], config: ZoneConfig): number[] {
  const mins = [0, 0, 0, 0, 0, 0];
  for (const w of workouts) w.zoneMinutes.forEach((m, i) => (mins[i] += m));
  if (!workouts.length) {
    for (const s of samples) mins[zoneIndex(s.bpm, config)] += 5;
  }
  return mins;
}

export function dayStrainForRecords(days: Record<string, DayRecord>, order: string[], _config: ZoneConfig, uptoIndex: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, uptoIndex - 28); i < uptoIndex; i++) {
    const d = days[order[i]];
    if (!d) continue;
    const active = d.workouts.reduce((a, w) => a + workoutTrimp(w.zoneMinutes), 0);
    const passive = passiveTrimp(d.metrics.hrSamples, 55, 1440, 190, 10);
    out.push(Math.round(strainFromTrimp(active + passive)));
  }
  return out;
}
