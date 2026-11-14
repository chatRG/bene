import type { DayRecord, HeartRateSample, Workout } from '../types';
import { clamp, mean } from '../math';
import type { ZoneConfig } from './zones';
import { workoutTrimp, zoneIndex } from './zones';

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

/** Logarithmic strain curve — activity does not add linearly, and values may exceed 100. */
export function strainFromTrimp(trimp: number): number {
  if (trimp <= 0) return 0;
  return 30 * Math.log(1 + trimp / 55);
}

export function passiveTrimp(hrSamples: HeartRateSample[], restingHr: number, upToMinute = 1440): number {
  let trimp = 0;
  for (const s of hrSamples) {
    if (s.minute > upToMinute) continue;
    const above = Math.max(0, s.bpm - restingHr - 4);
    // 5-minute samples; low-intensity background load accumulates slowly.
    trimp += above * 0.045;
  }
  return trimp;
}

export function targetStrain(recovery: number | null, recentAverage: number): number {
  const base = recovery == null ? 50 : 18 + recovery * 0.62;
  const adjusted = base + (recentAverage - 50) * 0.12;
  return Math.round(clamp(adjusted, 20, 95));
}

export function computeStrain(input: {
  workouts: Workout[];
  hrSamples: HeartRateSample[];
  restingHr: number;
  recovery: number | null;
  recentStrainAvg: number;
  recentStrainRange: number[];
  nowMinute?: number;
}): StrainResult {
  const active = input.workouts.reduce((acc, w) => acc + workoutTrimp(w.zoneMinutes), 0);
  const passive = passiveTrimp(input.hrSamples, input.restingHr, input.nowMinute ?? 1440);
  const score = strainFromTrimp(active + passive);
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

export function strainSeriesForDay(hrSamples: HeartRateSample[], workouts: Workout[], restingHr: number, _config: ZoneConfig) {
  // Build a cumulative strain curve through the day from HR samples, adding workout TRIMP.
  const points: { minute: number; value: number }[] = [];
  let passive = 0;
  const workoutByMinute = new Map<number, number>();
  for (const w of workouts) {
    const start = new Date(w.start);
    const minute = start.getHours() * 60 + start.getMinutes();
    workoutByMinute.set(minute, (workoutByMinute.get(minute) ?? 0) + workoutTrimp(w.zoneMinutes));
  }
  let active = 0;
  for (const s of hrSamples) {
    const above = Math.max(0, s.bpm - restingHr - 4);
    passive += above * 0.045;
    if (workoutByMinute.has(s.minute)) active += workoutByMinute.get(s.minute)!;
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
    const passive = passiveTrimp(d.metrics.hrSamples, 55);
    out.push(Math.round(strainFromTrimp(active + passive)));
  }
  return out;
}
