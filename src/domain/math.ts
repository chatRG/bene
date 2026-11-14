import type { Biomarker, DayRecord, MuscleGroup, Sex, SleepSession, StageTotals, Workout } from './types';

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const round = (v: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const std = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function stageTotals(sleep: SleepSession): StageTotals {
  const t: StageTotals = { awakeMin: 0, remMin: 0, coreMin: 0, deepMin: 0, asleepMin: 0, inBedMin: 0 };
  for (const b of sleep.stages) {
    const d = Math.max(0, b.endMin - b.startMin);
    if (b.stage === 'awake') t.awakeMin += d;
    if (b.stage === 'rem') t.remMin += d;
    if (b.stage === 'core') t.coreMin += d;
    if (b.stage === 'deep') t.deepMin += d;
  }
  t.inBedMin = Math.round(t.awakeMin + t.remMin + t.coreMin + t.deepMin);
  t.asleepMin = Math.round(t.remMin + t.coreMin + t.deepMin);
  t.awakeMin = Math.round(t.awakeMin);
  t.remMin = Math.round(t.remMin);
  t.coreMin = Math.round(t.coreMin);
  t.deepMin = Math.round(t.deepMin);
  return t;
}

export function minutesToLabel(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return `${h}h ${r}m`;
}

export function ageFromBirthDate(birthDate: string, onDate: string): number {
  const b = new Date(`${birthDate}T12:00:00`);
  const d = new Date(`${onDate}T12:00:00`);
  let age = d.getFullYear() - b.getFullYear();
  const beforeBirthday = d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  const yearFraction = (d.getTime() - new Date(`${d.getFullYear()}-${String(b.getMonth() + 1).padStart(2, '0')}-${String(b.getDate()).padStart(2, '0')}T12:00:00`).getTime()) / (365.25 * 86400000);
  return age + Math.max(0, Math.min(1, yearFraction));
}

export function workoutsOn(days: Record<string, DayRecord>, date: string): Workout[] {
  return days[date]?.workouts ?? [];
}

export function allWorkouts(days: Record<string, DayRecord>, order: string[], daysBack = 42, beforeDate?: string): Workout[] {
  const cutoff = beforeDate ? order.indexOf(beforeDate) : order.length;
  const start = Math.max(0, cutoff - daysBack);
  const out: Workout[] = [];
  for (let i = start; i < cutoff; i++) out.push(...(days[order[i]]?.workouts ?? []));
  return out;
}

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
};

export type PhenoMarkerKey =
  | 'albumin'
  | 'creatinine'
  | 'glucose'
  | 'crp'
  | 'lymphocyte'
  | 'mcv'
  | 'rdw'
  | 'alp'
  | 'wbc';

export const PHENO_MARKERS: { key: PhenoMarkerKey; name: string; unit: string }[] = [
  { key: 'albumin', name: 'Albumin', unit: 'g/L' },
  { key: 'creatinine', name: 'Creatinine', unit: 'mg/dL' },
  { key: 'glucose', name: 'Glucose', unit: 'mg/dL' },
  { key: 'crp', name: 'hs-CRP', unit: 'mg/L' },
  { key: 'lymphocyte', name: 'Lymphocyte %', unit: '%' },
  { key: 'mcv', name: 'MCV', unit: 'fL' },
  { key: 'rdw', name: 'RDW', unit: '%' },
  { key: 'alp', name: 'Alkaline phosphatase', unit: 'U/L' },
  { key: 'wbc', name: 'White blood cells', unit: '10³/µL' },
];

export function phenoMarkers(biomarkers: Biomarker[]): Partial<Record<PhenoMarkerKey, number>> {
  const out: Partial<Record<PhenoMarkerKey, number>> = {};
  for (const m of biomarkers) {
    const key = m.id as PhenoMarkerKey;
    if (PHENO_MARKERS.some((p) => p.key === key)) out[key] = m.value;
  }
  return out;
}

export function sexFromProfile(sex: Sex): Sex {
  return sex;
}
