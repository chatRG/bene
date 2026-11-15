import type {
  AppStateData,
  AppSettings,
  Biomarker,
  ChatThread,
  DayMetrics,
  DayRecord,
  HeartRateSample,
  JournalEntry,
  JournalTag,
  MealEntry,
  MuscleGroup,
  Routine,
  SleepSession,
  SleepStageBlock,
  UserProfile,
  Workout,
} from './types';

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0);
const at = (date: Date, hour: number, minute: number, dayOffset = 0) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset, hour, minute, 0).toISOString();

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStageBlocks(totals: { awake: number; rem: number; core: number; deep: number }): SleepStageBlock[] {
  const blocks: SleepStageBlock[] = [];
  let cursor = 0;
  const push = (stage: SleepStageBlock['stage'], mins: number) => {
    if (mins <= 0) return;
    blocks.push({ stage, startMin: cursor, endMin: cursor + mins });
    cursor += mins;
  };
  const awakeStart = Math.min(6, totals.awake * 0.12);
  let awakeLeft = totals.awake - awakeStart;
  push('awake', awakeStart);
  const perCycleCore = totals.core / 8;
  const perCycleDeep = totals.deep / 3.97;
  const perCycleRem = totals.rem / 3.85;
  let coreLeft = totals.core;
  let deepLeft = totals.deep;
  let remLeft = totals.rem;
  for (let i = 0; i < 4; i++) {
    const coreA = perCycleCore * (0.85 + i * 0.06);
    const coreB = perCycleCore * (1.15 - i * 0.06);
    const deep = perCycleDeep * (i === 0 ? 1.15 : i === 3 ? 0.82 : 1);
    const rem = perCycleRem * (i === 0 ? 0.7 : i === 3 ? 1.15 : 1);
    push('core', coreA);
    push('deep', deep);
    push('core', coreB);
    push('rem', rem);
    coreLeft -= coreA + coreB;
    deepLeft -= deep;
    remLeft -= rem;
    if (i < 3) {
      const w = Math.min(awakeLeft * 0.22, 6.5);
      push('awake', w);
      awakeLeft -= w;
    }
  }
  push('core', Math.max(0, coreLeft));
  push('deep', Math.max(0, deepLeft));
  push('rem', Math.max(0, remLeft));
  push('awake', Math.max(0, awakeLeft));
  return blocks;
}

function makeSleep(
  date: string,
  startHour: number,
  startMinute: number,
  inBedMin: number,
  opts: {
    hrv: number;
    rhr: number;
    rr: number;
    spo2: number;
    temp: number;
    minHr: number;
    timeToFallAsleep: number | null;
    source: string;
    stageMins?: { awake: number; rem: number; core: number; deep: number };
  },
): SleepSession {
  const deep = opts.stageMins?.deep ?? Math.round(inBedMin * (0.14 + (opts.hrv % 3) * 0.008));
  const rem = opts.stageMins?.rem ?? Math.round(inBedMin * 0.21);
  const awake = opts.stageMins?.awake ?? Math.round(inBedMin * 0.075);
  const core = opts.stageMins?.core ?? Math.max(60, inBedMin - deep - rem - awake);
  const startDate = new Date(`${date}T12:00:00`);
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), startHour, startMinute);
  if (startHour >= 12) start.setDate(start.getDate() - 1);
  const end = new Date(start.getTime() + inBedMin * 60000);
  return {
    id: `sleep-${date}`,
    date,
    start: start.toISOString(),
    end: end.toISOString(),
    stages: buildStageBlocks({ awake, rem, core, deep }),
    source: opts.source,
    hrvMs: Math.round(opts.hrv * 10) / 10,
    rhrBpm: Math.round(opts.rhr * 10) / 10,
    respiratoryRate: Math.round(opts.rr * 10) / 10,
    spo2: opts.spo2,
    wristTempC: Math.round(opts.temp * 100) / 100,
    minHrBpm: opts.minHr,
    timeToFallAsleepMin: opts.timeToFallAsleep,
    alarm:
      opts.timeToFallAsleep != null
        ? { type: 'smart', time: `${pad(end.getHours())}:${pad(end.getMinutes())}`, windowMin: 30, enabled: true }
        : null,
    imported: false,
  };
}

