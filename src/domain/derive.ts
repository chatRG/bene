import type { AppStateData, DayRecord, SleepSession } from './types';
import { ageFromBirthDate, mean, stageTotals, round } from './math';
import { sleepBank, sleepNeedMinutes, sleepScore, type SleepScoreResult } from './scoring/sleep';
import { baselineFromSessions, recoveryScore, recoveryNarrative, type RecoveryResult } from './scoring/recovery';
import { computeStrain, type StrainResult } from './scoring/strain';
import { stressSummary, type StressSummary } from './scoring/load';
import { nutritionFor, type NutritionResult } from './scoring/nutrition';
import { estimatedMaxHr } from './scoring/zones';

export interface DayDerived {
  date: string;
  record: DayRecord;
  age: number;
  sleep: SleepSession | null;
  sleepScore: SleepScoreResult | null;
  sleepNeedMin: number;
  sleepBankMin: number;
  recovery: RecoveryResult;
  recoveryNarrative: string;
  strain: StrainResult;
  stress: StressSummary;
  nutrition: NutritionResult;
  recentStrainAvg: number;
  baselineHrv: number;
  baselineRhr: number;
}

export function zoneConfigFor(data: AppStateData, date: string) {
  const age = ageFromBirthDate(data.profile.birthDate, date);
  return {
    method: data.settings.hrZoneMethod,
    age,
    restingHr: Math.round(recoveryBaselineFor(data, date).rhrBpm || 55),
    manualMaxHr: data.settings.manualMaxHr || estimatedMaxHr(age),
    lactateThresholdHr: data.settings.lactateThresholdHr,
  };
}

function priorSessions(data: AppStateData, date: string, daysBack: number): SleepSession[] {
  const idx = data.dayOrder.indexOf(date);
  const from = Math.max(0, idx - daysBack);
  const out: SleepSession[] = [];
  for (let i = from; i < idx; i++) {
    const s = data.days[data.dayOrder[i]]?.sleep;
    if (s) out.push(s);
  }
  return out;
}

export function recoveryBaselineFor(data: AppStateData, date: string) {
  return baselineFromSessions(priorSessions(data, date, 28));
}

function strainOfRecord(record: DayRecord | undefined): number {
  if (!record) return 0;
  const active = record.workouts.reduce((a, w) => a + w.zoneMinutes.reduce((x, m, i) => x + m * i, 0), 0);
  const passive = record.metrics.hrSamples.reduce((a, s) => {
    const pct = ((s.bpm - 55) / (190 - 55)) * 100;
    const weight = pct >= 90 ? 5 : pct >= 80 ? 4 : pct >= 70 ? 3 : pct >= 60 ? 2 : pct >= 50 ? 1 : 0;
    return a + weight * 10;
  }, 0);
  return (100 * Math.log(1 + active + passive)) / Math.log(7201);
}

export function recentStrains(data: AppStateData, date: string, daysBack = 28): number[] {
  const idx = data.dayOrder.indexOf(date);
  const out: number[] = [];
  for (let i = Math.max(0, idx - daysBack); i < idx; i++) out.push(strainOfRecord(data.days[data.dayOrder[i]]));
  return out;
}

export function sleepNeedFor(data: AppStateData, date: string): number {
  const idx = data.dayOrder.indexOf(date);
  const age = ageFromBirthDate(data.profile.birthDate, date);
  const prior = data.dayOrder.slice(Math.max(0, idx - 7), idx);
  let debt = 0;
  for (const d of prior) {
    const rec = data.days[d];
    if (!rec?.sleep) continue;
    debt += stageTotals(rec.sleep).asleepMin - data.settings.sleepGoalMin;
  }
  const yesterday = data.dayOrder[idx - 1];
  const yesterdayStrain = strainOfRecord(yesterday ? data.days[yesterday] : undefined);
  return sleepNeedMinutes({
    age,
    sex: data.profile.sex,
    recentDebtMin: debt,
    yesterdayStrain,
    sleepGoalMin: data.settings.sleepGoalMin,
  });
}

