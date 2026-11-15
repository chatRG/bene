
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

/** Edwards zone weights on %HRR: Z1=1 … Z5=5; zone 0 (rest) contributes zero. */
export function workoutTrimp(zoneMinutes: number[]): number {
  return zoneMinutes.reduce((acc, m, i) => acc + m * Math.min(5, Math.max(0, i)), 0);
}
