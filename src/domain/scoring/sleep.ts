import type { SleepSession, Sex, StageTotals } from '../types';
import { clamp, round, stageTotals } from '../math';

export interface SleepScoreResult {
  score: number;
  status: 'scored' | 'insufficient';
  totals: StageTotals;
  efficiency: number;
  deepPct: number;
  remPct: number;
  awakePct: number;
  durationScore: number;
  stageScore: number;
  efficiencyScore: number;
  continuityScore: number;
  dipScore: number;
  needMin: number;
}

/** Published deep-sleep target curve: 13% → 9% (male), 14% → 10% (female), ages 30 → 70+. */
export function deepSleepTargetPct(age: number, sex: Sex): number {
  const a = clamp(age, 30, 70);
  const t = (a - 30) / 40;
  const start = sex === 'female' ? 14 : 13;
  const end = sex === 'female' ? 10 : 9;
  return start + (end - start) * t;
}

export function remTargetPct(): number {
  return 22;
}

export function sleepNeedMinutes(input: {
  age: number;
  sex: Sex;
  recentDebtMin: number;
  yesterdayStrain: number;
  sleepGoalMin: number;
}): number {
  const base = input.sleepGoalMin;
  const debtRepayment = clamp(input.recentDebtMin * 0.22, -12, 75);
  const strainTopUp = clamp((input.yesterdayStrain - 55) * 0.7, -20, 40);
  const ageAdjust = input.age >= 60 ? -15 : input.age >= 45 ? -5 : 0;
  return Math.round(clamp(base + debtRepayment + strainTopUp + ageAdjust, 390, 630));
}

/**
 * Sleep score (0–100). Components and weights are an independent design built on the
 * vendor-published inputs (duration, stages, efficiency, continuity, HR dip) — see
 * docs/SCORING.md. The exact Bevel weights are not public.
 */
export function sleepScore(
  sleep: SleepSession,
  opts: { age: number; sex: Sex; needMin: number },
): SleepScoreResult {
  const totals = stageTotals(sleep);
  const empty: SleepScoreResult = {
    score: 0,
    status: 'insufficient',
    totals,
    efficiency: 0,
    deepPct: 0,
    remPct: 0,
    awakePct: 0,
    durationScore: 0,
    stageScore: 0,
    efficiencyScore: 0,
    continuityScore: 0,
    dipScore: 0,
    needMin: opts.needMin,
  };
  if (totals.asleepMin < 60 || totals.inBedMin < 60) return empty;

  const deepPct = (totals.deepMin / totals.asleepMin) * 100;
  const remPct = (totals.remMin / totals.asleepMin) * 100;
  const awakePct = (totals.awakeMin / totals.inBedMin) * 100;
  const efficiency = (totals.asleepMin / totals.inBedMin) * 100;

  const ratio = totals.asleepMin / opts.needMin;
  const durationScore = clamp(100 * (1 - Math.max(0, 1 - ratio) * 1.6), 0, 100);

  const deepTarget = deepSleepTargetPct(opts.age, opts.sex);
  const remTarget = remTargetPct();
  const deepScore = clamp(100 - Math.abs(deepPct - deepTarget) * 9, 0, 100);
  const remScore = clamp(100 - Math.abs(remPct - remTarget) * 6, 0, 100);
  const stageBalance = Math.abs(deepPct + remPct + (100 - deepPct - remPct)) > 0 ? 1 : 1;
  const stageScore = clamp((deepScore * 0.55 + remScore * 0.45) * stageBalance, 0, 100);

  const efficiencyScore = clamp((efficiency - 60) * 2.5, 0, 100);
  const continuityScore = clamp(100 - totals.awakeMin * 0.75 - Math.max(0, (opts.needMin - totals.asleepMin) * 0.05), 0, 100);

  let dipScore = 70;
  if (sleep.minHrBpm && sleep.rhrBpm) {
    const dip = ((sleep.rhrBpm - sleep.minHrBpm) / sleep.rhrBpm) * 100;
    // Healthy dip band is 10–30%; score full inside it, taper outside.
    dipScore = dip < 10 ? clamp(40 + dip * 4, 0, 100) : dip > 30 ? clamp(100 - (dip - 30) * 3, 0, 100) : 100;
  }

  const score = clamp(
    durationScore * 0.4 + stageScore * 0.3 + efficiencyScore * 0.15 + continuityScore * 0.1 + dipScore * 0.05,
    0,
    100,
  );

  return {
    score: Math.round(score),
    status: 'scored',
    totals,
    efficiency: round(efficiency, 1),
    deepPct: round(deepPct, 1),
    remPct: round(remPct, 1),
    awakePct: round(awakePct, 1),
    durationScore: Math.round(durationScore),
    stageScore: Math.round(stageScore),
    efficiencyScore: Math.round(efficiencyScore),
    continuityScore: Math.round(continuityScore),
    dipScore: Math.round(dipScore),
    needMin: opts.needMin,
  };
}

export interface SleepBankResult {
  balanceMin: number;
  nights: { date: string; asleepMin: number; needMin: number; weight: number }[];
}

/** 7-day recency-weighted sleep bank: Σ weight × (asleep − need), weights normalised. */
export function sleepBank(
  sessions: { date: string; sleep: SleepSession | null; needMin: number }[],
): SleepBankResult {
  const weights = [0.35, 0.25, 0.15, 0.1, 0.07, 0.05, 0.03];
  const nights = sessions.slice(-7).map((s, i, arr) => ({
    date: s.date,
    asleepMin: s.sleep ? stageTotals(s.sleep).asleepMin : 0,
    needMin: s.needMin,
    weight: weights[arr.length - 1 - i] ?? 0.03,
  }));
  const totalWeight = nights.reduce((a, n) => a + n.weight, 0) || 1;
  const balance = nights.reduce((a, n) => a + (n.asleepMin - n.needMin) * (n.weight / totalWeight), 0);
  return { balanceMin: Math.round(balance), nights };
}
