import { describe, expect, it } from 'vitest';
import { buildSeed, dateKey } from './seed';
import { mealsFor, sleepFor, stateWithWeekOfData } from './fixtures';
import { deriveDay } from './derive';
import { nutritionFor } from './scoring/nutrition';
import { maxHrFor, zoneIndex, type ZoneConfig } from './scoring/zones';
import { biologicalAge, lifestyleYears, sumContributors, vo2MaxFromDays } from './scoring/biology';
import { ageFromBirthDate, stageTotals } from './math';
import { freshnessBand } from './scoring/load';
import { strainFromTrimp, targetStrain } from './scoring/strain';
import { recoveryScore } from './scoring/recovery';
import { sleepScore } from './scoring/sleep';
import { createBackup, parseBackup } from './backup';

const NOW = new Date('2026-11-14T13:20:00');
const TODAY = dateKey(NOW);

describe('a fresh install', () => {
  it('starts empty: no days, records, chats or routines', () => {
    const data = buildSeed(NOW);
    expect(data.dayOrder).toEqual([]);
    expect(Object.keys(data.days)).toHaveLength(0);
    expect(data.biomarkers).toEqual([]);
    expect(data.healthRecords).toEqual([]);
    expect(data.chats).toEqual([]);
    expect(data.routines).toEqual([]);
    expect(data.journalEntries).toEqual([]);
    expect(data.profile.name).toBe('');
    expect(data.profile.heightCm).toBe(0);
    expect(data.profile.weightKg).toBe(0);
  });

  it('still ships the default settings and habit tags', () => {
    const data = buildSeed(NOW);
    expect(data.settings.onboarded).toBe(false);
    expect(data.settings.theme).toBe('system');
    expect(data.journalTags.length).toBeGreaterThan(0);
  });
});

describe('a logged week', () => {
  it('scores sleep from the stage blocks', () => {
    const data = stateWithWeekOfData(NOW);
    const d = deriveDay(data, TODAY, NOW);
    expect(d.sleepScore?.status).toBe('scored');
    expect(d.sleepScore?.score).toBe(85);

    const sleep = data.days[TODAY].sleep!;
    const totals = stageTotals(sleep);
    const stageSum = sleep.stages.reduce((sum, block) => sum + (block.endMin - block.startMin), 0);
    expect(totals.inBedMin).toBe(stageSum);
    expect(totals.asleepMin).toBe(stageSum - totals.awakeMin);
  });

  it('reports recovery, strain and target from the baseline', () => {
    const d = deriveDay(stateWithWeekOfData(NOW), TODAY, NOW);
    expect(d.recovery.status).toBe('scored');
    expect(d.recovery.score).toBe(58);
    expect(Math.round(d.strain.score)).toBe(50);
    expect(d.strain.target).toBe(62);
  });

  it('adds up the logged meals into a nutrition score', () => {
    const n = nutritionFor(mealsFor(TODAY), [], 2610);
    expect(n.totals.calories).toBe(2304);
    expect(n.totals.proteinG).toBe(184);
    expect(n.macroPercents).toEqual({ fat: 25, carbs: 42, protein: 32 });
    expect(n.status).toBe('scored');
    expect(n.score).toBe(88);
    expect(n.netEnergy).toBe(-306);
  });

  it('makes the biological-age contributors add up to the headline delta', () => {
    const data = stateWithWeekOfData(NOW);
    const days = data.dayOrder.map((d) => data.days[d]);
    const bio = biologicalAge({
      profile: data.profile,
      chronologicalAge: 28,
      days,
      biomarkers: data.biomarkers,
      vo2max: vo2MaxFromDays(days),
      today: TODAY,
      lastLabDaysAgo: 3,
    });
    expect(bio.status).toBe('scored');
    expect(sumContributors(bio.contributors)).toBe(bio.deltaYears);
  });
});

describe('published invariants', () => {
  it('maps 60% of HR max to Z2', () => {
    // Tanaka at age 30 is 187 bpm: 60% is 112.2, so 112 is still Z1 and 113 is Z2.
    const config = { method: 'maxHr' as const, age: 30, restingHr: 55, manualMaxHr: 0, lactateThresholdHr: 0 } as ZoneConfig;
    expect(maxHrFor(config)).toBe(187);
    expect(zoneIndex(113, config)).toBe(2);
    expect(zoneIndex(112, config)).toBe(1);
    expect(zoneIndex(169, config)).toBe(5);
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
    const data = stateWithWeekOfData(NOW);
    const d = deriveDay(data, TODAY, NOW);
    const baseline = {
      hrvMs: d.baselineHrv,
      hrvSpread: 8,
      rhrBpm: d.baselineRhr,
      rhrSpread: 3,
      rr: 14,
      rrSpread: 1,
      tempC: 36.4,
      nights: 28,
    };
    const base = {
      sleep: d.sleep,
      sleepScore: 85,
      stagedNights: 2,
      baseline,
      hasHrv: true,
      hasRhr: true,
    };
    // A flat week means identical nights, so the composite must still resolve
    // cleanly rather than dividing by a zero spread.
    expect(['scored', 'calibrating']).toContain(recoveryScore(base).status);
    expect(recoveryScore({ ...base, stagedNights: 1 }).status).toBe('insufficient');
    expect(recoveryScore({ ...base, hasHrv: false }).status).toBe('insufficient');
    expect(recoveryScore({ ...base, baseline: { ...baseline, nights: 3 } }).status).toBe('calibrating');
  });

  it('suppresses Sleep Score for a session without stages', () => {
    const sleep = { ...sleepFor(TODAY), stages: [] };
    expect(sleepScore(sleep, { age: 28, sex: 'male', needMin: 540 }).status).toBe('insufficient');
  });

  it('applies the documented nutrition penalties and dead bands', () => {
    const base = mealsFor(TODAY)[0];
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
    const meals = mealsFor(TODAY).map((m) => ({ ...m, source: 'imported' as const }));
    expect(nutritionFor(meals, [], 2500).status).toBe('suppressed');
  });
});

describe('audit regressions', () => {
  it('returns null for an empty or impossible birth date', () => {
    expect(ageFromBirthDate('', '2026-11-14')).toBeNull();
    expect(ageFromBirthDate('2020-02-30', '2026-11-14')).toBeNull();
  });

  it('lowers the strain target when the user is sick', () => {
    expect(targetStrain(41, 50, 'active')).toBe(51);
    expect(targetStrain(41, 50, 'sick')).toBe(41);
  });

  it('does not invent a VO2 max or a fitness-age credit without measurements', () => {
    expect(vo2MaxFromDays([])).toBeNull();
    const noData = lifestyleYears([], 30, null);
    expect(noData.fitnessYears).toBeGreaterThan(-3.5);
  });
});

describe('backup', () => {
  it('round-trips a week of logged data', () => {
    const data = stateWithWeekOfData(NOW);
    const parsed = parseBackup(JSON.stringify(createBackup(data)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.profile.name).toBe(data.profile.name);
      expect(Object.keys(parsed.data.days)).toHaveLength(data.dayOrder.length);
      expect(parsed.data.days[TODAY].meals).toHaveLength(data.days[TODAY].meals.length);
    }
  });

  it('rejects foreign or incomplete backups', () => {
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'other' })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'bene', version: 1, data: {} })).ok).toBe(false);
  });
});
