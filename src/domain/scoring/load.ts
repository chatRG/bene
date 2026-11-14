import type { DayRecord, Workout } from '../types';
import { clamp, mean } from '../math';
import type { ZoneConfig } from './zones';
import { workoutTrimp } from './zones';

export interface StressSummary {
  current: number;
  high: number;
  low: number;
  average: number;
  status: 'scored' | 'calibrating';
  energyBank: number;
  energyLabel: string;
}

export function stressFromHr(hr: number, restingHr: number, daytimeHrv: number | null, hrvBaseline: number): number {
  const hrLoad = (hr - restingHr - 12) * 1.15;
  const hrvLoad = daytimeHrv != null ? (hrvBaseline - daytimeHrv) * 0.9 : 0;
  return Math.round(clamp(45 + hrLoad + hrvLoad, 0, 100));
}

export function stressSummary(
  samples: { minute: number; score: number }[],
  opts: { daysOfBaseline: number; sleepScore: number | null },
): StressSummary {
  const scored = opts.daysOfBaseline >= 30;
  const values = samples.map((s) => s.score);
  const current = values.length ? values[values.length - 1] : 0;
  const high = values.length ? Math.max(...values) : 0;
  const low = values.length ? Math.min(...values) : 0;
  const average = Math.round(mean(values));
  const exposure = values.reduce((a, v) => a + Math.max(0, v - 45), 0) / Math.max(1, values.length);
  const sleepCredit = ((opts.sleepScore ?? 60) - 50) * 0.5;
  const energyBank = Math.round(clamp(72 - exposure * 0.9 + sleepCredit, 0, 100));
  const energyLabel = energyBank >= 70 ? 'Charged' : energyBank >= 45 ? 'Steady' : energyBank >= 25 ? 'Running low' : 'Drained';
  return {
    current,
    high,
    low,
    average,
    status: scored ? 'scored' : 'calibrating',
    energyBank,
    energyLabel,
  };
}

export function buildStressSamples(hr: { minute: number; bpm: number }[], restingHr: number, daytimeHrv: number | null, hrvBaseline: number) {
  return hr
    .filter((s) => s.minute >= 6 * 60 && s.minute <= 23 * 60)
    .map((s) => ({ minute: s.minute, score: stressFromHr(s.bpm, restingHr, daytimeHrv, hrvBaseline) }));
}

export type CardioStatus =
  | 'Calibrating'
  | 'Detraining'
  | 'Maintaining'
  | 'Productive'
  | 'Peaking'
  | 'Fatigued'
  | 'Overtraining';

export interface CardioLoad {
  status: CardioStatus;
  acute: number;
  chronic: number;
  ratio: number;
  qualifyingDays: number;
  focus: number[];
  calibrationPct: number;
}