export function deriveDay(data: AppStateData, date: string, now = new Date()): DayDerived {
  const record = data.days[date] ?? {
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
  const idx = data.dayOrder.indexOf(date);
  const isToday = date === dateOf(now);
  const nowMinute = isToday ? now.getHours() * 60 + now.getMinutes() : 1440;
  const age = ageFromBirthDate(data.profile.birthDate, date);
  const needMin = sleepNeedFor(data, date);
  const session = record.sleep;
  const score = session ? sleepScore(session, { age, sex: data.profile.sex, needMin }) : null;

  const baseline = recoveryBaselineFor(data, date);
  const stagedNights =
    priorSessions(data, date, 3).filter((s) => stageTotals(s).asleepMin > 60).length +
    (session && stageTotals(session).asleepMin > 60 ? 1 : 0);
  const recovery = recoveryScore({
    sleep: session,
    sleepScore: score?.status === 'scored' ? score.score : null,
    stagedNights,
    baseline,
    hasHrv: session?.hrvMs != null,
    hasRhr: session?.rhrBpm != null,
  });

  const recent = recentStrains(data, date, 28);
  const strain = computeStrain({
    workouts: isToday ? record.workouts : record.workouts,
    hrSamples: record.metrics.hrSamples,
    restingHr: Math.round(baseline.rhrBpm || 55),
    recovery: recovery.score,
    recentStrainAvg: mean(recent.slice(-14)),
    recentStrainRange: recent,
    age,
    maxHr: Math.round(208 - 0.7 * age),
    nowMinute: isToday ? nowMinute : 1440,
  });

  const stress = stressSummary(record.metrics.stressSamples, {
    daysOfBaseline: Math.min(60, Math.max(0, idx)),
    sleepScore: score?.score ?? null,
  });

  const nutrition = nutritionFor(record.meals, data.settings.excludedContributors, record.metrics.totalCalories);

  const bank = sleepBank(
    data.dayOrder.slice(Math.max(0, idx - 6), idx + 1).map((d) => ({
      date: d,
      sleep: data.days[d]?.sleep ?? null,
      needMin: data.settings.sleepGoalMin,
    })),
  );

  return {
    date,
    record,
    age,
    sleep: session,
    sleepScore: score,
    sleepNeedMin: needMin,
    sleepBankMin: bank.balanceMin,
    recovery,
    recoveryNarrative: recoveryNarrative({
      score: recovery.score ?? 50,
      hrv: session?.hrvMs ?? null,
      hrvBaseline: baseline.hrvMs,
      rhr: session?.rhrBpm ?? null,
      rhrBaseline: baseline.rhrBpm,
      sleepScore: score?.score ?? null,
    }),
    strain: { ...strain, score: isToday ? strain.score : strain.score },
    stress,
    nutrition,
    recentStrainAvg: Math.round(mean(recent.slice(-14))),
    baselineHrv: round(baseline.hrvMs, 1),
    baselineRhr: round(baseline.rhrBpm, 1),
  };
}

export function dateOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function scoreHistory(data: AppStateData, days = 14) {
  const order = data.dayOrder.slice(-days);
  return order.map((date) => {
    const d = deriveDay(data, date);
    return {
      date,
      recovery: d.recovery.score,
      sleep: d.sleepScore?.status === 'scored' ? d.sleepScore.score : null,
      strain: Math.round(d.strain.score),
      stress: d.stress.average,
      steps: d.record.metrics.steps,
      hrv: d.sleep?.hrvMs ?? null,
      rhr: d.sleep?.rhrBpm ?? null,
    };
  });
}

/**
 * The morning note is assembled from the same deltas the score uses. Each
 * sentence is conditional, so it never claims a direction that the data does
 * not support. The name is accepted for call-site compatibility but a greeting
 * is not the product's voice.
 */
export function coachInsight(d: DayDerived): { title: string; body: string; tone: 'positive' | 'neutral' | 'warning' } {
  if (d.recovery.status !== 'scored') {
    return {
      title: d.recovery.status === 'calibrating' ? 'Still calibrating' : 'Almost there',
      body:
        d.recovery.reason ??
        'Keep wearing your device overnight. Two full nights with sleep stages, HRV and resting heart rate unlock your first Recovery score.',
      tone: 'neutral',
    };
  }

  const r = d.recovery.score ?? 50;
  const hrv = d.sleep?.hrvMs ?? null;
  const rhr = d.sleep?.rhrBpm ?? null;
  const hrvPct =
    hrv != null && d.baselineHrv > 0 ? Math.round(((hrv - d.baselineHrv) / d.baselineHrv) * 100) : null;
  const rhrDelta = rhr != null ? Math.round((rhr - d.baselineRhr) * 10) / 10 : null;

  const signals: string[] = [];
  if (hrv != null && hrvPct != null) {
    signals.push(
      Math.abs(hrvPct) < 3
        ? `HRV is close to your baseline at ${hrv.toFixed(0)} ms`
        : `HRV is ${Math.abs(hrvPct)}% ${hrvPct > 0 ? 'above' : 'below'} your baseline`,
    );
  }
  if (rhrDelta != null) {
    signals.push(
      Math.abs(rhrDelta) < 1
        ? `resting heart rate is steady at ${rhr!.toFixed(0)} bpm`
        : `resting heart rate is ${Math.abs(rhrDelta).toFixed(1)} bpm ${rhrDelta < 0 ? 'below' : 'above'} baseline`,
    );
  }
  const sleep = d.sleepScore?.score != null ? `Sleep scored ${d.sleepScore.score}%,` : '';
  const detail = signals.join(' and ');
  const target = `Target strain is ${d.strain.target}%.`;
  const body = [sleep, detail ? `${detail}.` : '', target].filter(Boolean).join(' ');

  if (r >= 67) {
    return { title: 'A day to build', body: `${body} A longer session fits if the warm-up feels easy.`, tone: 'positive' };
  }
  if (r >= 45) {
    return { title: 'A moderate day', body: `${body} Keep the session controlled and reassess after the warm-up.`, tone: 'neutral' };
  }
  return { title: 'Recovery is low today', body: `${body} Keep the day light and protect tonight’s sleep.`, tone: 'warning' };
}
