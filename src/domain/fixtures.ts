import type { AppStateData, Biomarker, DayRecord, MealEntry, SleepSession } from './types';
import { buildSeed, dateKey, emptyDay } from './seed';

/**
 * Fixtures written by hand for the tests.
 *
 * The app starts empty for a real person, so scoring tests cannot lean on a
 * seeded dataset. Each case below states the numbers the scores are meant to
 * explain, which is the point of a test: the input is visible, not produced by
 * a generator.
 */

/** A night of sleep as stage blocks, in minutes from lights out. */
function night(date: string, blocks: [SleepSession['stages'][number]['stage'], number][]): SleepSession {
  let cursor = 0;
  const stages = blocks.map(([stage, minutes]) => {
    const block = { stage, startMin: cursor, endMin: cursor + minutes };
    cursor += minutes;
    return block;
  });
  const startAt = new Date(`${date}T23:10:00`);
  return {
    id: `sleep-${date}`,
    date,
    start: startAt.toISOString(),
    end: new Date(startAt.getTime() + cursor * 60000).toISOString(),
    stages,
    source: 'test',
    hrvMs: 57.5,
    rhrBpm: 52,
    respiratoryRate: 14,
    spo2: 97,
    wristTempC: 36.4,
    minHrBpm: 48,
    timeToFallAsleepMin: null,
    alarm: null,
  };
}

const MEALS: Omit<MealEntry, 'id' | 'date'>[] = [
  {
    name: 'Oats, berries and yogurt',
    time: '08:10',
    calories: 520,
    proteinG: 32,
    carbsG: 66,
    fatG: 14,
    fiberG: 9,
    vegGrams: 0,
    fruitCups: 1.5,
    wholeGrainServings: 1,
    healthyOilPctOfCalories: 10,
    nutsGrams: 15,
    omega3Mg: 300,
    redMeatGrams: 0,
    processedMeatGrams: 0,
    alcoholGrams: 0,
    sodiumMg: 420,
    addedSugarG: 6,
    source: 'bene',
    emoji: '🥣',
  },
  {
    name: 'Chicken, rice and greens',
    time: '13:05',
    calories: 890,
    proteinG: 68,
    carbsG: 92,
    fatG: 24,
    fiberG: 11,
    vegGrams: 190,
    fruitCups: 0,
    wholeGrainServings: 0,
    healthyOilPctOfCalories: 25,
    nutsGrams: 0,
    omega3Mg: 150,
    redMeatGrams: 0,
    processedMeatGrams: 0,
    alcoholGrams: 0,
    sodiumMg: 780,
    addedSugarG: 2,
    source: 'bene',
    emoji: '🍗',
  },
  {
    name: 'Salmon, potatoes and salad',
    time: '19:40',
    calories: 894,
    proteinG: 84,
    carbsG: 82,
    fatG: 26,
    fiberG: 10,
    vegGrams: 210,
    fruitCups: 0.5,
    wholeGrainServings: 0,
    healthyOilPctOfCalories: 30,
    nutsGrams: 10,
    omega3Mg: 2200,
    redMeatGrams: 0,
    processedMeatGrams: 0,
    alcoholGrams: 0,
    sodiumMg: 640,
    addedSugarG: 3,
    source: 'bene',
    emoji: '🐟',
  },
];

/** Three meals, 2,304 kcal — the macro split a nutrition score is built on. */
export function mealsFor(date: string): MealEntry[] {
  return MEALS.map((meal, i) => ({ ...meal, id: `meal-${date}-${i}`, date }));
}

/**
 * One staged night: 7h 03m asleep inside 8h 10m in bed, so the sleep score and
 * the recovery gate both have real stage data to work with.
 */
export function sleepFor(date: string): SleepSession {
  return night(date, [
    ['awake', 6],
    ['core', 78],
    ['deep', 62],
    ['core', 84],
    ['rem', 55],
    ['core', 96],
    ['deep', 48],
    ['rem', 62],
    ['core', 68],
    ['awake', 11],
  ]);
}