export function computeCardioLoad(workouts: Workout[], days: Record<string, DayRecord>, dayOrder: string[], todayIndex: number, _config: ZoneConfig): CardioLoad {
  const qualifying = new Set<string>();
  const dailyTrimp: number[] = [];
  for (let i = Math.max(0, todayIndex - 41); i <= todayIndex; i++) {
    const d = days[dayOrder[i]];
    if (!d) continue;
    const trimp = d.workouts.reduce((a, w) => a + workoutTrimp(w.zoneMinutes), 0);
    dailyTrimp.push(trimp);
    if (d.workouts.some((w) => w.durationMin >= 20)) qualifying.add(d.date);
  }
  const ewma = (values: number[], span: number) => {
    const alpha = 2 / (span + 1);
    let v = values[0] ?? 0;
    for (const x of values) v = x * alpha + v * (1 - alpha);
    return v;
  };
  const acute = ewma(dailyTrimp.slice(-7), 7);
  const chronic = ewma(dailyTrimp, 42);
  const ratio = chronic > 0 ? acute / chronic : 0;
  let status: CardioStatus = 'Calibrating';
  if (qualifying.size >= 10) {
    if (ratio < 0.75) status = 'Detraining';
    else if (ratio < 1.05) status = 'Maintaining';
    else if (ratio < 1.25) status = 'Productive';
    else if (ratio < 1.45) status = 'Peaking';
    else if (ratio < 1.7) status = 'Fatigued';
    else status = 'Overtraining';
  }
  const focusMins = [0, 0, 0, 0, 0, 0];
  for (const w of workouts) w.zoneMinutes.forEach((m, i) => (focusMins[i] += m));
  // Cardio Focus groups: low aerobic (Z1–Z2), high aerobic (Z3), anaerobic (Z4–Z5).
  const lowAerobic = focusMins[1] + focusMins[2];
  const highAerobic = focusMins[3];
  const anaerobic = focusMins[4] + focusMins[5];
  const focusTotal = lowAerobic + highAerobic + anaerobic || 1;
  return {
    status,
    acute: Math.round(acute),
    chronic: Math.round(chronic),
    ratio: Math.round(ratio * 100) / 100,
    qualifyingDays: qualifying.size,
    focus: [Math.round((lowAerobic / focusTotal) * 100), Math.round((highAerobic / focusTotal) * 100), Math.round((anaerobic / focusTotal) * 100)],
    calibrationPct: Math.min(100, Math.round((qualifying.size / 10) * 100)),
  };
}

export interface MuscleFreshness {
  muscle: string;
  pct: number;
  band: 'Recovered' | 'Fatigued' | 'Depleted' | 'Calibrating';
  lastTrainedDays: number | null;
  trainingDays: number;
}

/** Documented bands, with the vendor's 75% overlap resolved to Recovered. */
export function freshnessBand(pct: number, trainingDays: number): MuscleFreshness['band'] {
  if (trainingDays < 3) return 'Calibrating';
  if (pct >= 75) return 'Recovered';
  if (pct >= 35) return 'Fatigued';
  return 'Depleted';
}

const DECAY_HOURS = 52;

export function muscleFreshness(
  workouts: Workout[],
  now: Date,
  _order: string[],
): MuscleFreshness[] {
  const muscles = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'] as const;
  return muscles.map((muscle) => {
    const relevant = workouts.filter((w) => w.exercises?.some((e) => e.muscle === muscle));
    const trainingDays = new Set(relevant.map((w) => w.date)).size;
    let fatigue = 0;
    let last: number | null = null;
    for (const w of relevant) {
      const hours = Math.max(0, (now.getTime() - new Date(w.start).getTime()) / 3600000);
      last = last == null ? hours : Math.min(last, hours);
      const load = (w.exercises ?? [])
        .filter((e) => e.muscle === muscle)
        .reduce((acc, e) => acc + e.sets.reduce((s, set) => s + set.reps * Math.max(5, set.weightKg) * 0.06 + set.rpe * 1.2, 0), 0);
      fatigue += load * Math.exp(-hours / DECAY_HOURS);
    }
    const pct = Math.round(clamp(100 - fatigue, 0, 100));
    const band = freshnessBand(pct, trainingDays);
    return {
      muscle,
      pct,
      band,
      lastTrainedDays: last == null ? null : Math.floor(last / 24),
      trainingDays,
    };
  });
}

export function muscleLoadStatus(workouts: Workout[], days: Record<string, DayRecord>, order: string[], todayIndex: number) {
  const qualifying = new Set<string>();
  for (let i = Math.max(0, todayIndex - 41); i <= todayIndex; i++) {
    const d = days[order[i]];
    if (d?.workouts.some((w) => (w.exercises?.length ?? 0) > 0)) qualifying.add(d.date);
  }
  const weekly = workouts.slice(-7).reduce((a, w) => a + (w.exercises?.reduce((x, e) => x + e.sets.length, 0) ?? 0), 0);
  return { status: qualifying.size >= 10 ? (weekly >= 6 ? 'Productive' : 'Maintaining') : 'Calibrating', trainingDays: qualifying.size, weeklySets: weekly };
}
