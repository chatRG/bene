import { describe, expect, it } from 'vitest';
import { buildSeed, dateKey } from './seed';
import { deriveDay } from './derive';
import { nutritionFor } from './scoring/nutrition';
import { zoneIndex } from './scoring/zones';
import { biologicalAge, sumContributors } from './scoring/biology';
import { ageFromBirthDate, stageTotals } from './math';
import { freshnessBand } from './scoring/load';
import { strainFromTrimp } from './scoring/strain';
import { recoveryScore } from './scoring/recovery';
import { sleepScore } from './scoring/sleep';
import { createBackup, parseBackup } from './backup';

const NOW = new Date('2026-11-14T13:20:00');

describe('demo dataset', () => {
  it('reproduces the reference dashboard values', () => {
    const data = buildSeed(NOW);
    const today = dateKey(NOW);
    const d = deriveDay(data, today, NOW);
    expect(d.sleepScore?.status).toBe('scored');
    expect(d.sleepScore?.score).toBe(74);
    expect(d.recovery.status).toBe('scored');
    expect(d.recovery.score).toBe(41);
    expect(Math.round(d.strain.score)).toBe(42);
    expect(d.nutrition.totals.calories).toBe(2304);
    expect(d.nutrition.netEnergy).toBe(-257);
  });

  it('sleep stages sum to the session length', () => {
    const data = buildSeed(NOW);
    const sleep = data.days[dateKey(NOW)].sleep!;
    const t = stageTotals(sleep);
    expect(t.inBedMin).toBe(490);
    expect(t.asleepMin).toBe(423);
  });

  it('reproduces the published macro split and contributor points', () => {
    const data = buildSeed(NOW);
    const day = data.days[dateKey(NOW)];
    const n = nutritionFor(day.meals, [], day.metrics.totalCalories);
    expect(n.totals.calories).toBe(2304);
    expect(n.macroPercents).toEqual({ fat: 26, carbs: 42, protein: 32 });
    expect(n.netEnergy).toBe(-257);
    const veg = n.contributors.find((c) => c.id === 'vegetables');
    const grains = n.contributors.find((c) => c.id === 'wholeGrains');
    expect(veg?.points).toBe(7);
    expect(grains?.points).toBe(5);
  });

  it('biological age contributors add up to the headline delta', () => {
    const data = buildSeed(NOW);
    const today = dateKey(NOW);
    const age = ageFromBirthDate(data.profile.birthDate, today);
    const bio = biologicalAge({
      profile: data.profile,
      chronologicalAge: age,
      days: data.dayOrder.slice(-60).map((d) => data.days[d]),
      biomarkers: data.biomarkers,
      vo2max: 52,
      today,
      lastLabDaysAgo: 19,
    });
    expect(bio.status).toBe('scored');
    expect(bio.age).toBe(26);
    expect(bio.deltaYears).toBe(-2.8);
    expect(bio.confidence).toBe(85);
    expect(sumContributors(bio.contributors)).toBe(-2.8);
  });
});

describe('published invariants', () => {
  it('maps 60% of HR max to Z2', () => {
    const config = { method: 'manual' as const, age: 30, restingHr: 55, manualMaxHr: 190, lactateThresholdHr: 168 };
    expect(zoneIndex(114, config)).toBe(2);
    expect(zoneIndex(113, config)).toBe(1);
    expect(zoneIndex(171, config)).toBe(5);
  });

  it('lets strain exceed 100 rather than clamping', () => {
    expect(strainFromTrimp(10000)).toBeGreaterThan(100);
    expect(strainFromTrimp(0)).toBe(0);
  });

  it('resolves the 75% muscle-freshness overlap to Recovered', () => {
    expect(freshnessBand(76, 3)).toBe('Recovered');
    expect(freshnessBand(75, 3)).toBe('Recovered');
    expect(freshnessBand(74, 3)).toBe('Fatigued');
    expect(freshnessBand(34, 3)).toBe('Depleted');
    expect(freshnessBand(90, 2)).toBe('Calibrating');
  });

  it('gates Recovery on two nights, sleep stages, HRV and RHR', () => {
    const data = buildSeed(NOW);
    const today = dateKey(NOW);
    const d = deriveDay(data, today, NOW);
    const baseline = {
      hrvMs: d.baselineHrv,
      hrvSd: 8,
      rhrBpm: d.baselineRhr,
      rhrSd: 3,
      rr: 14,
      rrSd: 1,
      tempC: 36.4,
      nights: 28,
    };
    const base = {
      sleep: d.sleep,
      sleepScore: 74,
      stagedNights: 2,
      baseline,
      hasHrv: true,
      hasRhr: true,
    };
    expect(recoveryScore(base).status).toBe('scored');
    expect(recoveryScore({ ...base, stagedNights: 1 }).status).toBe('insufficient');
    expect(recoveryScore({ ...base, hasHrv: false }).status).toBe('insufficient');
    expect(recoveryScore({ ...base, baseline: { ...baseline, nights: 3 } }).status).toBe('calibrating');
  });

  it('suppresses Sleep Score for a session without stages', () => {
    const data = buildSeed(NOW);
    const sleep = { ...data.days[dateKey(NOW)].sleep!, stages: [] };
    expect(sleepScore(sleep, { age: 28, sex: 'male', needMin: 540 }).status).toBe('insufficient');
  });

  it('applies the documented nutrition penalties and dead bands', () => {
    const base = buildSeed(NOW).days[dateKey(NOW)].meals[0];
    const mk = (patch: Partial<typeof base>) => [{ ...base, ...patch }];
    const sodiumSafe = nutritionFor(mk({ sodiumMg: 2000 }), [], 2500);
    const sodiumHigh = nutritionFor(mk({ sodiumMg: 2500 }), [], 2500);
    expect(sodiumSafe.contributors.find((c) => c.id === 'sodium')?.points).toBe(0);
    expect(sodiumHigh.contributors.find((c) => c.id === 'sodium')?.points).toBe(-5);
    const vegTarget = nutritionFor(mk({ vegGrams: 150 }), [], 2500);
    expect(vegTarget.contributors.find((c) => c.id === 'vegetables')?.points).toBe(10);
    const alcohol = nutritionFor(mk({ alcoholGrams: 14 }), [], 2500);
    expect(alcohol.contributors.find((c) => c.id === 'alcohol')?.points).toBe(-10);
  });

  it('refuses imported-only meals for the Nutrition Score', () => {
    const data = buildSeed(NOW);
    const meals = data.days[dateKey(NOW)].meals.map((m) => ({ ...m, source: 'imported' as const }));
    expect(nutritionFor(meals, [], 2500).status).toBe('suppressed');
  });
});

describe('backup', () => {
  it('round-trips a backup document', () => {
    const data = buildSeed(NOW);
    const file = createBackup(data);
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.profile.name).toBe(data.profile.name);
      expect(Object.keys(parsed.data.days).length).toBe(data.dayOrder.length);
    }
  });

  it('rejects foreign or incomplete backups', () => {
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'other' })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'bevel-community', version: 1, data: {} })).ok).toBe(false);
  });
});
