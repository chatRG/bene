import type { SleepSession } from '../types';
import { clamp, mean, std, stageTotals } from '../math';

export interface RecoveryBaseline {
  hrvMs: number;
  hrvSd: number;
  rhrBpm: number;
  rhrSd: number;
  rr: number;
  rrSd: number;
  tempC: number;
  nights: number;
}

export function baselineFromSessions(sessions: SleepSession[]): RecoveryBaseline {
  const hrv = sessions.map((s) => s.hrvMs).filter((v): v is number => v != null);
  const rhr = sessions.map((s) => s.rhrBpm).filter((v): v is number => v != null);
  const rr = sessions.map((s) => s.respiratoryRate).filter((v): v is number => v != null);
  const temp = sessions.map((s) => s.wristTempC).filter((v): v is number => v != null);
  return {
    hrvMs: mean(hrv),
    hrvSd: std(hrv) || Math.max(3, mean(hrv) * 0.14),
    rhrBpm: mean(rhr),
    rhrSd: std(rhr) || 2.5,
    rr: mean(rr),
    rrSd: std(rr) || 0.8,
    tempC: mean(temp),
    nights: sessions.length,
  };
}

export const RECOVERY_WEIGHTS = {
  sleep: 0.35,
  hrv: 0.25,
  rhr: 0.2,
  temp: 0.08,
  respiratory: 0.07,
  spo2: 0.05,
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

const zScore = (value: number, m: number, sd: number) => (sd > 0 ? (value - m) / sd : 0);
const centered = (z: number, direction: 1 | -1, gain = 19) => clamp(50 + direction * z * gain, 1, 100);

/**
 * Recovery is gated exactly as documented: two complete nights, stages, overnight
 * HRV and overnight RHR must all be present. Components are personal z-scores
 * (28-night baseline) mapped to 1–100, then blended with the published weights.
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
  const hrvZ = zScore(s.hrvMs!, b.hrvMs, b.hrvSd);
  const rhrZ = zScore(s.rhrBpm!, b.rhrBpm, b.rhrSd);
  const rrZ = s.respiratoryRate != null ? zScore(s.respiratoryRate, b.rr, b.rrSd) : 0;
  const tempDev = s.wristTempC != null ? s.wristTempC - b.tempC : 0;
  const spo2 = s.spo2 ?? 97;

  const componentScores = {
    sleep: clamp(input.sleepScore, 1, 100),
    hrv: centered(hrvZ, 1),
    rhr: centered(rhrZ, -1),
    temp: clamp(100 - Math.abs(tempDev) * 120, 1, 100),
    respiratory: clamp(centered(rrZ, -1), 1, 100),
    spo2: clamp((spo2 - 90) * 10, 1, 100),
  };

  const components = (Object.keys(RECOVERY_WEIGHTS) as (keyof typeof RECOVERY_WEIGHTS)[]).map((key) => ({
    key,
    score: Math.round(componentScores[key]),
    weight: RECOVERY_WEIGHTS[key],
  }));

  const score = clamp(
    components.reduce((acc, c) => acc + c.score * c.weight, 0),
    1,
    100,
  );

  const rounded = Math.round(score);
  return {
    ...base,
    status: 'scored',
    score: rounded,
    label: recoveryLabel(rounded),
    components,
  };
}

export function recoveryLabel(score: number): string {
  if (score >= 85) return 'Primed';
  if (score >= 67) return 'Ready';
  if (score >= 50) return 'Moderate';
  if (score >= 34) return 'Low';
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
  const { score, hrv, hrvBaseline, sleepScore } = input;
  if (score >= 67) {
    return `Your recovery is trending up. ${hrv ? `HRV is ${Math.abs(Math.round(((hrv - hrvBaseline) / hrvBaseline) * 100))}% above` : 'HRV is above'} your usual baseline and resting heart rate is holding steady. This is a good day to push a little.`;
  }
  if (score >= 45) {
    return `You're reasonably recovered, but not fully primed. ${sleepScore ? `Sleep scored ${sleepScore}%` : 'Sleep was solid'} and your overnight signals are close to baseline. Keep today's intensity moderate and see how you feel after the warm-up.`;
  }
  return `Your recovery is looking low today, and it's not just a one-off. Your resting HRV is ${hrv?.toFixed(1) ?? '—'} ms, which is ${hrv && hrvBaseline ? `well below your usual ${hrvBaseline.toFixed(1)} ms` : 'below your usual baseline'}. Today might be a good day to scale back and prioritize rest.`;
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
