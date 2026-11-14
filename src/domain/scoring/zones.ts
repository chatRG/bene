import type { HeartRateSample } from '../types';
import { clamp } from '../math';

export type ZoneMethod = 'maxHr' | 'hrReserve' | 'lactate' | 'manual';

export interface ZoneConfig {
  method: ZoneMethod;
  age: number;
  restingHr: number;
  manualMaxHr: number;
  lactateThresholdHr: number;
}

export const ZONE_LABELS = ['Restorative', 'Z1 · Very light', 'Z2 · Light', 'Z3 · Moderate', 'Z4 · Hard', 'Z5 · Maximum'] as const;
export const ZONE_SHORT = ['Rest', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'] as const;

/** Tanaka max-HR estimate; used only when no measured max HR is supplied. */
export function estimatedMaxHr(age: number): number {
  return Math.round(208 - 0.7 * age);
}

export function maxHrFor(config: ZoneConfig): number {
  if (config.method === 'manual' && config.manualMaxHr > 0) return config.manualMaxHr;
  if (config.method === 'lactate' && config.lactateThresholdHr > 0) return Math.round(config.lactateThresholdHr / 0.85);
  return estimatedMaxHr(config.age);
}

/**
 * Published zone table (percent of HR max): 0–49, 50–59, 60–69, 70–79, 80–89, 90–100.
 * With the HR-reserve method the same bands are applied to heart-rate reserve.
 */
export function zoneIndex(bpm: number, config: ZoneConfig): number {
  if (bpm <= 0) return 0;
  const max = maxHrFor(config);
  let pct: number;
  if (config.method === 'hrReserve') {
    const reserve = Math.max(1, max - config.restingHr);
    pct = ((bpm - config.restingHr) / reserve) * 100;
  } else {
    pct = (bpm / max) * 100;
  }
  if (pct < 50) return 0;
  if (pct < 60) return 1;
  if (pct < 70) return 2;
  if (pct < 80) return 3;
  if (pct < 90) return 4;
  return 5;
}

export function zoneMinutesFromSamples(samples: HeartRateSample[], config: ZoneConfig, bucketMin = 5): [number, number, number, number, number, number] {
  const minutes: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (const s of samples) {
    minutes[zoneIndex(s.bpm, config)] += bucketMin;
  }
  return minutes;
}

/** Zone percentages for a distribution bar. */
export function zonePercents(minutes: number[]): number[] {
  const total = minutes.reduce((a, b) => a + b, 0) || 1;
  return minutes.map((m) => (m / total) * 100);
}

export function workoutTrimp(zoneMinutes: number[]): number {
  const factors = [1, 2, 3, 5, 8, 12];
  return zoneMinutes.reduce((acc, m, i) => acc + m * (factors[i] ?? 0), 0);
}

/** Kim et al. style normalization used for display range labels. */
export function zoneRangeLabel(config: ZoneConfig, zone: number): string {
  const max = maxHrFor(config);
  const base = config.method === 'hrReserve' ? config.restingHr : 0;
  const span = config.method === 'hrReserve' ? max - base : max;
  const low = base + (span * (zone === 1 ? 50 : zone === 2 ? 60 : zone === 3 ? 70 : zone === 4 ? 80 : 90)) / 100;
  const high = base + (span * (zone === 1 ? 59 : zone === 2 ? 69 : zone === 3 ? 79 : zone === 4 ? 89 : 100)) / 100;
  return `${Math.round(low)}–${Math.round(high)} bpm`;
}

export function heartRateRecovery(peakHr: number | null, twoMinLaterHr: number | null): number | null {
  if (peakHr == null || twoMinLaterHr == null) return null;
  return clamp(Math.round(peakHr - twoMinLaterHr), 0, 100);
}
