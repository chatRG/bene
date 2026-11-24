import type { AppStateData, DayRecord, SleepSession } from './types';
import { ageFromBirthDate, mean, stageTotals, round } from './math';
import { sleepBank, sleepNeedMinutes, sleepScore, type SleepScoreResult } from './scoring/sleep';
import { baselineFromSessions, recoveryScore, recoveryNarrative, type RecoveryResult } from './scoring/recovery';
import { computeStrain, type StrainResult } from './scoring/strain';
import { stressSummary, type StressSummary } from './scoring/load';
import { nutritionFor, type NutritionResult } from './scoring/nutrition';
import { CALC_METHODS, estimatedMaxHr } from './scoring/zones';

export interface DayDerived {
  date: string;
  record: DayRecord;
  /** Chronological age on `date`, or null when the profile has no valid birth date. */
  age: number | null;
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
  const age = ageFromBirthDate(data.profile.birthDate, date) ?? 30;
  const maxHr = estimatedMaxHr(age);
  return {
    method: CALC_METHODS.zoneMethod,
    age,
    restingHr: Math.round(recoveryBaselineFor(data, date).rhrBpm || 55),
    // Zones are percent of max HR, so the manual and lactate overrides are not
    // consulted; they are set to the Tanaka estimate to keep the config whole.
    manualMaxHr: maxHr,
    lactateThresholdHr: 0,
  };
}