/**
 * A nine-marker panel. Biological Age needs seven measured markers before it
 * will report a status instead of "calibrating", so the fixture carries a full
 * standard panel rather than a token few.
 */
export function biomarkersFor(date: string): Biomarker[] {
  const panel: [string, string, number, string, number, number, Biomarker['category']][] = [
    ['albumin', 'Albumin', 45.2, 'g/L', 40, 50, 'blood'],
    ['creatinine', 'Creatinine', 0.92, 'mg/dL', 0.7, 1.1, 'kidney'],
    ['glucose', 'Glucose', 88, 'mg/dL', 70, 95, 'metabolic'],
    ['crp', 'hs-CRP', 0.6, 'mg/L', 0, 1, 'inflammation'],
    ['lymphocyte', 'Lymphocyte %', 32, '%', 25, 40, 'blood'],
    ['mcv', 'MCV', 89, 'fL', 82, 95, 'blood'],
    ['rdw', 'RDW', 12.9, '%', 11.5, 13.5, 'blood'],
    ['alp', 'Alkaline phosphatase', 72, 'U/L', 44, 121, 'liver'],
    ['wbc', 'White blood cells', 5.8, '10³/µL', 4, 7.5, 'blood'],
  ];
  return panel.map(([id, name, value, unit, optimalLow, optimalHigh, category]) => ({
    id,
    name,
    value,
    unit,
    optimalLow,
    optimalHigh,
    category,
    phenoAge: true,
    recordedAt: date,
  }));
}

/** A profile with a birth date, so age-based scores are scorable. */
export const PROFILE = {
  name: 'Test User',
  sex: 'male' as const,
  birthDate: '1998-01-20',
  heightCm: 180,
  weightKg: 76.4,
  goal: 'performance' as const,
  createdAt: '2026-11-01T07:30:00.000Z',
};

const METRICS = {
  steps: 9120,
  activeCalories: 710,
  totalCalories: 2610,
  exerciseMinutes: 52,
  daylightMinutes: 46,
  hydrationMl: 2400,
  caffeineMg: 190,
  alcoholGrams: 0,
  hrSamples: [],
  daytimeHrvMs: 52,
  stressSamples: [],
  tempDeviationC: 0.1,
  // Minutes of wear, not hours: a full day of tracking is well over 10 hours,
  // which is the threshold Biological Age uses for a "worn" day.
  wearMinutes: 930,
};

/** A day with sleep, meals and movement — the input the scores are tested on. */
export function dayWithData(date: string): DayRecord {
  return {
    ...emptyDay(date),
    sleep: sleepFor(date),
    metrics: { ...METRICS, date },
    workouts: [
      {
        id: `w-${date}`,
        kind: 'run',
        name: 'Threshold run',
        date,
        start: `${date}T06:10:00.000Z`,
        durationMin: 52,
        distanceKm: 9.4,
        avgHr: 154,
        maxHr: 172,
        calories: 610,
        strain: 14.2,
        source: 'test',
        imported: false,
        zoneMinutes: [6, 22, 14, 10, 0, 0],
      },
    ],
    meals: mealsFor(date),
    journal: [],
  };
}

/**
 * A week of complete, identical nights. Recovery needs two staged nights before
 * it will score at all, and five nights before it will stop calibrating, so the
 * fixture states that week explicitly instead of hiding it in a generator.
 */
export function stateWithWeekOfData(now = new Date()): AppStateData {
  const days: AppStateData['days'] = {};
  const dayOrder: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = dateKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
    days[date] = dayWithData(date);
    dayOrder.push(date);
  }
  const seed = buildSeed(now);
  return {
    ...seed,
    profile: { ...seed.profile, ...PROFILE },
    days,
    dayOrder,
    biomarkers: biomarkersFor(dateKey(now)),
    seededAt: now.toISOString(),
  };
}
