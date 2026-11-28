
/**
 * The app computes every score one way. These values were previously settings;
 * they are pinned here so the fixed method lives in a single place.
 *
 * - hrvMethod: HRV is summarised as RMSSD.
 * - hrvWindow: HRV is taken from REM + deep sleep only.
 * - rhrWindow: resting heart rate is taken from the entire sleep session.
 * - tempMethod: skin temperature is read from the wrist.
 * - zoneMethod: zones are percent of max HR, with no manual override.
 *
 * To change a method, change it here and nowhere else.
 */
export const CALC_METHODS = {
  hrvMethod: 'rmssd',
  hrvWindow: 'remDeep',
  rhrWindow: 'entireSleep',
  tempMethod: 'wrist',
  zoneMethod: 'maxHr',
} as const;

export type HrvMethod = typeof CALC_METHODS.hrvMethod;
export type HrvWindow = typeof CALC_METHODS.hrvWindow;
export type RhrWindow = typeof CALC_METHODS.rhrWindow;
export type TempMethod = typeof CALC_METHODS.tempMethod;

export type ZoneMethod = typeof CALC_METHODS.zoneMethod;

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

/**
 * Zones are a fixed percent of max HR. There is one method, so there is nothing
 * to branch on: the config carries its age and the estimate follows.
 */
export function maxHrFor(config: ZoneConfig): number {
  return estimatedMaxHr(config.age);
}

/** Zone index for a measured heart rate against an explicit maximum. */
export function zoneIndexForMaxHr(bpm: number, maxHr: number): number {
  if (bpm <= 0 || maxHr <= 0) return 0;
  const pct = (bpm / maxHr) * 100;
  if (pct < 50) return 0;
  if (pct < 60) return 1;
  if (pct < 70) return 2;
  if (pct < 80) return 3;
  if (pct < 90) return 4;
  return 5;
}

/** Published zone table (percent of HR max): 0–49, 50–59, 60–69, 70–79, 80–89, 90–100. */
export function zoneIndex(bpm: number, config: ZoneConfig): number {
  return zoneIndexForMaxHr(bpm, maxHrFor(config));
}

/** Edwards zone weights on %HRR: Z1=1 … Z5=5; zone 0 (rest) contributes zero. */
export function workoutTrimp(zoneMinutes: number[]): number {
  return zoneMinutes.reduce((acc, m, i) => acc + m * Math.min(5, Math.max(0, i)), 0);
}