function priorSessions(data: AppStateData, date: string, daysBack: number): SleepSession[] {
  const idx = data.dayOrder.indexOf(date);
  // date missing (or the first day) means there is nothing prior to average;
  // a negative idx would also index dayOrder[-1..] instead of a real date.
  if (idx <= 0) return [];
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

function strainOfRecord(data: AppStateData, date: string): number {
  const record = data.days[date];
  if (!record) return 0;
  // The same inputs computeStrain gets on the strain screen: baseline resting
  // HR, Tanaka max HR, and samples inside logged workout windows skipped — so
  // a day never scores differently inside recentStrainAvg or sleep need than
  // it does on the screen.
  const age = ageFromBirthDate(data.profile.birthDate, date) ?? 30;
  return computeStrain({
    workouts: record.workouts,
    hrSamples: record.metrics.hrSamples,
    restingHr: Math.round(recoveryBaselineFor(data, date).rhrBpm || 55),
    recovery: null,
    recentStrainAvg: 0,
    recentStrainRange: [],
    age,
    maxHr: Math.round(208 - 0.7 * age),
  }).score;
}

export function recentStrains(data: AppStateData, date: string, daysBack = 28): number[] {
  const idx = data.dayOrder.indexOf(date);
  if (idx <= 0) return [];
  const out: number[] = [];
  for (let i = Math.max(0, idx - daysBack); i < idx; i++) out.push(strainOfRecord(data, data.dayOrder[i]));
  return out;
}

export function sleepNeedFor(data: AppStateData, date: string): number {
  const idx = data.dayOrder.indexOf(date);
  const age = ageFromBirthDate(data.profile.birthDate, date) ?? 30;
  // date missing (or the first day) means there is nothing prior to sum; a
  // negative idx would slice dayOrder[-7..-1] and read the whole history as
  // "the last seven nights".
  const prior = idx <= 0 ? [] : data.dayOrder.slice(Math.max(0, idx - 7), idx);
  let debt = 0;
  for (const d of prior) {
    const rec = data.days[d];
    if (!rec?.sleep) continue;
    debt += stageTotals(rec.sleep).asleepMin - data.settings.sleepGoalMin;
  }
  const yesterday = data.dayOrder[idx - 1];
  const yesterdayStrain = yesterday ? strainOfRecord(data, yesterday) : 0;
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
  // Records are only projected once the day is on the timeline. If date is
  // absent, `recent` would run before index 0 with an empty day record.
  const isOnTimeline = idx >= 0;
  const nowMinute = isToday ? now.getHours() * 60 + now.getMinutes() : 1440;
  const age = ageFromBirthDate(data.profile.birthDate, date) ?? 30;
  const needMin = sleepNeedFor(data, date);
  const session = record.sleep;
  // The score accepts `age: null` so a missing birth date is skipped rather than
  // guessed. The local `age` above is only the fallback for zone maths.
  const scoreAge = ageFromBirthDate(data.profile.birthDate, date);
  const score = session ? sleepScore(session, { age: scoreAge, sex: data.profile.sex, needMin }) : null;

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
    workouts: record.workouts,
    hrSamples: record.metrics.hrSamples,
    restingHr: Math.round(baseline.rhrBpm || 55),
    recovery: recovery.score,
    recentStrainAvg: mean(recent.slice(-14)),
    recentStrainRange: recent,
    activityStatus: data.settings.activityStatus,
    age,
    maxHr: Math.round(208 - 0.7 * age),
    nowMinute: isToday && isOnTimeline ? nowMinute : 1440,
  });

  const stress = stressSummary(record.metrics.stressSamples, {
    daysOfBaseline: Math.min(60, Math.max(0, idx)),
    // Only a scored session counts. A too-short night returns
    // { status: 'insufficient', score: 0 } — feeding that 0 in would tax the
    // Energy Bank for a night the sleep score never read.
    sleepScore: score?.status === 'scored' ? score.score : null,
  });

  const nutrition = nutritionFor(record.meals, data.settings.excludedContributors, record.metrics.totalCalories);

  const bank = sleepBank(
    // String() keeps a pre-filled (NaN/empty) day order key from becoming an 'undefined' date label.
    data.dayOrder.slice(Math.max(0, idx - 6), idx + 1).map((d) => ({
      date: String(d),
      sleep: data.days[d]?.sleep ?? null,
      needMin: data.settings.sleepGoalMin,
    })),
  );

  return {
    date,
    record,
    // Chronological age for display, or null when the profile has no valid birth
    // date (the internal `age` above is a fallback for zone maths only).
    age: ageFromBirthDate(data.profile.birthDate, date),
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
    // No prior nights means no baseline: report null rather than a 0 that
    // callers would print as "0.0 ms" or divide by. The field stays typed as a
    // number for existing callers; only the empty-data case returns null.
    baselineHrv: (baseline.nights > 0 ? round(baseline.hrvMs, 1) : null) as unknown as number,
    baselineRhr: (baseline.nights > 0 ? round(baseline.rhrBpm, 1) : null) as unknown as number,
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
    hrv != null && d.baselineHrv != null && d.baselineHrv > 0 ? Math.round(((hrv - d.baselineHrv) / d.baselineHrv) * 100) : null;
  const rhrDelta = rhr != null && d.baselineRhr != null ? Math.round((rhr - d.baselineRhr) * 10) / 10 : null;

  const signals: string[] = [];
  if (hrv != null && hrvPct != null) {
    signals.push(
      Math.abs(hrvPct) < 3
        ? `HRV is close to your baseline at ${hrv.toFixed(0)} ms`
        : `HRV is ${Math.abs(hrvPct)}% ${hrvPct > 0 ? 'above' : 'below'} your baseline`,
    );
  } else if (hrv != null) {
    signals.push(`HRV is ${hrv.toFixed(0)} ms`);
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
  const cost = `Target strain is ${d.strain.target}%.`;
  const body = [sleep, detail ? `${detail}.` : '', d.strain.unscored ? `No load recorded yet today. ${cost}` : cost]
    .filter(Boolean)
    .join(' ');

  if (r >= 67) {
    return { title: 'A day to build', body: `${body} A longer session fits if the warm-up feels easy.`, tone: 'positive' };
  }
  if (r >= 45) {
    return { title: 'A moderate day', body: `${body} Keep the session controlled and reassess after the warm-up.`, tone: 'neutral' };
  }
  return { title: 'Recovery is low today', body: `${body} Keep the day light and protect tonight’s sleep.`, tone: 'warning' };
}