function hrSamplesForDay(_date: Date, workout: Workout | null, seed: number): HeartRateSample[] {
  const rnd = mulberry32(seed);
  const samples: HeartRateSample[] = [];
  const workoutStartMin = workout ? new Date(workout.start).getHours() * 60 + new Date(workout.start).getMinutes() : -1;
  for (let minute = 0; minute < 1440; minute += 10) {
    let bpm: number;
    const asleep = minute < 7 * 60 || minute > 23 * 60;
    if (asleep) bpm = 49 + rnd() * 7;
    else if (workout && minute >= workoutStartMin && minute <= workoutStartMin + workout.durationMin) {
      bpm = (workout.avgHr ?? 140) + (rnd() - 0.5) * 18;
    } else if (minute < 9 * 60) bpm = 62 + rnd() * 8;
    else if (minute < 17 * 60) bpm = 66 + rnd() * 12;
    else if (minute < 21 * 60) bpm = 70 + rnd() * 12;
    else bpm = 60 + rnd() * 9;
    samples.push({ minute, bpm: Math.round(bpm) });
  }
  return samples;
}

function makeStrength(date: string, dayOffsetHour: number, name: string, groups: [string, MuscleGroup][]): Workout {
  const exercises = groups.map(([exName, muscle], i) => ({
    id: `ex-${date}-${i}`,
    name: exName,
    muscle,
    sets: Array.from({ length: 4 }, (_, s) => ({
      id: `set-${date}-${i}-${s}`,
      reps: [8, 8, 8, 6][s],
      weightKg: [60, 65, 70, 72][s] + i * 5,
      rpe: [7, 7.5, 8, 8.5][s],
      type: 'normal' as const,
      completed: true,
    })),
  }));
  return {
    id: `workout-${date}-strength`,
    kind: 'strength',
    name,
    date,
    start: at(new Date(`${date}T12:00:00`), dayOffsetHour, 15),
    durationMin: 48,
    distanceKm: null,
    avgHr: 118,
    maxHr: 152,
    calories: 330,
    strain: 42,
    source: 'Apple Watch',
    imported: false,
    zoneMinutes: [8, 14, 16, 8, 2, 0],
    exercises,
  };
}

function makeRun(date: string, startHour: number, distanceKm: number, durationMin: number, avgHr: number, name: string): Workout {
  return {
    id: `workout-${date}-run`,
    kind: 'run',
    name,
    date,
    start: at(new Date(`${date}T12:00:00`), startHour, 10),
    durationMin,
    distanceKm,
    avgHr,
    maxHr: avgHr + 19,
    calories: Math.round(distanceKm * 64),
    strain: Math.round(30 * Math.log(1 + (durationMin * 3.2) / 55)),
    source: 'Apple Watch',
    imported: false,
    zoneMinutes: [2, Math.round(durationMin * 0.18), Math.round(durationMin * 0.32), Math.round(durationMin * 0.34), Math.round(durationMin * 0.14), 0],
  };
}

function makeMeal(
  date: string,
  name: string,
  time: string,
  kcal: number,
  p: number,
  c: number,
  f: number,
  extra: Partial<MealEntry> = {},
): MealEntry {
  return {
    id: `meal-${date}-${time}-${name.replace(/\s+/g, '-').toLowerCase()}`,
    name,
    date,
    time,
    calories: kcal,
    proteinG: p,
    carbsG: c,
    fatG: f,
    fiberG: Math.round((c / 20) * 2),
    vegGrams: 0,
    fruitCups: 0,
    wholeGrainServings: 0,
    healthyOilPctOfCalories: 18,
    nutsGrams: 0,
    omega3Mg: 0,
    redMeatGrams: 0,
    processedMeatGrams: 0,
    alcoholGrams: 0,
    sodiumMg: 420,
    addedSugarG: 4,
    source: 'bene',
    emoji: '🍽️',
    loggedVia: 'search',
    ...extra,
  };
}

