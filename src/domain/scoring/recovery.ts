import type { SleepSession } from '../types';
import { clamp, mean, stageTotals } from '../math';

/**
 * Personal baseline. Spread is the mean absolute deviation (MAD), matching
 * the EWMA-abs-dev spread used by NOOP's RecoveryScorer.
 * Reference: ryanbr/noop, Packages/StrandAnalytics/Sources/StrandAnalytics/RecoveryScorer.swift
 */
export interface RecoveryBaseline {
  hrvMs: number;
  hrvSpread: number;
  rhrBpm: number;
  rhrSpread: number;
  rr: number;
  rrSpread: number;
  tempC: number;
  nights: number;
}

const mad = (xs: number[], fallback: number) => {
  if (xs.length < 2) return fallback;
  const m = mean(xs);
  const value = mean(xs.map((x) => Math.abs(x - m)));
  return value > 1e-9 ? value : fallback;
};

export function baselineFromSessions(sessions: SleepSession[]): RecoveryBaseline {
  const hrv = sessions.map((s) => s.hrvMs).filter((v): v is number => v != null);
  const rhr = sessions.map((s) => s.rhrBpm).filter((v): v is number => v != null);
  const rr = sessions.map((s) => s.respiratoryRate).filter((v): v is number => v != null);
  const temp = sessions.map((s) => s.wristTempC).filter((v): v is number => v != null);
  return {
    hrvMs: mean(hrv),
    hrvSpread: mad(hrv, Math.max(3, mean(hrv) * 0.12)),
    rhrBpm: mean(rhr),
    rhrSpread: mad(rhr, 2.5),
    rr: mean(rr),
    rrSpread: mad(rr, 0.8),
    tempC: mean(temp),
    nights: sessions.length,
  };
}

/**
 * Weights and constants ported from NOOP's RecoveryScorer:
 *   HRV 0.55, RHR 0.20, sleep 0.15, respiratory 0.05, skin temperature 0.05.
 * Missing optional terms are dropped and the weights renormalised.
 * The composite z is squashed through the same logistic (K=1.6, Z0=-0.20),
 * so z=0 maps to 58%, the population-average recovery anchor.
 */
export const RECOVERY_WEIGHTS = {
  hrv: 0.55,
  rhr: 0.2,
  sleep: 0.15,
  respiratory: 0.05,
  temp: 0.05,
} as const;

export const RECOVERY_CONSTANTS = {
  logisticK: 1.6,
  logisticZ0: -0.2,
  sleepPerfCenter: 0.85,
  sleepPerfScale: 0.12,
  skinTempScaleC: 1.0,
} as const;

export interface RecoveryInput {
  sleep: SleepSession | null;
  sleepScore: number | null;
  /** Number of complete staged nights available, including last night. */
  stagedNights: number;
  baseline: RecoveryBaseline;
  hasHrv: boolean;
  hasRhr: boolean;
}

export interface RecoveryResult {
  status: 'scored' | 'calibrating' | 'insufficient';
  score: number | null;
  label: string;
  components: { key: keyof typeof RECOVERY_WEIGHTS; score: number; weight: number }[];
  reason?: string;
  baselineNights: number;
}

const zScore = (value: number, m: number, spread: number) => (value - m) / Math.max(1.253 * spread, 1e-9);
const logistic = (z: number) => 100 / (1 + Math.exp(-RECOVERY_CONSTANTS.logisticK * (z - RECOVERY_CONSTANTS.logisticZ0)));

/**
 * Recovery is gated exactly as documented: two complete nights, stages, overnight
 * HRV and overnight RHR must all be present. The score itself is NOOP's transparent
 * z-score + logistic composite: personal baselines, renormalised weights, no
 * invented per-component percentages.
 */