export function buildSeed(now = new Date()): AppStateData {
  const today = dateKey(now);
  const rnd = mulberry32(20261114);
  const dayOrder: string[] = [];
  for (let i = 59; i >= 0; i--) dayOrder.push(dateKey(addDays(now, -i)));

  const tags: JournalTag[] = [
    { id: 'alcohol', label: 'Alcohol', kind: 'yesno', pinned: true, category: 'lifestyle', icon: '🍷' },
    { id: 'caffeine', label: 'Caffeine after 2pm', kind: 'yesno', pinned: true, category: 'lifestyle', icon: '☕' },
    { id: 'mood', label: 'Mood', kind: 'yesneutralno', pinned: true, category: 'mind', icon: '🙂' },
    { id: 'stretch', label: 'Stretching', kind: 'yesno', pinned: true, category: 'recovery', icon: '🧘' },
    { id: 'hydrated', label: 'Hydration', kind: 'numeric', unit: 'L', min: 0, max: 5, pinned: false, category: 'nutrition', icon: '💧' },
    { id: 'screen', label: 'Screen time', kind: 'numeric', unit: 'h', min: 0, max: 12, pinned: false, category: 'lifestyle', icon: '📱' },
    { id: 'vitamins', label: 'Vitamins', kind: 'yesno', pinned: false, category: 'nutrition', icon: '💊' },
    { id: 'lateMeal', label: 'Late meal', kind: 'yesno', pinned: false, category: 'nutrition', icon: '🌙' },
    { id: 'sauna', label: 'Sauna', kind: 'yesno', pinned: false, category: 'recovery', icon: '🔥' },
    { id: 'reading', label: 'Reading before bed', kind: 'yesno', pinned: false, category: 'mind', icon: '📖' },
    { id: 'daylight', label: 'Daylight', kind: 'yesno', pinned: false, category: 'lifestyle', icon: '☀️' },
    { id: 'sleepNoise', label: 'Sleeping noise', kind: 'numeric', unit: 'dB', min: 0, max: 100, pinned: false, category: 'recovery', autoOnly: true, icon: '🔊' },
    { id: 'energy', label: 'Energy', kind: 'numeric', unit: '/10', min: 1, max: 10, pinned: false, category: 'mind', icon: '⚡' },
    { id: 'stress', label: 'Stress', kind: 'numeric', unit: '/10', min: 1, max: 10, pinned: false, category: 'mind', icon: '😮‍💨' },
    { id: 'coldplunge', label: 'Cold plunge', kind: 'yesno', pinned: false, category: 'custom', icon: '🧊' },
  ];

  const journalEntries: JournalEntry[] = [];
  dayOrder.forEach((date, i) => {
    if (i >= dayOrder.length - 14) {
      journalEntries.push({
        id: `j-alcohol-${date}`,
        tagId: 'alcohol',
        date,
        value: i % 3 === 0 ? 'yes' : 'no',
        at: at(new Date(`${date}T12:00:00`), 21, 0),
      });
    }
    if (i >= dayOrder.length - 10) {
      journalEntries.push({
        id: `j-mood-${date}`,
        tagId: 'mood',
        date,
        value: i % 4 === 0 ? 'neutral' : i % 5 === 0 ? 'no' : 'yes',
        at: at(new Date(`${date}T12:00:00`), 20, 30),
      });
    }
    journalEntries.push({
      id: `j-hydrated-${date}`,
      tagId: 'hydrated',
      date,
      value: Math.round((2.1 + rnd() * 1.1) * 10) / 10,
      at: at(new Date(`${date}T12:00:00`), 19, 45),
    });
  });

  const days: Record<string, DayRecord> = {};
  for (let idx = 0; idx < dayOrder.length; idx++) {
    const date = dayOrder[idx];
    const d = new Date(`${date}T12:00:00`);
    const dow = d.getDay();
    const isToday = date === today;
    const workouts: Workout[] = [];

    if (!isToday) {
      if (dow === 1 || dow === 4) workouts.push(makeStrength(date, 18, dow === 1 ? 'Upper Body Strength' : 'Lower Body Strength', dow === 1 ? [['Bench Press', 'chest'], ['Row', 'back'], ['Overhead Press', 'shoulders'], ['Curl', 'biceps']] : [['Back Squat', 'quads'], ['Romanian Deadlift', 'hamstrings'], ['Hip Thrust', 'glutes'], ['Calf Raise', 'calves']]));
      if (dow === 2) workouts.push(makeRun(date, 7, 5.2, 31, 146, 'Easy Run'));
      if (dow === 5) workouts.push(makeRun(date, 7, 6.1, 34, 152, 'Tempo Run'));
      if (dow === 6) workouts.push(makeRun(date, 9, 10.4, 62, 148, 'Long Run'));
      if (dow === 0) workouts.push(makeRun(date, 10, 4.4, 58, 112, 'Trail Hike'));
      if (dow === 3) {
        const w = makeRun(date, 18, 2.6, 43, 118, 'Recovery Walk');
        w.kind = 'walk';
        workouts.push(w);
      }
    }

    if (isToday) {
      const run = makeRun(date, 7, 6.4, 32, 152, 'Tempo Run');
      run.start = at(now, 7, 10);
      workouts.push(run);
    }

    const inBed = isToday ? 490 : Math.round(430 + rnd() * 52);
    const stageMins = isToday ? { awake: 67, rem: 99, core: 268, deep: 56 } : undefined;
    const sleep = makeSleep(date, isToday ? 0 : 23, isToday ? 34 : Math.round(8 + rnd() * 40), inBed, {
      hrv: isToday ? 57.5 : 48 + rnd() * 16,
      rhr: isToday ? 59.2 : 52 + rnd() * 5.5,
      rr: 13.8 + rnd() * 1.8,
      spo2: Math.round(96 + rnd() * 2),
      temp: 36.3 + rnd() * 0.35,
      minHr: isToday ? 51 : Math.round(45 + rnd() * 6),
      timeToFallAsleep: isToday ? 15 : Math.round(6 + rnd() * 18),
      source: idx % 9 === 0 ? 'Oura Ring' : 'Apple Watch',
      stageMins,
    });

    const metrics: DayMetrics = {
      date,
      steps: isToday ? 6240 : Math.round(3200 + rnd() * 4200),
      activeCalories: isToday ? 620 : Math.round(280 + rnd() * 520),
      totalCalories: isToday ? 2561 : Math.round(2100 + rnd() * 700),
      exerciseMinutes: isToday ? 32 : workouts.reduce((a, w) => a + w.durationMin, 0),
      daylightMinutes: Math.round(20 + rnd() * 70),
      hydrationMl: isToday ? 1800 : Math.round(1200 + rnd() * 1400),
      caffeineMg: isToday ? 180 : Math.round(60 + rnd() * 220),
      alcoholGrams: 0,
      hrSamples: hrSamplesForDay(d, workouts[0] ?? null, 1000 + idx),
      daytimeHrvMs: Math.round(38 + rnd() * 16),
      stressSamples: [],
      tempDeviationC: Math.round((rnd() - 0.5) * 0.4 * 100) / 100,
      wearMinutes: isToday ? Math.round((now.getHours() + now.getMinutes() / 60) * 60) : 1020 + Math.round(rnd() * 120),
    };
    metrics.stressSamples = metrics.hrSamples
      .filter((s) => s.minute >= 360 && s.minute <= 1380)
      .filter((_, i) => i % 2 === 0)
      .map((s) => ({
        minute: s.minute,
        score: Math.max(0, Math.min(100, Math.round(45 + (s.bpm - (sleep.rhrBpm ?? 55) - 14) * 1.1))),
      }));

    const meals: MealEntry[] = isToday
      ? [
          makeMeal(date, 'Greek yogurt, berries & granola', '07:40', 520, 35, 55, 18, {
            vegGrams: 0,
            fruitCups: 1,
            wholeGrainServings: 1,
            nutsGrams: 10,
            omega3Mg: 120,
            sodiumMg: 180,
            addedSugarG: 9,
            healthyOilPctOfCalories: 10,
            emoji: '🥣',
            loggedVia: 'search',
          }),
          makeMeal(date, 'Chicken grain bowl', '12:35', 780, 55, 80, 24, {
            vegGrams: 45,
            wholeGrainServings: 0.5,
            healthyOilPctOfCalories: 24,
            omega3Mg: 80,
            sodiumMg: 640,
            addedSugarG: 3,
            fiberG: 12,
            emoji: '🥗',
            loggedVia: 'photo',
          }),
          makeMeal(date, 'Apple & almond butter', '16:10', 310, 10, 35, 15, {
            fruitCups: 1,
            nutsGrams: 22,
            healthyOilPctOfCalories: 22,
            sodiumMg: 40,
            addedSugarG: 2,
            emoji: '🍎',
            loggedVia: 'search',
          }),
          makeMeal(date, 'Salmon, rice & broccoli', '19:30', 694, 84, 72, 10, {
            vegGrams: 60,
            wholeGrainServings: 0,
            omega3Mg: 520,
            sodiumMg: 520,
            addedSugarG: 1,
            healthyOilPctOfCalories: 16,
            fiberG: 7,
            emoji: '🐟',
            loggedVia: 'custom',
          }),
        ]
      : [
          makeMeal(date, 'Overnight oats & berries', '08:10', 480, 22, 66, 14, { fruitCups: 0.8, wholeGrainServings: 1, vegGrams: 0, emoji: '🥣' }),
          makeMeal(date, 'Turkey sandwich & greens', '13:05', 640, 38, 58, 24, { vegGrams: 55, wholeGrainServings: 1, emoji: '🥪' }),
          makeMeal(date, 'Salmon & roasted vegetables', '19:20', 760, 52, 60, 34, { vegGrams: 140, omega3Mg: 400, emoji: '🐟' }),
        ];

    days[date] = { date, sleep, metrics, workouts, meals, journal: journalEntries.filter((j) => j.date === date) };
  }

  // Today's nutrition must land exactly on the demo values (2,304 kcal, 26/42/32).
  const todayMeals = days[today].meals;
  const totalP = todayMeals.reduce((a, m) => a + m.proteinG, 0);
  const totalC = todayMeals.reduce((a, m) => a + m.carbsG, 0);
  const totalF = todayMeals.reduce((a, m) => a + m.fatG, 0);
  const kcal = totalP * 4 + totalC * 4 + totalF * 9;
  if (kcal !== 2307) {
    const scale = 2304 / kcal;
    for (const m of todayMeals) {
      m.calories = Math.round(m.calories * scale);
    }
  }

  const biomarkers: Biomarker[] = [
    { id: 'albumin', name: 'Albumin', value: 46, unit: 'g/L', optimalLow: 40, optimalHigh: 50, category: 'liver', phenoAge: true, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'creatinine', name: 'Creatinine', value: 0.92, unit: 'mg/dL', optimalLow: 0.7, optimalHigh: 1.2, category: 'kidney', phenoAge: true, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'glucose', name: 'Glucose', value: 88, unit: 'mg/dL', optimalLow: 70, optimalHigh: 99, category: 'metabolic', phenoAge: true, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'crp', name: 'hs-CRP', value: 0.6, unit: 'mg/L', optimalLow: 0, optimalHigh: 1, category: 'inflammation', phenoAge: true, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'lymphocyte', name: 'Lymphocyte %', value: 32, unit: '%', optimalLow: 20, optimalHigh: 40, category: 'blood', phenoAge: true, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'mcv', name: 'MCV', value: 89, unit: 'fL', optimalLow: 80, optimalHigh: 100, category: 'blood', phenoAge: true, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'rdw', name: 'RDW', value: 12.8, unit: '%', optimalLow: 11.5, optimalHigh: 14.5, category: 'blood', phenoAge: true, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'alp', name: 'Alkaline phosphatase', value: 72, unit: 'U/L', optimalLow: 40, optimalHigh: 120, category: 'liver', phenoAge: true, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'wbc', name: 'White blood cells', value: 6.1, unit: '10³/µL', optimalLow: 4, optimalHigh: 11, category: 'blood', phenoAge: true, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'apob', name: 'ApoB', value: 78, unit: 'mg/dL', optimalLow: 40, optimalHigh: 80, category: 'lipids', phenoAge: false, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'hba1c', name: 'HbA1c', value: 5.1, unit: '%', optimalLow: 4.5, optimalHigh: 5.4, category: 'metabolic', phenoAge: false, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'vitd', name: 'Vitamin D', value: 38, unit: 'ng/mL', optimalLow: 30, optimalHigh: 60, category: 'vitamins', phenoAge: false, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'ferritin', name: 'Ferritin', value: 120, unit: 'ng/mL', optimalLow: 40, optimalHigh: 200, category: 'blood', phenoAge: false, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'ldl', name: 'LDL cholesterol', value: 92, unit: 'mg/dL', optimalLow: 50, optimalHigh: 100, category: 'lipids', phenoAge: false, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'hdl', name: 'HDL cholesterol', value: 58, unit: 'mg/dL', optimalLow: 45, optimalHigh: 80, category: 'lipids', phenoAge: false, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'triglycerides', name: 'Triglycerides', value: 85, unit: 'mg/dL', optimalLow: 40, optimalHigh: 120, category: 'lipids', phenoAge: false, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'tsh', name: 'TSH', value: 1.8, unit: 'mIU/L', optimalLow: 0.5, optimalHigh: 3, category: 'metabolic', phenoAge: false, recordedAt: dateKey(addDays(now, -19)) },
    { id: 'egfr', name: 'eGFR', value: 105, unit: 'mL/min', optimalLow: 90, optimalHigh: 130, category: 'kidney', phenoAge: false, recordedAt: dateKey(addDays(now, -19)) },
  ];

  const chats: ChatThread[] = [
    {
      id: 'chat-recovery',
      title: 'Recovery check-in',
      createdAt: at(now, 8, 12),
      updatedAt: at(now, 8, 16),
      ghost: false,
      pinned: true,
      model: 'standard',
      messages: [
        { id: 'm1', role: 'user', text: 'How should I train today? My recovery looks low.', at: at(now, 8, 12) },
        {
          id: 'm2',
          role: 'assistant',
          text: "Your recovery is 41% this morning. Overnight HRV was 57.5 ms against a 55.3 ms baseline, resting heart rate is up to 59.2 bpm, and sleep scored 74%. The elevated resting HR and the mediocre sleep are doing the damage — HRV itself is close to your usual range.\n\nI'd swap the tempo run for 30–40 minutes of easy Zone 2, or take a full rest day. Keep tomorrow flexible too; one down day now tends to cost less than a week of pushing through.",
          at: at(now, 8, 13),
          followUps: ['Build me an easy Zone 2 session', 'Why is my HRV low?', 'Plan the rest of my week'],
        },
        { id: 'm3', role: 'user', text: 'Makes sense. Can I still lift upper body?', at: at(now, 8, 15) },
        {
          id: 'm4',
          role: 'assistant',
          text: 'Yes — a short upper-body session is reasonable, but keep it to 2–3 sets per exercise at RPE 7 or below. Avoid training to failure today. Your chest and shoulders are still carrying some fatigue from Monday, so prioritize back and arms if you want the most useful session.',
          at: at(now, 8, 16),
        },
      ],
    },
    {
      id: 'chat-plan',
      title: '10K training plan',
      createdAt: at(now, -3, 19, 30),
      updatedAt: at(now, -3, 19, 41),
      ghost: false,
      pinned: false,
      model: 'upgraded',
      messages: [
        { id: 'm5', role: 'user', text: 'Build me a 6-week 10K plan around my current training.', at: at(now, -3, 19, 30) },
        {
          id: 'm6',
          role: 'assistant',
          text: "I've built a 6-week plan that keeps your Monday/Thursday strength sessions and adds two quality runs plus a long run. Weekly volume starts at 24 km and peaks at 38 km.\n\nYour recent tempo pace (8:55/mi) suggests a 10K goal around 52 minutes. I'll adapt the plan each week using your recovery score — if recovery drops below 40%, quality sessions move to Zone 2 automatically.",
          at: at(now, -3, 19, 41),
          followUps: ['Show week 1', 'Add it to my calendar', 'Make it a 5K plan instead'],
        },
      ],
    },
  ];

  const routines: Routine[] = [
    {
      id: 'routine-tempo',
      name: 'Tempo Run',
      subtitle: 'Outdoor Run',
      kind: 'run',
      durationMin: 40,
      blocks: [
        { id: 'b1', kind: 'warmup', title: 'Warmup', durationMin: 10, target: 'Heart Rate: 130–145 BPM' },
        { id: 'b2', kind: 'repeat', title: 'Repeat ×3', durationMin: 24, repeats: 3, target: 'Tempo 6m · Recovery 2m' },
        { id: 'b3', kind: 'cooldown', title: 'Cooldown', durationMin: 6, target: 'Open goal' },
      ],
      exercises: [],
      scheduledDates: [dateKey(addDays(now, 2))],
      completedDates: [],
      skippedDates: [],
    },
    {
      id: 'routine-upper',
      name: 'Upper Strength',
      subtitle: 'Strength',
      kind: 'strength',
      durationMin: 45,
      blocks: [{ id: 'sb1', kind: 'steady', title: 'Main lifts', durationMin: 35, target: 'RPE 7–8' }],
      exercises: [
        { id: 're1', name: 'Bench Press', muscle: 'chest', restSec: 120, sets: [8, 8, 8].map((reps, i) => ({ id: `rs-${i}`, reps, weightKg: 65 + i * 2.5, type: 'normal' as const })) },
        { id: 're2', name: 'Barbell Row', muscle: 'back', restSec: 120, sets: [10, 10, 10].map((reps, i) => ({ id: `rs2-${i}`, reps, weightKg: 50 + i * 2.5, type: 'normal' as const })) },
      ],
      scheduledDates: [dateKey(addDays(now, 1))],
      completedDates: [],
      skippedDates: [],
    },
  ];

  const settings: AppSettings = {
    theme: 'system',
    onboarded: false,
    demoMode: true,
    activeTabs: { fitness: true, journal: true, biology: true },
    homeCards: ['scores', 'coach', 'stress', 'sleep', 'timeline', 'nutrition', 'journal'],
    homeOrder: ['scores', 'coach', 'stress', 'sleep', 'timeline', 'nutrition', 'journal'],
    sleepGoalMin: 552,
    calorieGoal: 2504,
    proteinGoalG: 180,
    hrvMethod: 'rmssd',
    hrvWindow: 'remDeep',
    rhrWindow: 'entireSleep',
    tempMethod: 'wrist',
    hrZoneMethod: 'maxHr',
    manualMaxHr: 190,
    lactateThresholdHr: 168,
    aiPersonality: 'supportive',
    aiEnabled: true,
    ghostDefault: false,
    ghostRetentionMin: 60,
    aiModel: 'standard',
    expandedThinking: false,
    suggestedFollowUps: true,
    excludedContributors: [],
    nutritionUnits: 'percent',
    activityStatus: 'active',
    activityStatusUntil: null,
    activityStatusNote: '',
    autoBackup: true,
    lastBackupAt: null,
  };

  const profile: UserProfile = {
    name: 'John Carter',
    email: 'john@example.com',
    sex: 'male',
    birthDate: '1998-01-20',
    heightCm: 180,
    weightKg: 76.4,
    goal: 'performance',
    createdAt: at(now, 7, 30),
  };

  return {
    profile,
    settings,
    days,
    dayOrder,
    journalTags: tags,
    journalEntries,
    biomarkers,
    healthRecords: [
      { id: 'rec-1', name: 'Comprehensive metabolic panel.pdf', kind: 'bloodwork', uploadedAt: at(now, -19, 10, 20), status: 'ready', sizeKb: 412, biomarkerCount: 9 },
      { id: 'rec-2', name: 'Lipid panel — Oct.pdf', kind: 'bloodwork', uploadedAt: at(now, -34, 9, 5), status: 'ready', sizeKb: 198, biomarkerCount: 5 },
    ],
    chats,
    routines,
    activityEvents: [{ id: 'act-1', status: 'active', until: null, at: at(now, -20, 8), note: 'Feeling good' }],
    seededAt: at(now, 7, 30),
  };
}

export function emptyDay(date: string): DayRecord {
  return {
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
}