export function recoveryScore(input: RecoveryInput): RecoveryResult {
  const base = { baselineNights: input.baseline.nights } as const;
  if (input.stagedNights < 2) {
    return {
      ...base,
      status: 'insufficient',
      score: null,
      label: 'Calibrating',
      components: [],
      reason: 'Recovery needs two complete nights of sleep data.',
    };
  }
  if (!input.hasHrv || !input.hasRhr) {
    return {
      ...base,
      status: 'insufficient',
      score: null,
      label: 'Calibrating',
      components: [],
      reason: !input.hasHrv
        ? 'Overnight HRV is missing from the sleep window.'
        : 'Overnight resting heart rate is missing from the sleep window.',
    };
  }
  if (input.sleepScore == null || input.baseline.nights < 5) {
    return {
      ...base,
      status: 'calibrating',
      score: null,
      label: 'Calibrating',
      components: [],
      reason: 'Building your personal baseline. This takes 2–6 weeks.',
    };
  }

  const s = input.sleep!;
  const b = input.baseline;
  const hrvZ = zScore(s.hrvMs!, b.hrvMs, b.hrvSpread);
  const rhrZ = -zScore(s.rhrBpm!, b.rhrBpm, b.rhrSpread);
  const terms: { key: keyof typeof RECOVERY_WEIGHTS; z: number; weight: number }[] = [
    { key: 'hrv', z: hrvZ, weight: RECOVERY_WEIGHTS.hrv },
    { key: 'rhr', z: rhrZ, weight: RECOVERY_WEIGHTS.rhr },
    {
      key: 'sleep',
      z: (input.sleepScore / 100 - RECOVERY_CONSTANTS.sleepPerfCenter) / RECOVERY_CONSTANTS.sleepPerfScale,
      weight: RECOVERY_WEIGHTS.sleep,
    },
  ];
  if (s.respiratoryRate != null) {
    terms.push({ key: 'respiratory', z: -zScore(s.respiratoryRate, b.rr, b.rrSpread), weight: RECOVERY_WEIGHTS.respiratory });
  }
  if (s.wristTempC != null) {
    terms.push({ key: 'temp', z: -Math.abs(s.wristTempC - b.tempC) / RECOVERY_CONSTANTS.skinTempScaleC, weight: RECOVERY_WEIGHTS.temp });
  }

  const totalWeight = terms.reduce((a, t) => a + t.weight, 0);
  const compositeZ = terms.reduce((a, t) => a + t.z * t.weight, 0) / Math.max(totalWeight, 1e-9);
  const rounded = Math.round(clamp(logistic(compositeZ), 0, 100));
  const components = terms.map((t) => ({
    key: t.key,
    score: Math.round(clamp(logistic(t.z), 0, 100)),
    weight: Math.round((t.weight / totalWeight) * 100) / 100,
  }));

  return {
    ...base,
    status: 'scored',
    score: rounded,
    label: recoveryLabel(rounded),
    components,
  };
}

/** WHOOP/NOOP-style bands, kept as labels rather than colours. */
export function recoveryLabel(score: number): string {
  if (score >= 85) return 'Primed';
  if (score >= 67) return 'Ready';
  if (score >= 34) return 'Recovered';
  return 'Rest up';
}

export function recoveryNarrative(input: {
  score: number;
  hrv: number | null;
  hrvBaseline: number;
  rhr: number | null;
  rhrBaseline: number;
  sleepScore: number | null;
}): string {
  const { score, hrv, hrvBaseline, rhr, sleepScore } = input;
  if (score >= 67) {
    return `Your recovery is trending up. ${hrv ? `HRV is ${Math.abs(Math.round(((hrv - hrvBaseline) / hrvBaseline) * 100))}% above` : 'HRV is above'} your usual baseline and resting heart rate is holding steady. This is a good day to push a little.`;
  }
  if (score >= 45) {
    return `You're reasonably recovered, but not fully primed. ${sleepScore ? `Sleep scored ${sleepScore}%` : 'Sleep was solid'} and your overnight signals are close to baseline. Keep today's intensity moderate and see how you feel after the warm-up.`;
  }
  const hrvText =
    hrv == null
      ? 'HRV is missing'
      : hrv < hrvBaseline * 0.9
        ? `HRV is ${hrv.toFixed(1)} ms, below your usual ${hrvBaseline.toFixed(1)} ms`
        : hrv > hrvBaseline * 1.05
          ? `HRV is ${hrv.toFixed(1)} ms, above your usual ${hrvBaseline.toFixed(1)} ms`
          : `HRV is ${hrv.toFixed(1)} ms, close to your usual ${hrvBaseline.toFixed(1)} ms`;
  return `Your recovery is low today. ${hrvText}; resting HR is ${rhr?.toFixed(1) ?? '—'} bpm and sleep scored ${sleepScore ?? '—'}%. Today is a good day to scale back and prioritize rest.`;
}

/** Short sleep needed estimate used by the sleep screen. */
export function sleepStageSummary(sleep: SleepSession) {
  const t = stageTotals(sleep);
  return {
    awake: t.awakeMin,
    rem: t.remMin,
    core: t.coreMin,
    deep: t.deepMin,
    asleep: t.asleepMin,
  };
}
